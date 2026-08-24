// Preload must stay CommonJS (Electron's sandboxed preload loader doesn't
// support ESM in dev) — hence the .cts extension, which TypeScript always
// treats as CommonJS and emits as .cjs regardless of the root package.json's
// "type": "module".
import { contextBridge, ipcRenderer } from 'electron';
import type {
  DocumentInfo,
  ImportedFile,
  Project,
  ProjectMeta,
  RecoveryInfo,
  StorageBackend,
} from '../src/model/types';
import type { DesktopBridge, RecentProject, SpellContext } from '../src/desktop/types';

const berlyAPI: StorageBackend = {
  listProjects: () => ipcRenderer.invoke('listProjects') as Promise<ProjectMeta[]>,
  loadProject: (id: string) =>
    ipcRenderer.invoke('loadProject', id) as Promise<Project | null>,
  saveProject: (project: Project) =>
    ipcRenderer.invoke('saveProject', project) as Promise<void>,
  deleteProject: (id: string) =>
    ipcRenderer.invoke('deleteProject', id) as Promise<void>,
  importProject: (json: string) =>
    ipcRenderer.invoke('importProject', json) as Promise<Project>,
  exportPdf: (project: Project, scriptId: string, filename: string) =>
    ipcRenderer.invoke('exportPdf', project, scriptId, filename) as Promise<void>,

  // Document files — the desktop build's real storage model.
  openDocument: () => ipcRenderer.invoke('doc:open') as Promise<DocumentInfo | null>,
  openDocumentPath: (filePath: string) =>
    ipcRenderer.invoke('doc:openPath', filePath) as Promise<DocumentInfo | null>,
  saveDocument: (project: Project) =>
    ipcRenderer.invoke('doc:save', project) as Promise<DocumentInfo | null>,
  saveDocumentAs: (project: Project) =>
    ipcRenderer.invoke('doc:saveAs', project) as Promise<DocumentInfo | null>,
  documentInfo: (id: string) =>
    ipcRenderer.invoke('doc:info', id) as Promise<DocumentInfo | null>,

  pickScreenplay: () =>
    ipcRenderer.invoke('doc:pickScreenplay') as Promise<ImportedFile | null>,

  writeRecovery: (project: Project) =>
    ipcRenderer.invoke('doc:writeRecovery', project) as Promise<void>,
  listRecoveries: () =>
    ipcRenderer.invoke('doc:listRecoveries') as Promise<RecoveryInfo[]>,
  loadRecovery: (id: string) =>
    ipcRenderer.invoke('doc:loadRecovery', id) as Promise<Project | null>,
  discardRecovery: (id: string) =>
    ipcRenderer.invoke('doc:discardRecovery', id) as Promise<void>,
};

/** Everything that isn't persistence: window chrome, OS menus, recent
 * documents, clipboard. Kept apart from berlyAPI so src/storage/index.ts stays the
 * single seam for saving/loading (see CLAUDE.md). */
const berlyDesktop: DesktopBridge = {
  platform: process.platform,

  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  close: () => ipcRenderer.send('window:close'),
  forceClose: () => ipcRenderer.send('window:forceClose'),
  setUnsaved: (unsaved: boolean) => ipcRenderer.send('doc:setUnsaved', unsaved),
  onRequestClose: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('app:requestClose', listener);
    return () => ipcRenderer.off('app:requestClose', listener);
  },
  isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on('window:maximizedChanged', listener);
    return () => ipcRenderer.off('window:maximizedChanged', listener);
  },

  readText: () => ipcRenderer.invoke('clipboard:readText') as Promise<string>,
  writeText: (text: string) => ipcRenderer.send('clipboard:writeText', text),

  setSpellCheckerLanguage: (lang: string) =>
    ipcRenderer.send('spell:setLanguage', lang),
  addWordToDictionary: (word: string) =>
    ipcRenderer.send('spell:addToDictionary', word),
  onSpellContext: (cb: (info: SpellContext) => void) => {
    const listener = (_e: unknown, info: SpellContext) => cb(info);
    ipcRenderer.on('spell:context', listener);
    return () => ipcRenderer.off('spell:context', listener);
  },

  listRecents: () => ipcRenderer.invoke('recents:list') as Promise<RecentProject[]>,
  addRecent: (id: string, name: string, kind: 'movie' | 'show') =>
    ipcRenderer.send('recents:add', id, name, kind),
  removeRecent: (id: string) => ipcRenderer.send('recents:remove', id),
  clearRecents: () => ipcRenderer.send('recents:clear'),

  takePendingPaths: () =>
    ipcRenderer.invoke('app:takePendingPaths') as Promise<string[]>,
  onOpenProject: (cb: (projectId: string) => void) => {
    const listener = (_e: unknown, projectId: string) => cb(projectId);
    ipcRenderer.on('app:openProject', listener);
    return () => ipcRenderer.off('app:openProject', listener);
  },
  onMenuCommand: (cb: (command: string) => void) => {
    const listener = (_e: unknown, command: string) => cb(command);
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.off('menu:command', listener);
  },
};

contextBridge.exposeInMainWorld('berlyAPI', berlyAPI);
contextBridge.exposeInMainWorld('berlyDesktop', berlyDesktop);
