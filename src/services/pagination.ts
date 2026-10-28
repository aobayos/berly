// Where the script breaks from one page to the next.
//
// This used to estimate breaks from character counts (55 lines of Courier,
// fixed column widths per element type). The estimate was fine for a page
// list in the sidebar, but the editor now shows real pages, and a page that
// *looks* full has to be full — so the breaks are computed from the heights
// the browser actually laid out. The measuring lives in src/components/editor/ScriptPages.tsx;
// everything here is pure arithmetic over those measurements.
import type { ElementType, ScriptElement } from '@/model/types';

/** US Letter, 11in tall with 1in margins top and bottom, in CSS pixels.
 * CSS inches are 96px by definition, so this is exact at any screen DPI or
 * zoom level — the measurements it is compared against are in the same
 * unzoomed CSS pixels. */
export const PAGE_CONTENT_PX = 9 * 96;

/** One rendered element: its own height, and the gap above it. Kept apart
 * because the gap disappears when the element falls at the top of a page —
 * the same rule the stylesheet applies to the first element on a page. */
export interface ElementBox {
	height: number;
	marginTop: number;
	/** Must not be the last thing on a page — see KEEP_WITH_NEXT. */
	keepWithNext?: boolean;
}

/** Elements that only introduce what follows them, so ending a page on one
 * strands it: a cue whose line is overleaf, a heading whose scene is. Same
 * list as KEEP_WITH_NEXT in electron/screenplayPdf.ts — keep them in step. */
export const KEEP_WITH_NEXT: ReadonlySet<ElementType> = new Set<ElementType>([
	'scene',
	'shot',
	'character',
	'parenthetical',
]);

/** Index of the first element on each page. Always starts with [0]; a script
 * of one short line is one page.
 *
 * An element taller than a whole page (a very long action paragraph) is left
 * to overflow its page rather than being split mid-sentence — splitting a
 * paragraph across a break is a separate job, and a wrong split reads worse
 * than a long page.
 *
 * When an element doesn't fit, whatever keeps with it (a cue, and the
 * parenthetical under it; a scene heading) goes over with it, unless that
 * would empty the page. */
export function pageStarts(boxes: ElementBox[], pageHeight = PAGE_CONTENT_PX): number[] {
	const starts: number[] = [0];
	let used = 0;

	boxes.forEach((box, i) => {
		const atPageTop = used === 0;
		const needed = box.height + (atPageTop ? 0 : box.marginTop);

		if (!atPageTop && used + needed > pageHeight) {
			const pageStart = starts[starts.length - 1];
			let start = i;
			while (start - 1 > pageStart && boxes[start - 1].keepWithNext) start--;
			// The whole page is one run that keeps together: moving all but its
			// first element would still strand that one, so move nothing.
			if (start === pageStart + 1 && boxes[pageStart].keepWithNext) start = i;
			starts.push(start);
			used = 0;
			for (let k = start; k <= i; k++) {
				used += boxes[k].height + (k === start ? 0 : boxes[k].marginTop);
			}
		} else {
			used += needed;
		}
	});

	return starts;
}

export interface PageInfo {
	number: number;
	/** First element on the page — used to jump there. */
	elementId: string;
	snippet: string;
}

/** The sidebar's page list, built from the very breaks drawn on screen so
 * the two can never disagree. */
export function pageInfo(elements: ScriptElement[], starts: number[]): PageInfo[] {
	return starts
		.filter((start) => start < elements.length)
		.map((start, i) => ({
			number: i + 1,
			elementId: elements[start].id,
			snippet: snippetFrom(elements, start),
		}));
}

function snippetFrom(elements: ScriptElement[], start: number): string {
	for (let i = start; i < Math.min(start + 5, elements.length); i++) {
		const text = elements[i].text.trim();
		if (text) return text.length > 40 ? text.slice(0, 40) + '…' : text;
	}
	return '';
}

/** A scene's length the way the trade counts it: in eighths of a page,
 * rounded up, never less than one — a one-line scene still costs a slot on
 * the schedule. `height` is in the same measured pixels as the pages. */
export function eighths(height: number, pageHeight = PAGE_CONTENT_PX): number {
	return Math.max(1, Math.ceil((height / pageHeight) * 8 - 0.05));
}

/** 11 → "1 3/8", 4 → "4/8", 16 → "2". Eighths are never reduced to
 * quarters or halves: a production board reads "4/8", not "1/2". */
export function formatEighths(count: number): string {
	const pages = Math.floor(count / 8);
	const rest = count % 8;
	if (!rest) return String(pages);
	return pages ? `${pages} ${rest}/8` : `${rest}/8`;
}
