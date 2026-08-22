// Renderer-side facade over the Electron desktop bridge. Mirrors src/storage/index.ts:
// the rest of the app talks to this module and never to window.berlyDesktop,
// so every feature degrades to something sensible in the browser build
// instead of being conditionally compiled out.
import type {
  DesktopBridge,
  RecentProject,
  SpellContext,
  Unsubscribe,
} from './types';

declare global {
  interface Window {
    berlyDesktop?: DesktopBridge;
  }
}

const bridge = window.berlyDesktop;

/** True inside the Electron shell — drives the custom title bar, which the
 * browser build must not draw (there's no window to control). */
export const isDesktop = Boolean(bridge);

/** macOS keeps its menu bar and traffic lights in the system chrome, so the
 * title bar renders differently there. */
export const isMac =
  bridge?.platform === 'darwin' ||
  (!bridge && navigator.platform.toLowerCase().includes('mac'));

const noop = () => {};
const never: Unsubscribe = noop;

// ---------- Window controls ----------

export const minimizeWindow = () => bridge?.minimize();
export const toggleMaximizeWindow = () => bridge?.toggleMaximize();
export const closeWindow = () => bridge?.close();
export const forceCloseWindow = () => bridge?.forceClose();
export const isWindowMaximized = () => bridge?.isMaximized() ?? Promise.resolve(false);
export const onMaximizedChange = (cb: (maximized: boolean) => void): Unsubscribe =>
  bridge?.onMaximizedChange(cb) ?? never;

/** Tells the shell whether closing the window would lose work. The browser
 * has its own mechanism for this (beforeunload), so this is a no-op there. */
export const setWindowUnsaved = (unsaved: boolean) => bridge?.setUnsaved(unsaved);
export const onRequestClose = (cb: () => void): Unsubscribe =>
  bridge?.onRequestClose(cb) ?? never;

// ---------- Clipboard ----------

export async function readClipboard(): Promise<string> {
  if (bridge) return bridge.readText();
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

export function writeClipboard(text: string): void {
  if (bridge) bridge.writeText(text);
  else void navigator.clipboard?.writeText(text).catch(noop);
}

// ---------- Spelling ----------

/** True where the app can offer corrections itself. The browser keeps its
 * suggestions inside its own context menu with no API to read them, so there
 * the fallback is to let that menu through (see contextMenu.tsx). */
export const canCorrectSpelling = Boolean(bridge);

export const setSpellCheckerLanguage = (lang: string) =>
  bridge?.setSpellCheckerLanguage(lang);
export const addWordToDictionary = (word: string) => bridge?.addWordToDictionary(word);
export const onSpellContext = (cb: (info: SpellContext) => void): Unsubscribe =>
  bridge?.onSpellContext(cb) ?? never;

// ---------- Recent projects ----------

// On the web there's no OS recent-documents list, so recents live in
// localStorage and carry no path. The shape matches the desktop store so the
// Open dialog doesn't care which backend it got.
const WEB_RECENTS_KEY = 'berly.recents';
const MAX_WEB_RECENTS = 20;

function readWebRecents(): RecentProject[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WEB_RECENTS_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as RecentProject[]) : [];
  } catch {
    return [];
  }
}

function writeWebRecents(entries: RecentProject[]): void {
  localStorage.setItem(
    WEB_RECENTS_KEY,
    JSON.stringify(entries.slice(0, MAX_WEB_RECENTS))
  );
}

export function listRecents(): Promise<RecentProject[]> {
  if (bridge) return bridge.listRecents();
  return Promise.resolve(
    readWebRecents().sort((a, b) => b.openedAt - a.openedAt)
  );
}

export function addRecent(
  id: string,
  name: string,
  kind: 'movie' | 'show'
): void {
  if (bridge) {
    bridge.addRecent(id, name, kind);
    return;
  }
  const rest = readWebRecents().filter((e) => e.id !== id);
  writeWebRecents([{ id, name, kind, path: '', openedAt: Date.now() }, ...rest]);
}

export function removeRecent(id: string): void {
  if (bridge) bridge.removeRecent(id);
  else writeWebRecents(readWebRecents().filter((e) => e.id !== id));
}

export function clearRecents(): void {
  if (bridge) bridge.clearRecents();
  else writeWebRecents([]);
}

// ---------- Opening projects from the OS ----------

export const takePendingPaths = (): Promise<string[]> =>
  bridge?.takePendingPaths() ?? Promise.resolve([]);

export const onOpenProject = (cb: (projectId: string) => void): Unsubscribe =>
  bridge?.onOpenProject(cb) ?? never;

export const onMenuCommand = (cb: (command: string) => void): Unsubscribe =>
  bridge?.onMenuCommand(cb) ?? never;
