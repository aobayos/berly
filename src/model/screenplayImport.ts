// Reading screenplays *in*. The inverse direction from fountain.ts, and the
// one thing that lets a writer move a back catalogue out of Final Draft.
import type { ScriptElement, TitlePage } from './types';
import { parseFountain } from './fountainParse';
import { parseFdx } from './fdxParse';

export type ScreenplayFormat = 'fountain' | 'fdx';

export interface ImportedScreenplay {
  format: ScreenplayFormat;
  /** Only the fields the source actually carried — the caller decides how to
   * merge them, and never sees a blank field it can't tell from an absent one. */
  titlePage: Partial<TitlePage>;
  elements: ScriptElement[];
  /** Source element types BERLY has no home for, and how many were seen.
   * Surfaced after an import so nothing disappears silently. */
  dropped: Record<string, number>;
}

/** Sniffs the content first and only falls back to the extension: a Final
 * Draft file saved as .txt is still XML, and a .fdx that isn't XML is not
 * something to hand to an XML parser. */
export function detectFormat(filename: string, text: string): ScreenplayFormat {
  if (/^\s*<\?xml|<FinalDraft/i.test(text.slice(0, 500))) return 'fdx';
  if (/\.fdx$/i.test(filename)) return 'fdx';
  return 'fountain';
}

export function parseScreenplay(filename: string, text: string): ImportedScreenplay {
  return detectFormat(filename, text) === 'fdx' ? parseFdx(text) : parseFountain(text);
}

/** Strips the extension so an imported file suggests a project name. */
export function nameFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.(fountain|fdx|txt|spmd)$/i, '');
  return base.trim();
}
