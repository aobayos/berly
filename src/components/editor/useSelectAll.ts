// Ctrl+A over the whole script. Every element is its own contentEditable, so
// the browser's select-all stops at the edge of the focused one — and a
// native selection can't be stretched across them either: Chromium clamps a
// selection to the editing host the caret is in. So "everything is selected"
// is a state of our own, painted through the CSS Custom Highlight API, which
// marks exactly the text the way a real selection does. Focus stays in the
// block the writer was in, so the keyboard keeps arriving to be intercepted.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ScriptElement } from '@/model/types';
import { SELECT_ALL_EVENT } from '@/contexts/contextMenu';

/** Styled by ::highlight(berly-select-all) in index.css. */
const HIGHLIGHT = 'berly-select-all';

/** Cues own the lines under them; everything else stands apart. */
function toPlainText(elements: ScriptElement[]): string {
	return elements
		.map((el, i) => {
			const prev = elements[i - 1]?.type;
			const tight =
				(prev === 'character' || prev === 'parenthetical') &&
				(el.type === 'dialogue' || el.type === 'parenthetical');
			return (i === 0 ? '' : tight ? '\n' : '\n\n') + el.text;
		})
		.join('');
}

interface Options {
	/** Only the visible tab's script pane listens. */
	enabled: boolean;
	elements: ScriptElement[];
	/** Replaces the whole script with a single element holding `text` — what
	 * typing, deleting, cutting or pasting over the selection amounts to. */
	onReplaceAll(text: string): void;
}

export function useSelectAll(
	rootRef: RefObject<HTMLElement | null>,
	{ enabled, elements, onReplaceAll }: Options,
): boolean {
	const [selected, setSelected] = useState(false);
	// Listeners read the latest values without re-subscribing on every keystroke.
	const state = useRef({ selected, elements, onReplaceAll });
	state.current = { selected, elements, onReplaceAll };

	const inEditor = useCallback(
		(target: EventTarget | null) =>
			target instanceof HTMLElement &&
			target.classList.contains('el') &&
			Boolean(rootRef.current?.contains(target)),
		[rootRef],
	);

	// Repainted whenever the elements change underneath, so the highlight
	// always covers the text actually on screen.
	useEffect(() => {
		if (!selected || !rootRef.current) return;
		const ranges = [...rootRef.current.querySelectorAll('.el')].map((el) => {
			const range = new Range();
			range.selectNodeContents(el);
			return range;
		});
		CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
		return () => {
			CSS.highlights.delete(HIGHLIGHT);
		};
	}, [selected, elements, rootRef]);

	useEffect(() => {
		if (!enabled) {
			setSelected(false);
			return;
		}

		const replace = (text: string) => {
			setSelected(false);
			state.current.onReplaceAll(text);
		};

		const onSelectAllRequest = (e: Event) => {
			if (!inEditor(e.target)) return;
			e.preventDefault();
			setSelected(true);
		};

		// Capture phase, on window: this runs before React's handlers (which sit
		// on the app root), so ElementBlock never sees a key meant for the
		// selection — Backspace would otherwise merge blocks, Enter split one.
		const onKeyDown = (e: KeyboardEvent) => {
			if (!inEditor(e.target) || e.isComposing) return;
			const mod = e.ctrlKey || e.metaKey;

			if (mod && !e.altKey && e.key.toLowerCase() === 'a') {
				e.preventDefault();
				e.stopPropagation();
				setSelected(true);
				return;
			}
			if (!state.current.selected) return;

			// Modifiers on their own, and the clipboard keys, whose copy/cut/paste
			// events are handled below.
			if (['Control', 'Meta', 'Shift', 'Alt', 'AltGraph'].includes(e.key)) return;
			if (mod && ['c', 'x', 'v'].includes(e.key.toLowerCase())) return;

			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				e.stopPropagation();
				replace('');
				return;
			}
			if (e.key.length === 1 && !mod) {
				e.preventDefault();
				e.stopPropagation();
				replace(e.key);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				// Splitting or retyping "everything" means nothing; swallow them.
				e.preventDefault();
				e.stopPropagation();
				return;
			}
			// Arrows, Escape, Home/End, undo…: back to an ordinary caret, and the
			// key does what it always does.
			setSelected(false);
		};

		const onCopy = (e: ClipboardEvent) => {
			if (!state.current.selected || !inEditor(e.target)) return;
			e.preventDefault();
			e.clipboardData?.setData('text/plain', toPlainText(state.current.elements));
		};

		const onCut = (e: ClipboardEvent) => {
			if (!state.current.selected || !inEditor(e.target)) return;
			onCopy(e);
			replace('');
		};

		const onPaste = (e: ClipboardEvent) => {
			if (!state.current.selected || !inEditor(e.target)) return;
			e.preventDefault();
			e.stopPropagation();
			// Blocks are single-line, as in ElementBlock's own paste handler.
			const text = e.clipboardData?.getData('text/plain') ?? '';
			replace(text.replace(/\r?\n+/g, ' ').trim());
		};

		const onPointerDown = () => {
			if (state.current.selected) setSelected(false);
		};

		window.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('copy', onCopy, true);
		document.addEventListener('cut', onCut, true);
		document.addEventListener('paste', onPaste, true);
		document.addEventListener('mousedown', onPointerDown, true);
		document.addEventListener(SELECT_ALL_EVENT, onSelectAllRequest, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			document.removeEventListener('copy', onCopy, true);
			document.removeEventListener('cut', onCut, true);
			document.removeEventListener('paste', onPaste, true);
			document.removeEventListener('mousedown', onPointerDown, true);
			document.removeEventListener(SELECT_ALL_EVENT, onSelectAllRequest, true);
		};
	}, [enabled, inEditor]);

	return selected;
}
