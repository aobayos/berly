// All persistence goes through this module. It routes to the Electron IPC
// backend (window.berlyAPI, injected by electron/preload.cts) when running
// inside the desktop app, and falls back to the localStorage-backed web
// implementation (./web.ts) in the browser.
import type { ImportedFile, Project, StorageBackend } from '../model/types';
import * as webBackend from './web';

declare global {
  interface Window {
    berlyAPI?: StorageBackend;
  }
}

/** Exported for ./documents.ts, which needs to ask the backend which optional
 * capabilities it has (document files, recovery) rather than assume them. */
export const backend: StorageBackend = window.berlyAPI ?? webBackend;

export const listProjects = backend.listProjects;
export const loadProject = backend.loadProject;
export const saveProject = backend.saveProject;
export const deleteProject = backend.deleteProject;
export const importProject = backend.importProject;

/** Exports the script to a PDF. On desktop, this builds the PDF directly
 * from project/script data and writes it via a native save dialog
 * (electron/main.cts + electron/screenplayPdf.ts); on the web, there's no
 * such API, so it falls back to window.print() (the user picks "Save as
 * PDF" in the browser's print dialog, which uses the @media print CSS). */
export async function exportPdf(
  project: Project,
  scriptId: string,
  filename: string
): Promise<void> {
  if (backend.exportPdf) {
    await backend.exportPdf(project, scriptId, filename);
  } else {
    window.print();
  }
}

/** Native screenplay picker, desktop only. Null on the web, where there is no
 * way to read an arbitrary path — App.tsx falls back to a file input, the same
 * split as openFromFile. */
export async function pickScreenplayFile(): Promise<ImportedFile | null> {
  return backend.pickScreenplay ? backend.pickScreenplay() : null;
}

/** Triggers a browser download of the given content. Works the same in the
 * Electron renderer (Chromium) as it does on the web, so it isn't part of
 * the backend abstraction above. */
export function downloadFile(
  filename: string,
  content: string,
  mime = 'application/json'
): void {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
