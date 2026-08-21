// Open documents: which projects are open, where each one lives on disk, and
// whether it has changes that aren't there yet.
//
// The desktop build is document-based — a project is a .berly file the writer
// puts wherever they like, and it reaches that file only when they save. That
// makes an in-memory home for open projects necessary rather than a nicety:
// Editor remounts whenever the route changes (switching episodes), and
// without this store those unsaved edits would be re-read from the file and
// silently lost. Everything in flight also goes to a recovery copy on a
// timer, so a crash between two saves costs nothing.
//
// The browser build has no file system to speak of (see the answer in
// CLAUDE.md), so it keeps the old behavior: the localStorage library, saved
// continuously, with nothing to mark dirty and nothing to recover.
import { useCallback, useSyncExternalStore } from 'react';
import type { DocumentInfo, Project, RecoveryInfo } from './types';
import { backend, loadProject, saveProject } from './storage';

/** True when projects live in real files the writer chose — desktop only. */
export const isFileBased = Boolean(backend.openDocument);

export interface DocumentState {
  project: Project;
  /** Absolute path of the backing file; null while the project is untitled. */
  path: string | null;
  /** Edits made since the last save. Always false in the web build, which
   * saves continuously and so has nothing to warn about. */
  dirty: boolean;
}

const open = new Map<string, DocumentState>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(id: string, state: DocumentState): void {
  open.set(id, state);
  emit();
}

// ---------- Reading ----------

/** The open copy of a project, loading it from storage on first use. Later
 * calls hand back the in-memory copy, unsaved edits included. */
export async function openDocument(id: string): Promise<Project | null> {
  const existing = open.get(id);
  if (existing) return existing.project;

  const project = await loadProject(id);
  if (!project) return null;

  // Re-check: an await gave another caller the chance to get here first, and
  // two copies of the same project would silently diverge.
  const raced = open.get(id);
  if (raced) return raced.project;

  const info = await backend.documentInfo?.(id);
  set(id, { project, path: info?.path ?? null, dirty: false });
  return project;
}

export function documentState(id: string): DocumentState | undefined {
  return open.get(id);
}

/** Subscribes a component to one document's state. */
export function useDocument(id: string): DocumentState | undefined {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => open.get(id), [id])
  );
}

/** True when any open document has unsaved edits — what the close prompt and
 * the main process's close veto both key off. */
export function useHasUnsaved(): boolean {
  return useSyncExternalStore(subscribe, hasUnsaved);
}

export function hasUnsaved(): boolean {
  for (const state of open.values()) if (state.dirty) return true;
  return false;
}

export function unsavedDocuments(): DocumentState[] {
  return [...open.values()].filter((state) => state.dirty);
}

// ---------- Writing ----------

/** Records an edit in memory. Nothing is written here — the editor's
 * debounce decides when, through writeDraft. */
export function updateDocument(project: Project): void {
  const existing = open.get(project.id);
  set(project.id, {
    project,
    path: existing?.path ?? null,
    dirty: true,
  });
}

/** What the editor's autosave timer fires. On the desktop that's the recovery
 * copy — the document itself is the writer's to save — and the document stays
 * dirty until they do. In the browser there is no file to be behind, so this
 * *is* the save, and it clears the flag. */
export function writeDraft(id: string): void {
  const state = open.get(id);
  if (!state || !state.dirty) return;
  if (isFileBased) {
    void backend.writeRecovery?.(state.project);
  } else {
    void saveProject(state.project);
    set(id, { ...state, dirty: false });
  }
}

/** Writes the document to its file, asking where to put it the first time.
 * Returns false only when the writer cancels that dialog. */
export async function saveDocument(id: string): Promise<boolean> {
  const state = open.get(id);
  if (!state) return false;

  if (!isFileBased) {
    await saveProject(state.project);
    return true;
  }

  const info = await backend.saveDocument?.(state.project);
  if (!info) return false;
  set(id, { ...state, path: info.path, dirty: false });
  return true;
}

/** Save As: always asks, and re-points the project at the new file. */
export async function saveDocumentAs(id: string): Promise<boolean> {
  const state = open.get(id);
  if (!state || !isFileBased) return false;

  const info = await backend.saveDocumentAs?.(state.project);
  if (!info) return false;
  set(id, { ...state, path: info.path, dirty: false });
  return true;
}

/** Drops a document from memory when its tab closes. Anything unsaved stays
 * in the recovery copy — closing a tab is not a decision to discard work, and
 * reopening the project offers it back. */
export function closeDocument(id: string): void {
  const state = open.get(id);
  if (!state) return;
  if (isFileBased && state.dirty) backend.writeRecovery?.(state.project);
  open.delete(id);
  emit();
}

/** Throws away the unsaved edits and the recovery copy with them. */
export async function discardDocument(id: string): Promise<void> {
  await backend.discardRecovery?.(id);
  open.delete(id);
  emit();
}

// ---------- Opening files ----------

export function openFileDialog(): Promise<DocumentInfo | null> {
  return backend.openDocument?.() ?? Promise.resolve(null);
}

export function openFilePath(path: string): Promise<DocumentInfo | null> {
  return backend.openDocumentPath?.(path) ?? Promise.resolve(null);
}

// ---------- Recovery ----------

export function listRecoveries(): Promise<RecoveryInfo[]> {
  return backend.listRecoveries?.() ?? Promise.resolve([]);
}

/** Restores recovered work as the open copy of that project — dirty, because
 * by definition it isn't in the file yet. */
export async function recover(id: string): Promise<Project | null> {
  const project = await backend.loadRecovery?.(id);
  if (!project) return null;
  const info = await backend.documentInfo?.(id);
  set(id, { project, path: info?.path ?? null, dirty: true });
  return project;
}

export function discardRecovery(id: string): Promise<void> {
  return backend.discardRecovery?.(id) ?? Promise.resolve();
}
