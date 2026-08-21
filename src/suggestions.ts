// Autocomplete engine. Characters and places are derived from what is
// already written across the whole project (all episodes for a show), so a
// new name is "created" simply by typing it once.
import type { ElementType, Script } from './types';
import type { Lang } from './i18n';

export interface SuggestionItem {
  label: string;
  /** Full replacement text for the element when accepted. */
  text: string;
  /** Keep the menu open after accepting (multi-stage scene headings). */
  keepOpen?: boolean;
}

export interface SuggestionContext {
  characters: string[];
  places: string[];
  lang: Lang;
}

const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. '];
const PREFIX_RE = /^(INT\.\/EXT\.|INT\.|EXT\.|I\/E\.?)\s*/i;

export const TIMES: Record<Lang, string[]> = {
  en: [
    'DAY',
    'NIGHT',
    'MORNING',
    'EVENING',
    'DUSK',
    'DAWN',
    'CONTINUOUS',
    'LATER',
    'SAME TIME',
  ],
  fr: [
    'JOUR',
    'NUIT',
    'MATIN',
    'SOIR',
    'AUBE',
    'CRÉPUSCULE',
    'CONTINU',
    'PLUS TARD',
  ],
};

export const TRANSITIONS: Record<Lang, string[]> = {
  en: [
    'CUT TO:',
    'FADE IN:',
    'FADE OUT.',
    'DISSOLVE TO:',
    'SMASH CUT TO:',
    'MATCH CUT TO:',
    'FADE TO BLACK.',
  ],
  fr: [
    'COUPE À :',
    'FONDU ENCHAÎNÉ :',
    'OUVERTURE EN FONDU :',
    'FERMETURE EN FONDU :',
    'FONDU AU NOIR.',
    'CUT TO:',
  ],
};

/** Unique character names used anywhere in the project, without
 * extensions like (V.O.) / (O.S.). */
export function extractCharacters(scripts: Script[]): string[] {
  const names = new Set<string>();
  for (const script of scripts) {
    for (const el of script.elements) {
      if (el.type !== 'character') continue;
      const name = el.text
        .trim()
        .toUpperCase()
        .replace(/\s*\(.*\)\s*$/, '');
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

/** Unique places parsed out of scene headings ("INT. KITCHEN - DAY" → "KITCHEN"). */
export function extractPlaces(scripts: Script[]): string[] {
  const places = new Set<string>();
  for (const script of scripts) {
    for (const el of script.elements) {
      if (el.type !== 'scene') continue;
      const rest = el.text.trim().toUpperCase().replace(PREFIX_RE, '');
      const place = rest.split(' - ')[0].trim();
      if (place) places.add(place);
    }
  }
  return [...places].sort();
}

/** Suggestions that replace the whole element text (scene / character /
 * transition elements). Scene headings complete in three stages:
 * prefix → place → time of day. */
export function getReplaceSuggestions(
  type: ElementType,
  text: string,
  ctx: SuggestionContext
): SuggestionItem[] {
  const q = text.trim().toUpperCase();

  if (type === 'character') {
    return ctx.characters
      .filter((c) => c.startsWith(q) && c !== q)
      .map((c) => ({ label: c, text: c }));
  }

  if (type === 'transition') {
    return TRANSITIONS[ctx.lang]
      .filter((tr) => tr.startsWith(q) && tr !== q)
      .map((tr) => ({ label: tr, text: tr }));
  }

  if (type === 'scene') {
    const m = text.match(PREFIX_RE);
    if (!m) {
      return SCENE_PREFIXES.filter((p) => p.startsWith(q)).map((p) => ({
        label: p.trim(),
        text: p,
        keepOpen: true,
      }));
    }
    const prefix = m[0].trim().toUpperCase() + ' ';
    const rest = text.slice(m[0].length);
    const dashIdx = rest.indexOf(' - ');
    if (dashIdx === -1) {
      const pq = rest.trim().toUpperCase();
      return ctx.places
        .filter((pl) => pl.startsWith(pq) && pl !== pq)
        .map((pl) => ({
          label: pl,
          text: `${prefix}${pl} - `,
          keepOpen: true,
        }));
    }
    const place = rest.slice(0, dashIdx).trim().toUpperCase();
    const tq = rest.slice(dashIdx + 3).trim().toUpperCase();
    return TIMES[ctx.lang]
      .filter((ti) => ti.startsWith(tq) && ti !== tq)
      .map((ti) => ({
        label: ti,
        text: `${prefix}${place} - ${ti}`,
      }));
  }

  return [];
}

/** Suggestions inserted at the caret (Ctrl+Space in action / dialogue /
 * parenthetical): known characters and places matching the word being typed. */
export function getInsertSuggestions(
  wordPrefix: string,
  ctx: SuggestionContext
): SuggestionItem[] {
  const q = wordPrefix.toUpperCase();
  const pool = [
    ...ctx.characters,
    ...ctx.places.filter((p) => !ctx.characters.includes(p)),
  ];
  return pool
    .filter((x) => x.startsWith(q) && x !== q)
    .map((x) => ({ label: x, text: x }));
}
