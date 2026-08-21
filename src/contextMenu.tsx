// App-wide right-click menus. Chromium's default context menu is suppressed
// everywhere (a desktop app shouldn't show "Reload"/"Inspect"), and any
// component can offer its own by calling showContextMenu with the entries it
// wants.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import PopupMenu, { type MenuEntry } from './components/PopupMenu';
import {
  addWordToDictionary,
  canCorrectSpelling,
  onSpellContext,
  readClipboard,
  writeClipboard,
} from './desktop';
import type { SpellContext } from './desktopTypes';
import { useI18n, type Dict } from './i18n';

type ShowContextMenu = (
  event: React.MouseEvent | MouseEvent,
  entries: MenuEntry[]
) => void;

const ContextMenuContext = createContext<ShowContextMenu>(() => {});

export function useContextMenu(): ShowContextMenu {
  return useContext(ContextMenuContext);
}

/** The caret/selection at the moment the menu opened. Clicking a menu item
 * blurs the editor, so clipboard actions have to put it back first. */
interface Snapshot {
  el: HTMLElement | null;
  range: Range | null;
}

function snapshotSelection(): Snapshot {
  const sel = window.getSelection();
  return {
    el: document.activeElement as HTMLElement | null,
    range: sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null,
  };
}

function restore(snap: Snapshot): void {
  snap.el?.focus();
  if (!snap.range) return;
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(snap.range);
}

function isEditable(node: EventTarget | null): node is HTMLElement {
  const el = node as HTMLElement | null;
  if (!el) return false;
  return Boolean(
    el.closest?.('[contenteditable="true"]') ||
      el.matches?.('input:not([type=file]), textarea')
  );
}

/** Cut/copy/paste/select-all bound to the selection as it stands right now.
 * Build these while handling the contextmenu event, not later. */
export function clipboardEntries(t: Dict, editable: boolean): MenuEntry[] {
  const snap = snapshotSelection();
  const selected = snap.range ? !snap.range.collapsed : false;

  const run = (fn: () => void) => () => {
    restore(snap);
    fn();
  };

  return [
    {
      label: t.ctxCut,
      accelerator: 'Mod+X',
      disabled: !editable || !selected,
      onSelect: run(() => {
        writeClipboard(window.getSelection()?.toString() ?? '');
        document.execCommand('delete');
      }),
    },
    {
      label: t.ctxCopy,
      accelerator: 'Mod+C',
      disabled: !selected,
      onSelect: run(() => writeClipboard(window.getSelection()?.toString() ?? '')),
    },
    {
      label: t.ctxPaste,
      accelerator: 'Mod+V',
      disabled: !editable,
      onSelect: run(() => {
        void readClipboard().then((text) => {
          if (!text) return;
          // Element blocks are single-line; collapse anything multi-line the
          // same way ElementBlock's own paste handler does.
          document.execCommand('insertText', false, text.replace(/\r?\n+/g, ' '));
        });
      }),
    },
    { separator: true },
    {
      label: t.ctxSelectAll,
      accelerator: 'Mod+A',
      onSelect: run(() => document.execCommand('selectAll')),
    },
  ];
}

interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
  /** Where the caret was when the menu opened — corrections have to put it
   * back before Chromium can act on the word. */
  snap: Snapshot;
  /** Filled in a beat later, once the main process reports what Chromium
   * found under the cursor. */
  spell: SpellContext | null;
}

const MAX_SUGGESTIONS = 6;

/** Letters, digits, marks and the apostrophes and hyphens that sit inside
 * words — l'autre, jusqu'à, sous-sol. */
const WORD_CHAR = /[\p{L}\p{M}\p{N}'’-]/u;

/** Replaces the word the caret sits in. Chromium's own replaceMisspelling
 * needs that word to be *selected*, which a right-click never does — and
 * measured, it silently does nothing once our menu has taken the focus. So
 * the correction is typed in instead: execCommand fires a real input event,
 * which means the editor's undo history, dirty flag and autosave all see it
 * exactly as they would a keystroke.
 *
 * The word under the caret is checked against what Chromium flagged; if the
 * text has moved on since the menu opened, nothing is touched. */
function correctWordAtCaret(misspelled: string, replacement: string): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const text = el.value;
    const caret = el.selectionStart ?? 0;
    const [start, end] = wordBounds(text, caret);
    if (text.slice(start, end) !== misspelled) return;
    el.setSelectionRange(start, end);
    document.execCommand('insertText', false, replacement);
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const node = sel.getRangeAt(0).startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  const text = node.textContent ?? '';
  const [start, end] = wordBounds(text, sel.getRangeAt(0).startOffset);
  if (text.slice(start, end) !== misspelled) return;

  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, replacement);
}

function wordBounds(text: string, caret: number): [number, number] {
  let start = caret;
  let end = caret;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return [start, end];
}

/** Corrections for the word under the cursor, above the clipboard actions —
 * where every editor puts them. The caret has to go back into the field
 * first: opening the menu moved it. */
function spellingEntries(
  spell: SpellContext,
  snap: Snapshot,
  t: Dict
): MenuEntry[] {
  const entries: MenuEntry[] = spell.suggestions
    .slice(0, MAX_SUGGESTIONS)
    .map((word) => ({
      label: word,
      onSelect: () => {
        restore(snap);
        correctWordAtCaret(spell.misspelledWord, word);
      },
    }));

  if (entries.length === 0) {
    entries.push({ label: t.spellNoSuggestions, disabled: true });
  }

  entries.push({
    label: t.spellAddToDictionary,
    onSelect: () => {
      restore(snap);
      addWordToDictionary(spell.misspelledWord);
    },
  });
  entries.push({ separator: true });
  return entries;
}

/** How long to wait for the main process to report the word under the cursor
 * before giving up and showing the menu without corrections. It answers in a
 * few milliseconds; this is only there so a menu always appears. */
const SPELL_REPLY_TIMEOUT = 150;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Chromium reports the misspelled word under the cursor only while building
  // its own context menu — and, measured, only if the page lets that event
  // through. So on the desktop the DOM event is deliberately *not* cancelled:
  // the menu is staged here and opened when the report arrives. Electron pops
  // no native menu of its own, so nothing else appears in the meantime.
  const staged = useRef<Omit<MenuState, 'spell'> | null>(null);
  const stagedFor = useRef<Event | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const openStaged = useCallback((spell: SpellContext | null) => {
    const pending = staged.current;
    if (!pending) return;
    staged.current = null;
    stagedFor.current = null;
    window.clearTimeout(timer.current);
    setMenu({ ...pending, spell });
  }, []);

  const stage = useCallback(
    (event: React.MouseEvent | MouseEvent, entries: MenuEntry[]) => {
      const native = 'nativeEvent' in event ? event.nativeEvent : event;
      staged.current = {
        x: event.clientX,
        y: event.clientY,
        entries,
        snap: snapshotSelection(),
      };
      stagedFor.current = native;

      if (!canCorrectSpelling) {
        event.preventDefault();
        openStaged(null);
        return;
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => openStaged(null), SPELL_REPLY_TIMEOUT);
    },
    [openStaged]
  );

  const show = useCallback<ShowContextMenu>(
    (event, entries) => {
      if (entries.length === 0) return;
      stage(event, entries);
    },
    [stage]
  );

  useEffect(
    () => onSpellContext((info) => openStaged(info.misspelledWord ? info : null)),
    [openStaged]
  );

  // Anything that didn't offer its own menu still shouldn't get Chromium's:
  // editable targets fall back to clipboard actions, everything else to
  // nothing at all.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // A component already staged a menu for this very event. It can't say
      // so with preventDefault any more — that would cost us the spelling
      // report — so the event itself is the marker.
      if (e.defaultPrevented || stagedFor.current === e) return;

      // In the browser build the suggestions live in Chromium's own menu and
      // no API can read them out, so Shift+right-click lets that menu
      // through — the only route to a correction there. The desktop build
      // offers them inline and needs no escape hatch.
      if (e.shiftKey && !canCorrectSpelling) {
        setMenu(null);
        return;
      }

      if (isEditable(e.target)) {
        stage(e, clipboardEntries(t, true));
      } else {
        e.preventDefault();
        setMenu(null);
      }
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [t, stage]);

  // A menu shouldn't survive the window losing focus or the view scrolling
  // out from under it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  return (
    <ContextMenuContext.Provider value={show}>
      {children}
      {menu && (
        <PopupMenu
          entries={
            menu.spell
              ? [...spellingEntries(menu.spell, menu.snap, t), ...menu.entries]
              : menu.entries
          }
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </ContextMenuContext.Provider>
  );
}
