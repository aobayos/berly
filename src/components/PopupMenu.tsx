// The one menu renderer in the app: the title-bar menus, the tab context
// menu and the editor context menu all describe themselves as MenuEntry[]
// and hand them to this component. Keeps behaviour (keyboard navigation,
// submenu timing, edge flipping) identical everywhere.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatAccelerator } from '../shortcuts';

export interface MenuEntry {
  /** A separator needs nothing but this. */
  separator?: boolean;
  label?: string;
  accelerator?: string;
  disabled?: boolean;
  checked?: boolean;
  /** Renders in the danger colour — deletes and the like. */
  danger?: boolean;
  submenu?: MenuEntry[];
  onSelect?: () => void;
}

interface Props {
  entries: MenuEntry[];
  /** Viewport coordinates of the menu's top-left corner. */
  x: number;
  y: number;
  /** Dismisses the whole menu, root included. */
  onClose: () => void;
  /** Set for submenus so they flip sideways rather than upward. */
  nested?: boolean;
  /** Submenus only: closes this level and hands the keyboard back. */
  onDismiss?: () => void;
}

const SUBMENU_DELAY = 180;

/** Open menus, innermost last. Keyboard events belong to the deepest one —
 * without this, a submenu and its parent would both act on every arrow key. */
const openMenus: symbol[] = [];

function isSelectable(entry: MenuEntry): boolean {
  return !entry.separator && !entry.disabled;
}

export default function PopupMenu({
  entries,
  x,
  y,
  onClose,
  nested,
  onDismiss,
}: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(-1);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [pos, setPos] = useState({ x, y });
  const subTimer = useRef<number | undefined>(undefined);
  const token = useRef<symbol>(Symbol('menu'));

  // Keep the menu inside the viewport: flip up (or, for submenus, back
  // across the parent) when it would otherwise run off the edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + width > window.innerWidth - 4) {
      nx = nested ? Math.max(4, x - width - 4) : Math.max(4, window.innerWidth - width - 4);
    }
    if (ny + height > window.innerHeight - 4) {
      ny = Math.max(4, window.innerHeight - height - 4);
    }
    setPos({ x: nx, y: ny });
  }, [x, y, nested, entries]);

  useEffect(() => () => window.clearTimeout(subTimer.current), []);

  // Take the keyboard for as long as this menu is open, and give it back to
  // whatever was underneath on unmount.
  useEffect(() => {
    const self = token.current;
    openMenus.push(self);
    // Focusing the root parks the caret somewhere harmless, so stray typing
    // doesn't land in the script behind the menu.
    if (!nested) ref.current?.focus();
    return () => {
      const i = openMenus.indexOf(self);
      if (i !== -1) openMenus.splice(i, 1);
    };
  }, [nested]);

  // Only the outermost menu watches for outside clicks — one listener
  // closes the whole stack.
  useEffect(() => {
    if (nested) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.popup-menu')) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [nested, onClose]);

  function step(delta: 1 | -1) {
    const n = entries.length;
    let i = index;
    for (let tries = 0; tries < n; tries++) {
      i = (i + delta + n) % n;
      if (isSelectable(entries[i])) {
        setIndex(i);
        setOpenSub(null);
        return;
      }
    }
  }

  function choose(entry: MenuEntry, at: number) {
    if (!isSelectable(entry)) return;
    if (entry.submenu) {
      setOpenSub(at);
      return;
    }
    entry.onSelect?.();
    onClose();
  }

  // Captured on the window rather than bound to the element: a context menu
  // is often summoned while the caret sits in a contentEditable, which would
  // otherwise keep receiving the keys. Capturing also stops the app's global
  // accelerators from firing underneath an open menu.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (openMenus[openMenus.length - 1] !== token.current) return;

      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          handled();
          step(e.key === 'ArrowDown' ? 1 : -1);
          break;
        case 'Enter':
        case ' ':
          handled();
          if (index >= 0) choose(entries[index], index);
          break;
        case 'ArrowRight':
          if (!entries[index]?.submenu) return;
          handled();
          setOpenSub(index);
          break;
        case 'ArrowLeft':
          handled();
          // In a submenu this steps back out; at the root there's nowhere
          // left to go, so the menu closes.
          if (onDismiss) onDismiss();
          else onClose();
          break;
        case 'Escape':
          handled();
          if (onDismiss) onDismiss();
          else onClose();
          break;
        case 'Home':
        case 'End':
          handled();
          setIndex(-1);
          step(e.key === 'Home' ? 1 : -1);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  function hover(i: number, entry: MenuEntry) {
    if (!isSelectable(entry)) return;
    setIndex(i);
    window.clearTimeout(subTimer.current);
    if (entry.submenu) {
      subTimer.current = window.setTimeout(() => setOpenSub(i), SUBMENU_DELAY);
    } else if (openSub !== null) {
      subTimer.current = window.setTimeout(() => setOpenSub(null), SUBMENU_DELAY);
    }
  }

  return (
    <ul
      ref={ref}
      className="popup-menu"
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
    >
      {entries.map((entry, i) =>
        entry.separator ? (
          <li key={`sep-${i}`} className="popup-sep" role="separator" />
        ) : (
          <li key={`${entry.label}-${i}`} className="popup-item-wrap">
            <button
              type="button"
              role="menuitem"
              className={[
                'popup-item',
                i === index ? 'is-active' : '',
                entry.disabled ? 'is-disabled' : '',
                entry.danger ? 'is-danger' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={entry.disabled}
              onMouseEnter={() => hover(i, entry)}
              onClick={() => choose(entry, i)}
            >
              <span className="popup-check">{entry.checked ? '✓' : ''}</span>
              <span className="popup-label">{entry.label}</span>
              {entry.submenu ? (
                <span className="popup-arrow">›</span>
              ) : entry.accelerator ? (
                <span className="popup-accel">
                  {formatAccelerator(entry.accelerator)}
                </span>
              ) : null}
            </button>
            {openSub === i && entry.submenu && (
              <SubMenu
                entries={entry.submenu}
                anchor={ref.current}
                onClose={onClose}
                onDismiss={() => setOpenSub(null)}
              />
            )}
          </li>
        )
      )}
    </ul>
  );
}

/** Positions a submenu against its parent item's right edge. */
function SubMenu({
  entries,
  anchor,
  onClose,
  onDismiss,
}: {
  entries: MenuEntry[];
  anchor: HTMLElement | null;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const item = holder.current?.parentElement;
    const parent = anchor?.getBoundingClientRect();
    if (!item || !parent) return;
    const rect = item.getBoundingClientRect();
    setOrigin({ x: parent.right - 4, y: rect.top - 4 });
  }, [anchor]);

  return (
    <span ref={holder}>
      {origin && (
        <PopupMenu
          nested
          entries={entries}
          x={origin.x}
          y={origin.y}
          onClose={onClose}
          onDismiss={onDismiss}
        />
      )}
    </span>
  );
}
