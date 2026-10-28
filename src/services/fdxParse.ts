// Final Draft (.fdx) -> BERLY. FDX is plain XML in which every paragraph
// states its own type, so no library is needed — DOMParser plus the table
// below is the whole parser. See CLAUDE.md for why no npm package is used.
import type { ElementType, ScriptElement } from '@/model/types';
import { newElement } from '@/model/types';
import type { ImportedScreenplay } from '@/services/screenplayImport';

const PARAGRAPH_TYPES: Record<string, ElementType> = {
	'Scene Heading': 'scene',
	Action: 'action',
	Character: 'character',
	Parenthetical: 'parenthetical',
	Dialogue: 'dialogue',
	Transition: 'transition',
	Shot: 'shot',
	Lyrics: 'lyrics',
	// Final Draft's catch-all for unformatted text.
	General: 'action',
};

export function parseFdx(xml: string): ImportedScreenplay {
	const doc = new DOMParser().parseFromString(xml, 'application/xml');
	if (doc.querySelector('parsererror')) {
		throw new Error('Not a readable Final Draft file');
	}

	const elements: ScriptElement[] = [];
	const dropped: Record<string, number> = {};

	// Only <Content> — a .fdx also carries <TitlePage>, <SmartType> and revision
	// data, whose <Paragraph>s would otherwise be read as script.
	const content = doc.querySelector('FinalDraft > Content');
	if (!content) throw new Error('Not a readable Final Draft file');

	for (const paragraph of content.querySelectorAll(':scope > Paragraph')) {
		const sourceType = paragraph.getAttribute('Type') ?? 'Unknown';
		// A ScriptNote sits inside the paragraph it annotates, with paragraphs
		// and <Text> of its own: those are the note, not the script.
		const text = [...paragraph.querySelectorAll('Text')]
			.filter((node) => !node.closest('ScriptNote, SceneProperties'))
			.map((node) => node.textContent ?? '')
			.join('')
			.trim();
		const note = [...paragraph.querySelectorAll(':scope > ScriptNote')]
			.map((scriptNote) =>
				[...scriptNote.querySelectorAll('Paragraph')]
					.map((p) => [...p.querySelectorAll('Text')].map((node) => node.textContent ?? '').join(''))
					.join('\n')
					.trim(),
			)
			.filter(Boolean)
			.join('\n');

		// Centering is an alignment in Final Draft, not a paragraph type, so it
		// has to be read before the type table or it arrives as plain action.
		const centered = paragraph.getAttribute('Alignment') === 'Center';
		const type = centered ? 'centered' : PARAGRAPH_TYPES[sourceType];

		if (!type) {
			dropped[sourceType] = (dropped[sourceType] ?? 0) + 1;
			continue;
		}
		if (!text) {
			if (note) dropped.ScriptNote = (dropped.ScriptNote ?? 0) + 1;
			continue;
		}
		const element = newElement(type, text);
		if (note) element.note = note;
		// A scene heading's <SceneProperties> holds the scene's summary — what
		// the outline calls its synopsis.
		if (type === 'scene') {
			const synopsis = [...paragraph.querySelectorAll(':scope > SceneProperties > Summary Paragraph')]
				.map((p) => [...p.querySelectorAll('Text')].map((node) => node.textContent ?? '').join(''))
				.join('\n')
				.trim();
			if (synopsis) element.synopsis = synopsis;
		}
		elements.push(element);
	}

	// Final Draft's title page is a free-form layout rather than named fields,
	// so there is nothing here that maps onto ours without guessing. The
	// importer names the script from the filename instead.
	return { format: 'fdx', titlePage: {}, elements, dropped };
}
