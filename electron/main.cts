import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  shell,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { migrate } from '../src/model/projectMigrate';
import { newId } from '../src/model/types';
import type { DocumentInfo, Project, ProjectMeta, RecoveryInfo } from '../src/model/types';
import { writeScreenplayPdf } from './screenplayPdf';
import {
  addRecent,
  clearRecents,
  pruneRecents,
  removeRecent,
  type RecentEntry,
} from './recents';
import {
  DOCUMENT_EXTENSION,
  discardRecovery,
  discardUntitled,
  documentPath,
  forgetDocument,
  listRecoveries,
  listUntitled,
  loadProjectById,
  loadRecovery,
  readProjectFile,
  rememberDocument,
  saveProjectById,
  suggestedFilename,
  writeProjectFile,
  writeRecovery,
} from './documents';

const isMac = process.platform === 'darwin';

const FILE_FILTERS = [
  { name: 'BERLY project', extensions: [DOCUMENT_EXTENSION, 'json'] },
];

function meta(project: Project): ProjectMeta {
  return {
    id: project.id,
    kind: project.kind,
    name: project.name,
    scriptCount: project.scripts.length,
    sceneCount: project.scripts.reduce(
      (n, s) => n + s.elements.filter((el) => el.type === 'scene').length,
      0
    ),
    updatedAt: project.updatedAt,
  };
}

function info(project: Project, filePath: string): DocumentInfo {
  return { id: project.id, path: filePath, name: project.name, kind: project.kind };
}

/** Everything the writer can reopen without going through a file dialog:
 * projects still untitled, plus documents we've seen before whose file is
 * still where we left it. */
ipcMain.handle('listProjects', (): ProjectMeta[] => {
  const projects = [...listUntitled()];
  for (const entry of pruneRecents()) {
    if (projects.some((p) => p.id === entry.id)) continue;
    const project = readProjectFile(entry.path);
    if (project) projects.push(project);
  }
  return projects.map(meta).sort((a, b) => b.updatedAt - a.updatedAt);
});

ipcMain.handle('loadProject', (_e, id: string): Project | null => loadProjectById(id));

ipcMain.handle('saveProject', (_e, project: Project): void => {
  saveProjectById(project);
});

/** Removing a project from the list must never quietly destroy the writer's
 * file: a real document goes to the OS trash (recoverable, and visible where
 * they'd look for it), while an untitled one — which exists nowhere else —
 * is simply dropped. */
ipcMain.handle('deleteProject', async (_e, id: string): Promise<void> => {
  const filePath = documentPath(id);
  if (filePath) {
    await shell.trashItem(filePath).catch(() => {});
    forgetDocument(id);
  } else {
    discardUntitled(id);
  }
  discardRecovery(id);
  removeRecent(id);
});

/** Validates imported JSON and registers it under a fresh id — mirrors
 * src/storage/web.ts's importProject so both backends behave identically. */
ipcMain.handle('importProject', (_e, json: string): Project => {
  const data = migrate(JSON.parse(json));
  if (!data) throw new Error('Invalid BERLY project file');
  const project: Project = {
    ...data,
    id: newId(),
    scripts: data.scripts.map((s) => ({
      ...s,
      id: newId(),
      elements: s.elements.map((el) => ({ ...el, id: newId() })),
    })),
    updatedAt: Date.now(),
  };
  saveProjectById(project);
  return project;
});

// ---------- Document files ----------

/** Registers a file as the home of the project it contains. Reopening the
 * same file later lands on the same project id, so it reuses its tab rather
 * than piling up duplicates. */
function adopt(filePath: string): DocumentInfo | null {
  const project = readProjectFile(filePath);
  if (!project) return null;
  rememberDocument(project.id, filePath);
  addRecent({ id: project.id, name: project.name, kind: project.kind, path: filePath });
  return info(project, filePath);
}

ipcMain.handle('doc:open', async (e): Promise<DocumentInfo | null> => {
  const win = senderWindow(e);
  const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: FILE_FILTERS,
  });
  if (canceled || filePaths.length === 0) return null;
  return adopt(filePaths[0]);
});

ipcMain.handle(
  'doc:openPath',
  (_e, filePath: string): DocumentInfo | null => adopt(filePath)
);

ipcMain.handle('doc:info', (_e, id: string): DocumentInfo | null => {
  const filePath = documentPath(id);
  if (!filePath) return null;
  const project = readProjectFile(filePath);
  return project ? info(project, filePath) : null;
});

async function saveAs(
  win: BrowserWindow | null,
  project: Project
): Promise<DocumentInfo | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(win!, {
    title: 'Save Project',
    defaultPath: documentPath(project.id) ?? suggestedFilename(project),
    filters: FILE_FILTERS,
  });
  if (canceled || !filePath) return null;

  writeProjectFile(filePath, project);
  rememberDocument(project.id, filePath);
  // It has a real home now, so the untitled scratch copy is dead weight.
  discardUntitled(project.id);
  discardRecovery(project.id);
  addRecent({ id: project.id, name: project.name, kind: project.kind, path: filePath });
  return info(project, filePath);
}

ipcMain.handle('doc:save', async (e, project: Project): Promise<DocumentInfo | null> => {
  const filePath = documentPath(project.id);
  if (!filePath) return saveAs(senderWindow(e), project);
  writeProjectFile(filePath, project);
  discardRecovery(project.id);
  addRecent({ id: project.id, name: project.name, kind: project.kind, path: filePath });
  return info(project, filePath);
});

ipcMain.handle('doc:saveAs', (e, project: Project): Promise<DocumentInfo | null> =>
  saveAs(senderWindow(e), project)
);

ipcMain.handle('doc:writeRecovery', (_e, project: Project): void => {
  writeRecovery(project);
});

ipcMain.handle('doc:listRecoveries', (): RecoveryInfo[] => listRecoveries());

ipcMain.handle('doc:loadRecovery', (_e, id: string): Project | null => loadRecovery(id));

ipcMain.handle('doc:discardRecovery', (_e, id: string): void => {
  discardRecovery(id);
});

/** Builds the PDF directly from the project/script data (see
 * screenplayPdf.ts) rather than rendering the app's page —
 * webContents.printToPDF() only captures what fits the window's viewport
 * instead of truly paginating, which cropped longer scripts. */
ipcMain.handle(
  'exportPdf',
  async (event, project: Project, scriptId: string, filename: string): Promise<void> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const script = project.scripts.find((s) => s.id === scriptId);
    if (!script) return;

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return;

    await writeScreenplayPdf(project, script, filePath);
  }
);

// ---------- Window controls (the frame is ours, so these are too) ----------

function senderWindow(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on('window:minimize', (e) => senderWindow(e)?.minimize());

ipcMain.on('window:toggleMaximize', (e) => {
  const win = senderWindow(e);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

// Closing the window is the one exit that can still lose work, so the
// renderer keeps us posted on whether anything is unsaved: if it is, the
// close is vetoed and handed back to the app, which asks the writer and then
// closes for real through window:forceClose.
let hasUnsavedWork = false;
let closingForReal = false;

ipcMain.on('doc:setUnsaved', (_e, unsaved: boolean) => {
  hasUnsavedWork = unsaved;
});

ipcMain.on('window:close', (e) => senderWindow(e)?.close());

ipcMain.on('window:forceClose', (e) => {
  closingForReal = true;
  senderWindow(e)?.close();
});

ipcMain.handle('window:isMaximized', (e) => senderWindow(e)?.isMaximized() ?? false);

// ---------- Clipboard (context-menu cut/copy/paste) ----------

ipcMain.handle('clipboard:readText', (): string => clipboard.readText());
ipcMain.on('clipboard:writeText', (_e, text: string) => clipboard.writeText(text));

// ---------- Spelling ----------
//
// Chromium marks misspellings on its own, but the suggestions for them live
// only in the native context menu — which this app replaces with its own (see
// src/shell/contextMenu.tsx). So the words and their suggestions are forwarded to
// the renderer instead, and the corrections are applied back here, where
// replaceMisspelling can edit the field without disturbing the caret.

/** en-US / fr-FR from the app's own language. Hunspell needs an exact code,
 * and a screenplay checked against the wrong dictionary is worse than one
 * that isn't checked at all — every word comes back wrong. */
function spellCheckerLanguages(lang: string): string[] {
  return lang === 'fr' ? ['fr-FR'] : ['en-US'];
}

ipcMain.on('spell:setLanguage', (e, lang: string) => {
  // macOS uses the system spellchecker, which picks the language itself and
  // rejects being told; there the call is simply not made.
  if (isMac) return;
  try {
    senderWindow(e)?.webContents.session.setSpellCheckerLanguages(
      spellCheckerLanguages(lang)
    );
  } catch {
    // An unavailable dictionary must never take the window down with it.
  }
});

// The correction itself is applied in the renderer (see contextMenu.tsx):
// webContents.replaceMisspelling needs the word to be selected, which a
// right-click never does, and it bypasses the editor's own edit pipeline.
ipcMain.on('spell:addToDictionary', (e, word: string) => {
  e.sender.session.addWordToSpellCheckerDictionary(word);
});

// ---------- Recent documents ----------

ipcMain.handle('recents:list', (): RecentEntry[] => pruneRecents());

ipcMain.on('recents:add', (_e, id: string, name: string, kind: 'movie' | 'show') => {
  const filePath = documentPath(id);
  // Untitled projects have no file to hand the OS, so they stay out of the
  // Jump List until their first save.
  if (filePath) addRecent({ id, name, kind, path: filePath });
});

ipcMain.on('recents:remove', (_e, id: string) => removeRecent(id));
ipcMain.on('recents:clear', () => clearRecents());

// ---------- Opening a project from a file path ----------

/** Resolves a path handed to us by the OS (Jump List, "Open With", argv) to
 * a project id. The file stays where it is — it *is* the project now. */
function openProjectFromPath(filePath: string): string | null {
  return adopt(path.resolve(filePath))?.id ?? null;
}

/** Paths queued before the renderer is ready to receive them. */
const pendingPaths: string[] = [];

function deliverPath(filePath: string): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.webContents.isLoadingMainFrame()) {
    pendingPaths.push(filePath);
    return;
  }
  const id = openProjectFromPath(filePath);
  if (!id) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send('app:openProject', id);
}

/** Picks the project-file argument out of a process argv, if any. */
function fileArg(argv: string[]): string | undefined {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .find((a) => !a.startsWith('-') && /\.(berly|json)$/i.test(a));
}

ipcMain.handle('app:takePendingPaths', (): string[] => {
  const ids: string[] = [];
  for (const p of pendingPaths.splice(0)) {
    const id = openProjectFromPath(p);
    if (id) ids.push(id);
  }
  return ids;
});

// ---------- Menus ----------

/** The app menu is drawn by the renderer (see src/shell/TitleBar.tsx) so
 * it can match the app's theme and language. macOS has no such freedom — the
 * menu bar belongs to the system — so there we build a native menu whose
 * items fire the very same command ids over IPC. */
function send(command: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', command);
}

function buildMacMenu(): void {
  const item = (label: string, command: string, accelerator?: string) =>
    ({ label, accelerator, click: () => send(command) }) as MenuItemConstructorOptions;

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        item('New Project…', 'project.new', 'Cmd+N'),
        item('Open Project…', 'project.open', 'Cmd+O'),
        item('Open from File…', 'project.openFile', 'Cmd+Shift+O'),
        { type: 'separator' },
        item('Save', 'file.save', 'Cmd+S'),
        item('Save As…', 'file.saveAs', 'Cmd+Shift+S'),
        item('Export .fountain', 'file.exportFountain'),
        item('Export PDF', 'file.exportPdf', 'Cmd+P'),
        { type: 'separator' },
        item('Close Tab', 'tab.close', 'Cmd+W'),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'edit.undo', 'Cmd+Z'),
        item('Redo', 'edit.redo', 'Cmd+Shift+Z'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        item('Find', 'edit.find', 'Cmd+F'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('Script', 'view.script'),
        item('Title Page', 'view.title'),
        item('Bible', 'view.bible'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#16151a',
    // Frameless: the title bar, menu and window buttons are all rendered by
    // the app itself. 'hidden' (rather than frame: false) keeps native
    // resize borders, snap layouts and — on macOS — the traffic lights.
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // On by default, but stated outright: this is a writing tool, and the
      // renderer's context menu depends on it being on.
      spellcheck: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Fires as Chromium prepares a context menu, carrying the misspelled word
  // under the cursor and its suggestions. The renderer draws the menu, so the
  // findings are handed over rather than shown here.
  win.webContents.on('context-menu', (_e, params) => {
    win.webContents.send('spell:context', {
      misspelledWord: params.misspelledWord,
      suggestions: params.dictionarySuggestions,
      x: params.x,
      y: params.y,
    });
  });

  win.on('close', (e) => {
    if (!hasUnsavedWork || closingForReal) return;
    e.preventDefault();
    win.webContents.send('app:requestClose');
  });

  const emitMaximized = () =>
    win.webContents.send('window:maximizedChanged', win.isMaximized());
  win.on('maximize', emitMaximized);
  win.on('unmaximize', emitMaximized);
  win.on('enter-full-screen', emitMaximized);
  win.on('leave-full-screen', emitMaximized);

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

// A second launch (double-clicking a project file, or a Jump List entry)
// should reach the running instance rather than start a rival one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = fileArg(argv);
    if (file) deliverPath(file);
    else {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      }
    }
  });

  // macOS delivers "Open With" / "Open Recent" this way; it can fire before
  // the app is ready, hence the queue in deliverPath.
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    deliverPath(filePath);
  });

  const startupFile = fileArg(process.argv);
  if (startupFile) pendingPaths.push(startupFile);

  app.whenReady().then(() => {
    if (isMac) buildMacMenu();
    else Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
