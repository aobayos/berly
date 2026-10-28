// Reading screenplays *in*. The inverse direction from fountain.ts, and the
// one thing that lets a writer move a back catalogue out of Final Draft.
import type { ScriptElement, TitlePage } from '@/model/types';
import { parseFountain } from '@/services/fountainParse';
import { parseFdx } from '@/services/fdxParse';
import { isTrelby, parseTrelby } from '@/services/trelbyParse';

export type ScreenplayFormat = 'fountain' | 'fdx' | 'trelby';

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
	if (isTrelby(text)) return 'trelby';
	if (/\.fdx$/i.test(filename)) return 'fdx';
	if (/\.trelby$/i.test(filename)) return 'trelby';
	return 'fountain';
}

export function parseScreenplay(filename: string, text: string): ImportedScreenplay {
	switch (detectFormat(filename, text)) {
		case 'fdx':
			return parseFdx(text);
		case 'trelby':
			return parseTrelby(text);
		case 'fountain':
			return parseFountain(text);
	}
}

/** Strips the extension so an imported file suggests a project name. */
export function nameFromFilename(filename: string): string {
	const base = filename.replace(/^.*[\\/]/, '').replace(/\.(fountain|fdx|trelby|txt|spmd)$/i, '');
	return base.trim();
}
