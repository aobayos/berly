// Trelby (.trelby) -> BERLY. No npm package reads Trelby files, and the
// format is small enough that the table below is most of the parser, the same
// reasoning as fdxParse.ts.
//
// A .trelby file is UTF-8 text: a `#Version` line, `#Begin-…`/`#End-…` blocks
// of settings, `#Title-String` lines for the title page, then `#Start-Script`
// and the script itself. Trelby stores the script already wrapped to its
// line width, one physical line per row, each prefixed with two characters:
// how the line joins the next one, then the element type.
import type { ElementType, ScriptElement, TitlePage } from '@/model/types';
import { newElement } from '@/model/types';
import type { ImportedScreenplay } from '@/services/screenplayImport';

/** Second character of a script line. */
const LINE_TYPES: Record<string, ElementType> = {
  '\\': 'scene',
  '.': 'action',
  _: 'character',
  ':': 'dialogue',
  '(': 'parenthetical',
  '/': 'transition',
  '=': 'shot',
};

/** Trelby types BERLY has no element for, named for the post-import report. */
const DROPPED_TYPES: Record<string, string> = {
  '@': 'Act Break',
  '%': 'Note',
};

/** First character of a script line: what joins it to the next line of the
 * same element. `.` ends the element. A forced break (`|`) becomes a space,
 * because BERLY's elements are single paragraphs, as on paste. */
const JOINS: Record<string, string> = {
  '>': ' ',
  '+': '  ',
  '&': '',
  '|': ' ',
};

/** What Trelby puts on a new script's title page. Left untouched, they are
 * placeholders, not the writer's title page, and must not be imported as one. */
const TRELBY_DEFAULTS = new Set([
  'UNTITLED SCREENPLAY',
  'by\n\nMy Name Here',
  '123/456-7890\nno.such@thing.com',
]);

export function isTrelby(text: string): boolean {
  const head = text.replace(/^﻿/, '').slice(0, 200);
  return /^#Version \d+/.test(head) && text.includes('#Start-Script');
}

export function parseTrelby(text: string): ImportedScreenplay {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === '#Start-Script');
  if (!isTrelby(text) || start === -1) {
    throw new Error('Not a readable Trelby file');
  }

  const titlePage = readTitlePage(lines.slice(0, start));
  const elements: ScriptElement[] = [];
  const dropped: Record<string, number> = {};

  let type = '';
  let parts: string[] = [];

  const finish = () => {
    const body = parts.join('').trim();
    parts = [];
    if (!body) return;
    const mapped = LINE_TYPES[type];
    if (mapped) {
      elements.push(newElement(mapped, body));
    } else {
      const name = DROPPED_TYPES[type] ?? `Unknown (${type})`;
      dropped[name] = (dropped[name] ?? 0) + 1;
    }
  };

  for (const line of lines.slice(start + 1)) {
    if (line.length < 2) continue;
    const join = line[0];
    type = line[1];
    const content = line.slice(2);
    if (join === '.') {
      parts.push(content);
      finish();
    } else {
      parts.push(content, JOINS[join] ?? ' ');
    }
  }
  // A file cut short mid-element still yields what it has.
  finish();

  return { format: 'trelby', titlePage, elements, dropped };
}

/** Trelby's title page is free-floating strings rather than named fields:
 * `#Title-String x,y,size,flags,font,,text`, `\n` escaped. Mapped the way
 * Trelby's own template lays them out — the largest string is the title, a
 * "by …" string holds the credit and author, and anything else goes to the
 * contact block. Its untouched placeholders are skipped. */
function readTitlePage(header: string[]): Partial<TitlePage> {
  const strings = header
    .filter((line) => line.startsWith('#Title-String '))
    .map((line) => {
      const fields = line.slice('#Title-String '.length).split(',');
      return {
        size: Number(fields[2]) || 0,
        // The text is everything after the sixth comma; it may hold commas.
        text: fields.slice(6).join(',').replace(/\\n/g, '\n').trim(),
      };
    })
    .filter((s) => s.text && !TRELBY_DEFAULTS.has(s.text));

  const titlePage: Partial<TitlePage> = {};
  if (strings.length === 0) return titlePage;

  const largest = strings.reduce((a, b) => (b.size > a.size ? b : a));
  titlePage.title = largest.text;

  const contact: string[] = [];
  for (const s of strings) {
    if (s === largest) continue;
    const byline = /^((?:written\s+)?by|(?:écrit\s+)?par)\s*\n+([\s\S]+)$/i.exec(s.text);
    if (byline && !titlePage.author) {
      titlePage.credit = byline[1];
      titlePage.author = byline[2].trim();
    } else {
      contact.push(s.text);
    }
  }
  if (contact.length > 0) titlePage.contact = contact.join('\n');
  return titlePage;
}
