// Document files: the desktop build stores a project as a real .berly file
// wherever the writer chooses, the way Photoshop or FL Studio do, rather than
// hiding it in an app-owned library. Three pieces of state make that work:
//
//   documents.json  id → path, so a project restored from the tab session
//                   after a restart still resolves to its file
//   projects/       the old library, now only the scratch space for projects
//                   that have never been saved anywhere ("untitled")
//   recovery/       a continuously-written copy of unsaved work, so a crash
//                   between two Ctrl+S costs nothing
//
// Path resolution lives here rather than in main.cts so the IPC handlers stay
// thin, and so nothing else has to know which of the three a project is in.
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { migrate } from '../src/model/projectMigrate';
import type { Project } from '../src/model/types';

export const DOCUMENT_EXTENSION = 'berly';

function userFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function indexPath(): string {
  return userFile('documents.json');
}

function untitledDir(): string {
  return userFile('projects');
}

function recoveryDir(): string {
  return userFile('recovery');
}

// ---------- id → path index ----------

type DocumentIndex = Record<string, string>;

function readIndex(): DocumentIndex {
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath(), 'utf-8')) as unknown;
    if (typeof raw !== 'object' || raw === null) return {};
    const index: DocumentIndex = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'string') index[id] = value;
    }
    return index;
  } catch {
    return {};
  }
}

function writeIndex(index: DocumentIndex): void {
  try {
    fs.writeFileSync(indexPath(), JSON.stringify(index));
  } catch {
    // Losing the index costs a re-Open, never the file itself.
  }
}

/** The file backing a project, or null while it is still untitled. Entries
 * whose file has since been moved or deleted are dropped rather than
 * returned, so callers never hand a dead path to a dialog. */
export function documentPath(id: string): string | null {
  const stored = readIndex()[id];
  if (!stored) return null;
  if (fs.existsSync(stored)) return stored;
  forgetDocument(id);
  return null;
}

export function rememberDocument(id: string, filePath: string): void {
  const index = readIndex();
  index[id] = filePath;
  writeIndex(index);
}

export function forgetDocument(id: string): void {
  const index = readIndex();
  if (!(id in index)) return;
  delete index[id];
  writeIndex(index);
}

// ---------- Reading and writing project files ----------

export function readProjectFile(filePath: string): Project | null {
  try {
    return migrate(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    return null;
  }
}

/** Writes via a temporary file in the same directory, then renames over the
 * original — a half-written screenplay is worse than an unwritten one, and
 * rename is atomic within a volume on both Windows and macOS. */
function writeJsonFile(filePath: string, data: unknown): void {
  const temp = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, filePath);
}

export function writeProjectFile(filePath: string, project: Project): void {
  writeJsonFile(filePath, project);
}

/** A filename the writer will recognise: the project's own name, stripped of
 * everything a filesystem would object to. */
export function suggestedFilename(project: Project): string {
  const base =
    project.name
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'untitled';
  return `${base}.${DOCUMENT_EXTENSION}`;
}

// ---------- Untitled projects ----------

/** Projects that have never been saved still need somewhere to live between
 * launches — the tab session restores them by id. They keep using the old
 * library directory until their first real save. */
export function untitledPath(id: string): string {
  return path.join(untitledDir(), `${id}.json`);
}

export function readUntitled(id: string): Project | null {
  return readProjectFile(untitledPath(id));
}

export function writeUntitled(project: Project): void {
  fs.mkdirSync(untitledDir(), { recursive: true });
  writeProjectFile(untitledPath(project.id), project);
}

export function discardUntitled(id: string): void {
  fs.rmSync(untitledPath(id), { force: true });
}

export function listUntitled(): Project[] {
  try {
    return fs
      .readdirSync(untitledDir())
      .filter((file) => file.endsWith('.json'))
      .map((file) => readProjectFile(path.join(untitledDir(), file)))
      .filter((p): p is Project => Boolean(p));
  } catch {
    return [];
  }
}

/** Resolves a project id to wherever it actually lives — its own file first,
 * then the untitled scratch space. */
export function loadProjectById(id: string): Project | null {
  const filePath = documentPath(id);
  return filePath ? readProjectFile(filePath) : readUntitled(id);
}

/** Saves a project back to wherever it already lives. Used by the autosave
 * seam on the web side of the fence and by importProject; documents proper go
 * through saveDocument, which can prompt. */
export function saveProjectById(project: Project): void {
  const filePath = documentPath(project.id);
  if (filePath) writeProjectFile(filePath, project);
  else writeUntitled(project);
}

// ---------- Recovery ----------

interface RecoveryFile {
  path: string | null;
  savedAt: number;
  project: Project;
}

function recoveryPath(id: string): string {
  return path.join(recoveryDir(), `${id}.json`);
}

export function writeRecovery(project: Project): void {
  try {
    fs.mkdirSync(recoveryDir(), { recursive: true });
    const payload: RecoveryFile = {
      path: documentPath(project.id),
      savedAt: Date.now(),
      project,
    };
    writeJsonFile(recoveryPath(project.id), payload);
  } catch {
    // Recovery is a safety net, never a reason to interrupt typing.
  }
}

export function discardRecovery(id: string): void {
  fs.rmSync(recoveryPath(id), { force: true });
}

function readRecoveryFile(id: string): RecoveryFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(recoveryPath(id), 'utf-8')) as RecoveryFile;
    const project = migrate(raw?.project);
    if (!project) return null;
    return {
      path: typeof raw.path === 'string' ? raw.path : null,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      project,
    };
  } catch {
    return null;
  }
}

export function loadRecovery(id: string): Project | null {
  return readRecoveryFile(id)?.project ?? null;
}

/** Recovery files left behind by a crash. A file whose contents already match
 * what's on disk is dropped silently — offering to "recover" an identical
 * copy would train the writer to dismiss the prompt without reading it. */
export function listRecoveries(): {
  id: string;
  name: string;
  path: string | null;
  savedAt: number;
}[] {
  let files: string[];
  try {
    files = fs.readdirSync(recoveryDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const found = [];
  for (const file of files) {
    const id = file.slice(0, -'.json'.length);
    const recovery = readRecoveryFile(id);
    if (!recovery) {
      discardRecovery(id);
      continue;
    }
    const saved = recovery.path
      ? readProjectFile(recovery.path)
      : readUntitled(id);
    if (saved && JSON.stringify(saved) === JSON.stringify(recovery.project)) {
      discardRecovery(id);
      continue;
    }
    found.push({
      id,
      name: recovery.project.name,
      path: recovery.path,
      savedAt: recovery.savedAt,
    });
  }
  return found.sort((a, b) => b.savedAt - a.savedAt);
}
