// Accelerator strings are written once ("Mod+Shift+Z") and used for both
// display in menus and matching against keyboard events, so a shortcut can
// never drift from its label. "Mod" is Ctrl everywhere except macOS, where
// it is Cmd.
import { isMac } from '../desktop/bridge';

interface ParsedAccelerator {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parse(accelerator: string): ParsedAccelerator {
  const parts = accelerator.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  const mod = mods.includes('mod');
  return {
    ctrl: mods.includes('ctrl') || (mod && !isMac),
    meta: mods.includes('cmd') || (mod && isMac),
    shift: mods.includes('shift'),
    alt: mods.includes('alt'),
    key,
  };
}

function keyMatches(event: KeyboardEvent, key: string): boolean {
  // Digits go through event.code: with Shift held, event.key on several
  // layouts is the shifted symbol rather than the number.
  if (/^[0-9]$/.test(key)) return event.code === `Digit${key}`;
  return event.key.toLowerCase() === key.toLowerCase();
}

export function matchesAccelerator(
  event: KeyboardEvent,
  accelerator: string
): boolean {
  const a = parse(accelerator);
  return (
    event.ctrlKey === a.ctrl &&
    event.metaKey === a.meta &&
    event.shiftKey === a.shift &&
    event.altKey === a.alt &&
    keyMatches(event, a.key)
  );
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  cmd: '⌘',
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
};

const KEY_LABELS: Record<string, string> = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  escape: 'Esc',
};

/** Human-readable form for the right-hand column of a menu. */
export function formatAccelerator(accelerator: string): string {
  const parts = accelerator.split('+');
  const key = parts[parts.length - 1];
  const label =
    KEY_LABELS[key.toLowerCase()] ??
    (key.length === 1 ? key.toUpperCase() : key);
  const mods = parts.slice(0, -1).map((m) => {
    const lower = m.toLowerCase();
    if (isMac) return MAC_SYMBOLS[lower] ?? m;
    return lower === 'mod' ? 'Ctrl' : m;
  });
  return isMac ? [...mods, label].join('') : [...mods, label].join('+');
}
