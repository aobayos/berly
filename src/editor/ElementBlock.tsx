import { useLayoutEffect, useRef, useState } from 'react';
import type { ElementType, ScriptElement } from '../model/types';
import { ELEMENT_TYPES } from '../model/types';
import { useI18n } from '../i18n';
import { clipboardEntries, useContextMenu } from '../shell/contextMenu';
import {
  getInsertSuggestions,
  getReplaceSuggestions,
  type SuggestionContext,
  type SuggestionItem,
} from '../model/suggestions';

export interface FocusRequest {
  id: string;
  pos: number | 'end';
  seq: number;
  /** Open the element-type chooser once focused (after Enter). */
  typeMenu?: boolean;
}

interface MenuItem {
  label: string;
  /** For type menus. */
  type?: ElementType;
  /** For suggestion menus. */
  suggestion?: SuggestionItem;
}

interface MenuState {
  kind: 'type' | 'suggest';
  /** replace = swap the whole element text; insert = insert at the caret. */
  mode: 'replace' | 'insert';
  items: MenuItem[];
  index: number;
  /** Where the word being completed starts (insert mode). */
  prefixStart: number;
}

interface Props {
  element: ScriptElement;
  placeholder: string;
  focusRequest: FocusRequest | null;
  suggestionCtx: SuggestionContext;
  onChange: (id: string, text: string) => void;
  onSplit: (id: string, before: string, after: string) => void;
  onCycleType: (id: string, backwards: boolean) => void;
  onSetType: (id: string, type: ElementType) => void;
  onMergeBack: (id: string) => void;
  onNavigate: (id: string, direction: -1 | 1) => void;
  onFocus: (id: string) => void;
}

const AUTO_SUGGEST_TYPES: ElementType[] = ['scene', 'character', 'transition'];
const WORD_RE = /[\p{L}\p{N}'’.-]*$/u;

export default function ElementBlock({
  element,
  placeholder,
  focusRequest,
  suggestionCtx,
  onChange,
  onSplit,
  onCycleType,
  onSetType,
  onMergeBack,
  onNavigate,
  onFocus,
}: Props) {
  const { t } = useI18n();
  const showContextMenu = useContextMenu();
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Sync external text changes into the DOM, but never while the user is
  // typing in this block (that would reset the caret).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if ((el.textContent ?? '') !== element.text) {
      el.textContent = element.text;
    }
  }, [element.text]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !focusRequest || focusRequest.id !== element.id) return;
    el.focus();
    setCaret(el, focusRequest.pos);
    if (focusRequest.typeMenu) openTypeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, element.id]);

  function currentText(): string {
    return ref.current?.textContent ?? '';
  }

  function openTypeMenu() {
    setMenu({
      kind: 'type',
      mode: 'replace',
      items: ELEMENT_TYPES.map((type) => ({
        label: t.elements[type],
        type,
      })),
      // Default on Action: Enter-Enter just continues at the base line.
      index: ELEMENT_TYPES.indexOf('action'),
      prefixStart: 0,
    });
  }

  function replaceItems(type: ElementType, text: string): MenuItem[] {
    return getReplaceSuggestions(type, text, suggestionCtx).map((s) => ({
      label: s.label,
      suggestion: s,
    }));
  }

  function openSuggestForType(type: ElementType) {
    const items = replaceItems(type, currentText());
    setMenu(
      items.length > 0
        ? { kind: 'suggest', mode: 'replace', items, index: 0, prefixStart: 0 }
        : null
    );
  }

  function openInsertSuggest() {
    const el = ref.current;
    if (!el) return;
    const caret = getCaretOffset(el);
    const before = currentText().slice(0, caret);
    const word = before.match(WORD_RE)?.[0] ?? '';
    const prefixStart = caret - word.length;
    const items = getInsertSuggestions(word, suggestionCtx).map((s) => ({
      label: s.label,
      suggestion: s,
    }));
    setMenu(
      items.length > 0
        ? { kind: 'suggest', mode: 'insert', items, index: 0, prefixStart }
        : null
    );
  }

  /** Rewrites the DOM + state text and repositions the caret. */
  function setText(text: string, caretPos: number | 'end') {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;
    setCaret(el, caretPos);
    onChange(element.id, text);
  }

  function acceptItem(item: MenuItem) {
    if (item.type) {
      onSetType(element.id, item.type);
      if (AUTO_SUGGEST_TYPES.includes(item.type)) {
        const items = replaceItems(item.type, currentText());
        setMenu(
          items.length > 0
            ? { kind: 'suggest', mode: 'replace', items, index: 0, prefixStart: 0 }
            : null
        );
      } else {
        setMenu(null);
      }
      return;
    }

    const s = item.suggestion;
    if (!s || !menu) return;

    if (menu.mode === 'insert') {
      const el = ref.current;
      const caret = el ? getCaretOffset(el) : 0;
      const full = currentText();
      const next = full.slice(0, menu.prefixStart) + s.text + full.slice(caret);
      setText(next, menu.prefixStart + s.text.length);
      setMenu(null);
      return;
    }

    setText(s.text, 'end');
    if (s.keepOpen) {
      const items = replaceItems(element.type, s.text);
      setMenu(
        items.length > 0
          ? { kind: 'suggest', mode: 'replace', items, index: 0, prefixStart: 0 }
          : null
      );
    } else {
      setMenu(null);
    }
  }

  function handleInput() {
    const text = currentText();
    onChange(element.id, text);

    if (menu?.kind === 'type') {
      setMenu(null);
      return;
    }

    if (menu?.kind === 'suggest' && menu.mode === 'insert') {
      const el = ref.current;
      const caret = el ? getCaretOffset(el) : 0;
      if (caret < menu.prefixStart) {
        setMenu(null);
        return;
      }
      const word = text.slice(menu.prefixStart, caret);
      const items = getInsertSuggestions(word, suggestionCtx).map((s) => ({
        label: s.label,
        suggestion: s,
      }));
      setMenu(
        items.length > 0 ? { ...menu, items, index: 0 } : null
      );
      return;
    }

    // Auto-suggest while typing scene headings, characters, transitions.
    if (AUTO_SUGGEST_TYPES.includes(element.type) && text.trim()) {
      const items = replaceItems(element.type, text);
      setMenu(
        items.length > 0
          ? { kind: 'suggest', mode: 'replace', items, index: 0, prefixStart: 0 }
          : null
      );
    } else if (menu) {
      setMenu(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;

    if (menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({
          ...menu,
          index:
            (menu.index + delta + menu.items.length) % menu.items.length,
        });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptItem(menu.items[Math.min(menu.index, menu.items.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (
        menu.kind === 'type' &&
        e.key >= '1' &&
        e.key <= '6' &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        acceptItem(menu.items[Number(e.key) - 1]);
        return;
      }
      if (
        menu.kind === 'type' &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        // Start typing → stay on Action, dismiss the chooser.
        setMenu(null);
        // fall through so the character is typed
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const text = el.textContent ?? '';
      const offset = getCaretOffset(el);
      setMenu(null);
      onSplit(element.id, text.slice(0, offset), text.slice(offset));
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      setMenu(null);
      onCycleType(element.id, e.shiftKey);
      return;
    }

    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      if (AUTO_SUGGEST_TYPES.includes(element.type)) {
        openSuggestForType(element.type);
      } else {
        openInsertSuggest();
      }
      return;
    }

    if (e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      setMenu(null);
      onSetType(element.id, ELEMENT_TYPES[Number(e.key) - 1]);
      return;
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && getCaretOffset(el) === 0) {
        e.preventDefault();
        setMenu(null);
        onMergeBack(element.id);
      }
      return;
    }

    if (e.key === 'ArrowUp' && caretOnEdgeLine(el, 'first')) {
      e.preventDefault();
      onNavigate(element.id, -1);
      return;
    }

    if (e.key === 'ArrowDown' && caretOnEdgeLine(el, 'last')) {
      e.preventDefault();
      onNavigate(element.id, 1);
    }
  }

  /** Right-click inside a block: clipboard actions plus the element's type,
   * which is the one thing you always want to reach from here. */
  function handleContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    setMenu(null);
    showContextMenu(e, [
      ...clipboardEntries(t, true),
      { separator: true },
      {
        label: t.ctxElementType,
        submenu: ELEMENT_TYPES.map((type, i) => ({
          label: t.elements[type],
          accelerator: `Mod+${i + 1}`,
          checked: element.type === type,
          onSelect: () => onSetType(element.id, type),
        })),
      },
      {
        label: t.ctxSuggestions,
        accelerator: 'Mod+Space',
        onSelect: () => {
          ref.current?.focus();
          if (AUTO_SUGGEST_TYPES.includes(element.type)) {
            openSuggestForType(element.type);
          } else {
            openInsertSuggest();
          }
        },
      },
    ]);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData
      .getData('text/plain')
      .replace(/\r?\n+/g, ' ')
      .trim();
    document.execCommand('insertText', false, text);
  }

  return (
    <div className="el-wrap" data-el-id={element.id}>
      <div
        ref={ref}
        className={`el el-${element.type}`}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onContextMenu={handleContextMenu}
        onFocus={() => onFocus(element.id)}
        onBlur={() => setMenu(null)}
      />
      {menu && menu.items.length > 0 && (
        <ul
          className="el-menu"
          style={{ left: ref.current?.offsetLeft ?? 0 }}
        >
          {menu.items.map((item, i) => (
            <li key={`${item.label}-${i}`}>
              <button
                type="button"
                className={i === menu.index ? 'is-selected' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptItem(item);
                }}
                onMouseEnter={() => setMenu({ ...menu, index: i })}
              >
                {menu.kind === 'type' && (
                  <span className="menu-key">{i + 1}</span>
                )}
                <span className="menu-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaret(el: HTMLElement, pos: number | 'end'): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    const len = node.textContent?.length ?? 0;
    const target = pos === 'end' ? len : Math.min(pos, len);
    range.setStart(node, target);
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/** True when the caret sits on the first/last visual line of the block, so
 * ArrowUp/Down should jump to the neighboring block instead of moving within
 * this one. */
function caretOnEdgeLine(el: HTMLElement, edge: 'first' | 'last'): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  if (!(el.textContent ?? '').length) return true;

  const range = sel.getRangeAt(0).cloneRange();
  let rect = range.getBoundingClientRect();
  if (rect.height === 0) {
    const rects = range.getClientRects();
    if (rects.length > 0) rect = rects[0];
    else return true;
  }

  const elRect = el.getBoundingClientRect();
  const lineHeight =
    parseFloat(getComputedStyle(el).lineHeight) || rect.height || 16;

  if (edge === 'first') return rect.top - elRect.top < lineHeight * 0.9;
  return elRect.bottom - rect.bottom < lineHeight * 0.9;
}
