export type ElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition';

export type ProjectKind = 'movie' | 'show';

export interface ScriptElement {
  id: string;
  type: ElementType;
  text: string;
}

/** One screenplay document: the whole film for a movie, one episode for a show. */
export interface Script {
  id: string;
  name: string;
  elements: ScriptElement[];
  createdAt: number;
  updatedAt: number;
}

export interface TitlePage {
  title: string;
  credit: string;
  author: string;
  contact: string;
  draftDate: string;
}

export type BibleKind = 'character' | 'location';

/** One labelled line of a character/location sheet. The value is always the
 * writer's; the label is ours only until they rename it.
 *
 * `labelKey` is what keeps the built-in sheet bilingual: a field that still
 * carries one is displayed through the dictionary, so its heading follows the
 * UI language. Renaming a field clears the key — from then on the label is
 * the writer's own text and is left exactly as typed, in whichever language
 * they typed it. */
export interface SheetField {
  id: string;
  labelKey?: string;
  label: string;
  value: string;
  /** Renders as a textarea rather than a single-line input. */
  multiline?: boolean;
}

export interface SheetSection {
  id: string;
  titleKey?: string;
  title: string;
  fields: SheetField[];
}

/** A character or location a writer has declared in the project Bible —
 * either pre-declared before it exists anywhere in the script, or notes
 * added to a name already used in the script. Names are normalized
 * uppercase, matching extractCharacters/extractPlaces. */
export interface BibleEntry {
  name: string;
  kind: BibleKind;
  note: string;
  /** The full sheet. Absent on entries created before sheets existed and on
   * ones the writer has never opened — seeded from the project template on
   * first edit rather than eagerly, so untouched entries stay empty. */
  sheet?: SheetSection[];
}

/** The layout new sheets of each kind start from. Seeded with the built-in
 * sheet, and overwritten when the writer saves a sheet's layout as default. */
export interface SheetTemplates {
  character: SheetSection[];
  location: SheetSection[];
}

export interface Project {
  id: string;
  kind: ProjectKind;
  name: string;
  titlePage: TitlePage;
  scripts: Script[];
  bible: BibleEntry[];
  /** Absent until the first sheet is opened — see sheetTemplate(). */
  sheetTemplates?: SheetTemplates;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMeta {
  id: string;
  kind: ProjectKind;
  name: string;
  scriptCount: number;
  sceneCount: number;
  updatedAt: number;
}

/** A project that lives in a real file on disk. Desktop only: the browser
 * can't write to arbitrary paths, so the web build keeps the id-addressed
 * localStorage library instead (see src/storage/web.ts). */
export interface DocumentInfo {
  id: string;
  /** Absolute path of the .berly file. */
  path: string;
  name: string;
  kind: ProjectKind;
}

/** Unsaved work found on disk after a crash — written continuously beside
 * the document while the writer types (see electron/documents.ts). */
export interface RecoveryInfo {
  id: string;
  name: string;
  /** The document it belongs to, or null when it was never saved anywhere. */
  path: string | null;
  savedAt: number;
}

/** Shape shared by every persistence backend (localStorage on the web,
 * Electron IPC on desktop) — see src/storage/index.ts and electron/preload.cts. */
export interface StorageBackend {
  listProjects(): Promise<ProjectMeta[]>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  importProject(json: string): Promise<Project>;
  /** Only present in the Electron desktop build (electron/preload.cts) —
   * builds the PDF directly from project/script data and writes it via a
   * native save dialog, rather than window.print()'s OS print dialog. */
  exportPdf?(project: Project, scriptId: string, filename: string): Promise<void>;

  // ----- Document files: present only in the desktop build -----
  // src/storage/documents.ts checks for openDocument to decide whether the running
  // build is file-based at all, so these travel as a group.

  /** Native open dialog. Null when the writer cancels or the file is junk. */
  openDocument?(): Promise<DocumentInfo | null>;
  /** Opens a known path — a recent entry, or a file handed over by the OS. */
  openDocumentPath?(path: string): Promise<DocumentInfo | null>;
  /** Writes to the project's own file, falling back to the Save As dialog
   * when it has never been saved. Null when that dialog is cancelled. */
  saveDocument?(project: Project): Promise<DocumentInfo | null>;
  saveDocumentAs?(project: Project): Promise<DocumentInfo | null>;
  /** The file backing an open project, or null while it is still untitled. */
  documentInfo?(id: string): Promise<DocumentInfo | null>;

  /** Background copy of in-progress work; cheap enough to call on a timer. */
  writeRecovery?(project: Project): Promise<void>;
  listRecoveries?(): Promise<RecoveryInfo[]>;
  loadRecovery?(id: string): Promise<Project | null>;
  discardRecovery?(id: string): Promise<void>;
}

export const ELEMENT_TYPES: ElementType[] = [
  'scene',
  'action',
  'character',
  'dialogue',
  'parenthetical',
  'transition',
];

/** The element that logically follows each type when Enter is pressed.
 * Types with no single obvious successor (an action or a line of dialogue can
 * be followed by almost anything) are absent — there Enter opens the type
 * chooser instead. */
export const NEXT_ELEMENT_TYPE: Partial<Record<ElementType, ElementType>> = {
  scene: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  transition: 'scene',
};

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newElement(type: ElementType, text = ''): ScriptElement {
  return { id: newId(), type, text };
}

export function newScript(name: string): Script {
  const now = Date.now();
  return {
    id: newId(),
    name,
    elements: [newElement('scene')],
    createdAt: now,
    updatedAt: now,
  };
}

export function newProject(
  name: string,
  kind: ProjectKind,
  firstScriptName: string
): Project {
  const now = Date.now();
  return {
    id: newId(),
    kind,
    name,
    titlePage: {
      title: name,
      credit: 'Written by',
      author: '',
      contact: '',
      draftDate: '',
    },
    scripts: [newScript(firstScriptName)],
    bible: [],
    createdAt: now,
    updatedAt: now,
  };
}
