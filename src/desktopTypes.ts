// Shared between the Electron preload (electron/preload.cts) and the
// renderer facade (src/desktop.ts). Kept in its own module — rather than in
// types.ts — because types.ts describes the screenplay data model and this
// describes the desktop shell.

export interface RecentProject {
  id: string;
  name: string;
  kind: 'movie' | 'show';
  /** Absolute path of the backing file; empty on the web. */
  path: string;
  openedAt: number;
}

/** What Chromium found under the cursor when a context menu was requested.
 * `misspelledWord` is empty when the click wasn't on a flagged word. */
export interface SpellContext {
  misspelledWord: string;
  suggestions: string[];
  x: number;
  y: number;
}

/** Unsubscribes an event listener registered through the bridge. */
export type Unsubscribe = () => void;

export interface DesktopBridge {
  platform: string;

  // Window chrome — the app draws its own title bar, so it drives these.
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(cb: (maximized: boolean) => void): Unsubscribe;

  /** Closing with unsaved work is vetoed in the main process and handed back
   * here, so the app can ask the writer in its own language and styling
   * rather than through a native message box. */
  setUnsaved(unsaved: boolean): void;
  onRequestClose(cb: () => void): Unsubscribe;
  /** Close for real, once that question has been answered. */
  forceClose(): void;

  // Clipboard, for the custom context menu (the browser's own paste is
  // gated behind a permission prompt in some contexts; Electron's isn't).
  readText(): Promise<string>;
  writeText(text: string): void;

  // Spelling. The app draws its own context menu, so Chromium's suggestions
  // have to be fetched and applied through here rather than picked from the
  // native menu that never appears.
  setSpellCheckerLanguage(lang: string): void;
  addWordToDictionary(word: string): void;
  onSpellContext(cb: (info: SpellContext) => void): Unsubscribe;

  // Recent documents: both our own store and the OS list.
  listRecents(): Promise<RecentProject[]>;
  addRecent(id: string, name: string, kind: 'movie' | 'show'): void;
  removeRecent(id: string): void;
  clearRecents(): void;

  /** Project files the OS asked us to open before the UI was listening. */
  takePendingPaths(): Promise<string[]>;
  onOpenProject(cb: (projectId: string) => void): Unsubscribe;
  onMenuCommand(cb: (command: string) => void): Unsubscribe;
}
