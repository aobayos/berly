// Fountain -> BERLY, via fountain-js. The library does the lexing; this file
// only maps its tokens onto ElementType and the title page.
import { Fountain } from 'fountain-js';
import type { ElementType, TitlePage } from './types';
import { newElement } from './types';
import type { ImportedScreenplay } from './screenplayImport';

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

export function parseFountain(text: string): ImportedScreenplay {
  const parsed = new Fountain().parse(text, true);
  const titlePage: Partial<TitlePage> = {};
  const elements = [];
  const dropped: Record<string, number> = {};

  for (const token of parsed.tokens) {
    const body = token.text?.trim();

    if (token.is_title) {
      const field = TITLE_FIELDS[token.type];
      // Fountain allows arbitrary title-page keys (Source, Notes, Copyright…);
      // ours has five fields, and inventing more would ripple into the PDF.
      if (field && body) titlePage[field] = body;
      else if (body) dropped[token.type] = (dropped[token.type] ?? 0) + 1;
      continue;
    }

    if (STRUCTURAL.has(token.type)) continue;

    const type = BODY_TYPES[token.type];
    if (!type) {
      // Sections, synopses, notes, page breaks: real Fountain, no home here.
      dropped[token.type] = (dropped[token.type] ?? 0) + 1;
      continue;
    }

    if (!body) continue;
    elements.push(newElement(type, body));
  }

  return { format: 'fountain', titlePage, elements, dropped };
}
