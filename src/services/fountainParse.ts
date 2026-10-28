// Fountain -> BERLY, via fountain-js. The library does the lexing; this file
// only maps its tokens onto ElementType and the title page.
import { Fountain } from 'fountain-js';
import type { ElementType, ScriptElement, TitlePage } from '@/model/types';
import { newElement } from '@/model/types';
import type { ImportedScreenplay } from '@/services/screenplayImport';

const BODY_TYPES: Record<string, ElementType> = {
  scene_heading: 'scene',
  action: 'action',
  character: 'character',
  parenthetical: 'parenthetical',
  dialogue: 'dialogue',
  transition: 'transition',
  lyrics: 'lyrics',
  centered: 'centered',
};

/** Structural markers rather than content — they open and close dialogue
 * blocks, which our flat element list expresses by adjacency alone. */
const STRUCTURAL = new Set([
  'dialogue_begin',
  'dialogue_end',
  'dual_dialogue_begin',
  'dual_dialogue_end',
  'spaces',
  'line_break',
]);

const TITLE_FIELDS: Record<string, keyof TitlePage> = {
  title: 'title',
  credit: 'credit',
  author: 'author',
  authors: 'author',
  contact: 'contact',
  draft_date: 'draftDate',
};

/** A note lifted off a line of script, keyed by that line as it reads
 * without the note. */
interface LiftedNote {
  key: string;
  note: string;
}

const INLINE_NOTE = /\[\[([\s\S]*?)]]/g;

/** How a source line and the element text fountain-js makes of it compare:
 * without the forcing marks (. @ > ~ !), the centring "<", case or spacing. */
function lineKey(line: string): string {
  return line
    .replace(/^[\s.@>~!]+/, '')
    .replace(/[\s<]+$/, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Inline notes have to come out before fountain-js sees the text: "BOB
 * [[note]]" is no longer a cue, nor "(beat) [[note]]" a parenthetical. Each is
 * remembered with the line it sat on and handed back to the element that line
 * becomes. A note alone in its paragraph is left in — fountain-js reads it as
 * a note token, which attaches to the element before it. So is anything on
 * the title page, whose fields have no notes. */
function liftInlineNotes(text: string): { text: string; notes: LiftedNote[] } {
  const notes: LiftedNote[] = [];
  const lines = text.split(/\r?\n/);
  // A title page is a leading "Key: value" block, up to the first blank line.
  let body = /^\s*[A-Za-z][\w ]*:/.test(lines[0] ?? '')
    ? lines.findIndex((line) => !line.trim())
    : 0;
  if (body === -1) body = lines.length;

  const out = lines.map((line, i) => {
    if (i < body || !line.includes('[[')) return line;
    const found: string[] = [];
    const stripped = line.replace(INLINE_NOTE, (_, note: string) => {
      found.push(note.trim());
      return '';
    });
    if (!stripped.trim() || found.length === 0) return line;
    for (const note of found) if (note) notes.push({ key: lineKey(stripped), note });
    return stripped.trimEnd();
  });
  return { text: out.join('\n'), notes };
}

function addNote(element: ScriptElement, note: string) {
  element.note = element.note ? `${element.note}\n${note}` : note;
}

export function parseFountain(source: string): ImportedScreenplay {
  const { text, notes } = liftInlineNotes(source);
  const parsed = new Fountain().parse(text, true);
  const titlePage: Partial<TitlePage> = {};
  const elements: ScriptElement[] = [];
  const dropped: Record<string, number> = {};
  // Lifted notes come back in order: each waits for the next element made
  // from the line it was on.
  let pending = 0;

  for (const token of parsed.tokens) {
    const body = token.text?.trim();

    if (token.is_title) {
      const field = TITLE_FIELDS[token.type];
      // Fountain allows arbitrary title-page keys (Source, Notes, Copyright…);
      // ours has five fields, and inventing more would ripple into the PDF.
      // The title page has no notes: one written there is reported, not kept
      // in the title.
      const titleNotes = body ? [...body.matchAll(INLINE_NOTE)].length : 0;
      if (titleNotes) dropped.note = (dropped.note ?? 0) + titleNotes;
      const value = body?.replace(INLINE_NOTE, '').trim();
      if (field && value) titlePage[field] = value;
      else if (value) dropped[token.type] = (dropped[token.type] ?? 0) + 1;
      continue;
    }

    if (STRUCTURAL.has(token.type)) continue;

    if (token.type === 'note') {
      const previous = elements[elements.length - 1];
      if (previous && body) addNote(previous, body);
      else if (body) dropped.note = (dropped.note ?? 0) + 1;
      continue;
    }

    const type = BODY_TYPES[token.type];
    if (!type) {
      // Sections, synopses, notes, page breaks: real Fountain, no home here.
      dropped[token.type] = (dropped[token.type] ?? 0) + 1;
      continue;
    }

    if (!body) continue;
    const element = newElement(type, body.replace(INLINE_NOTE, '').trim());
    // A note spanning several lines wasn't lifted (it isn't on one line), so
    // fountain-js left it in the text.
    for (const [, note] of body.matchAll(INLINE_NOTE)) {
      if (note.trim()) addNote(element, note.trim());
    }
    for (const line of body.split('\n')) {
      while (pending < notes.length && notes[pending].key === lineKey(line)) {
        addNote(element, notes[pending++].note);
      }
    }
    elements.push(element);
  }

  if (pending < notes.length) {
    dropped.note = (dropped.note ?? 0) + notes.length - pending;
  }

  return { format: 'fountain', titlePage, elements, dropped };
}
