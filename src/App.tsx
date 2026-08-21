import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectList from './components/ProjectList';
import TitleBar from './components/TitleBar';
import TabBar from './components/TabBar';
import Workspace from './components/Workspace';
import OpenProjectModal, { type OpenMode } from './components/OpenProjectModal';
import ShortcutsModal from './components/ShortcutsModal';
import {
  DICTS,
  I18nContext,
  loadLang,
  saveLang,
  useI18n,
  type Lang,
} from './i18n';
import { TabsProvider, useTabs } from './tabs';
import { ContextMenuProvider } from './contextMenu';
import {
  EditorCommandsProvider,
  ShellActionsProvider,
  useCommands,
  useMenus,
  type CommandContext,
  type ShellActions,
} from './appCommands';
import { matchesAccelerator } from './shortcuts';
import {
  clearRecents as clearRecentsStore,
  forceCloseWindow,
  listRecents,
  onMenuCommand,
  onOpenProject,
  onRequestClose,
  setSpellCheckerLanguage,
  setWindowUnsaved,
  takePendingPaths,
} from './desktop';
import { importProject } from './storage';
import {
  discardRecovery,
  isFileBased,
  openFileDialog,
  openFilePath,
  unsavedDocuments,
  useHasUnsaved,
} from './documents';
import { UnsavedGuardProvider, useUnsavedGuard } from './components/UnsavedGuard';
import RecoveryModal from './components/RecoveryModal';
import type { RecentProject } from './desktopTypes';

export default function App() {
  const [lang, setLangState] = useState<Lang>(loadLang);

  // The spellchecker follows the UI language: a French screenplay checked
  // against an English dictionary comes back with every word underlined.
  // The lang attribute is what the browser build keys off; the desktop build
  // is told directly, since Electron's session owns its own dictionaries.
  useEffect(() => {
    document.documentElement.lang = lang;
    setSpellCheckerLanguage(lang);
  }, [lang]);

  const i18n = useMemo(
    () => ({
      lang,
      t: DICTS[lang],
      setLang: (next: Lang) => {
        saveLang(next);
        setLangState(next);
      },
    }),
    [lang]
  );

  return (
    <I18nContext.Provider value={i18n}>
      {/* Above the tabs: closing one has to be able to await the answer. */}
      <UnsavedGuardProvider>
        <TabsProvider>
          <EditorCommandsProvider>
            <ContextMenuProvider>
              <Shell />
            </ContextMenuProvider>
          </EditorCommandsProvider>
        </TabsProvider>
      </UnsavedGuardProvider>
    </I18nContext.Provider>
  );
}

function Shell() {
  const { t } = useI18n();
  const { openProject } = useTabs();
  const guard = useUnsavedGuard();
  const [openModal, setOpenModal] = useState<OpenMode | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshRecents = useCallback(() => {
    void listRecents().then(setRecents);
  }, []);

  useEffect(refreshRecents, [refreshRecents]);

  const openProjectDialog = useCallback(
    (mode: OpenMode) => {
      refreshRecents();
      setOpenModal(mode);
    },
    [refreshRecents]
  );

  /** Native picker on the desktop, where the file itself becomes the open
   * project; a file input in the browser, where importProject has to copy it
   * into local storage first. */
  const openFromFile = useCallback(() => {
    if (!isFileBased) {
      fileInput.current?.click();
      return;
    }
    void openFileDialog().then((info) => {
      if (info) openProject(info.id, { title: info.name, kind: info.kind });
    });
  }, [openProject]);

  /** Recents point at paths, so a project whose file has moved — or that the
   * app has forgotten — still opens as long as the path resolves. */
  const openRecent = useCallback(
    (recent: RecentProject) => {
      if (!isFileBased || !recent.path) {
        openProject(recent.id, { title: recent.name, kind: recent.kind });
        return;
      }
      void openFilePath(recent.path).then((info) => {
        if (info) openProject(info.id, { title: info.name, kind: info.kind });
      });
    },
    [openProject]
  );

  const shellActions = useMemo<ShellActions>(
    () => ({
      openProjectDialog,
      openFromFile,
      showShortcuts: () => setShortcutsOpen(true),
    }),
    [openProjectDialog, openFromFile]
  );

  const commandContext = useMemo<CommandContext>(
    () => ({
      ...shellActions,
      recents,
      openRecent,
      clearRecents: () => {
        clearRecentsStore();
        refreshRecents();
      },
    }),
    [shellActions, recents, openRecent, refreshRecents]
  );

  const commands = useCommands(commandContext);
  const menus = useMenus(commands, commandContext);

  // Every accelerator in one place. Disabled commands still swallow their
  // key so the shell (Ctrl+P's print dialog, say) doesn't take over.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      for (const command of commands) {
        if (!command.accelerator) continue;
        if (!matchesAccelerator(e, command.accelerator)) continue;
        e.preventDefault();
        if (command.enabled) command.run();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands]);

  // macOS drives the same commands from its native menu bar.
  useEffect(
    () =>
      onMenuCommand((id) => {
        const command = commands.find((c) => c.id === id);
        if (command?.enabled) command.run();
      }),
    [commands]
  );

  // Projects handed to us by the OS: a Jump List entry, "Open With", or a
  // file double-clicked while the app was already running.
  useEffect(() => {
    void takePendingPaths().then((ids) => ids.forEach((id) => openProject(id)));
    return onOpenProject((id) => openProject(id));
  }, [openProject]);

  // The main process vetoes a close while anything is unsaved and hands the
  // question back to us; keep it told, then answer for every open document at
  // once and close for real.
  const hasUnsaved = useHasUnsaved();
  useEffect(() => setWindowUnsaved(hasUnsaved), [hasUnsaved]);

  useEffect(
    () =>
      onRequestClose(() => {
        const docs = unsavedDocuments().map((state) => ({
          id: state.project.id,
          name: state.project.name,
        }));
        void guard.confirm(docs).then(async (answer) => {
          if (answer === 'cancelled') return;
          // "Don't save" is an answer about the work, not just the window —
          // keeping the recovery copies would offer it all back on the next
          // launch, overruling what was just decided.
          if (answer === 'discarded') {
            await Promise.all(docs.map((doc) => discardRecovery(doc.id)));
          }
          forceCloseWindow();
        });
      }),
    [guard]
  );

  // Recents change whenever a project is opened in a tab.
  useEffect(() => {
    if (openModal === null) refreshRecents();
  }, [openModal, refreshRecents]);

  function handleImportFile(file: File) {
    void file
      .text()
      .then((text) => importProject(text))
      .then((project) => {
        openProject(project.id, { title: project.name, kind: project.kind });
        setOpenModal(null);
      })
      .catch(() => window.alert(t.importError));
  }

  return (
    <ShellActionsProvider value={shellActions}>
      <div className="app-shell">
        <TitleBar menus={menus} />
        <TabBar onNewTab={() => openProjectDialog('open')} />
        <div className="app-body">
          <Workspace
            empty={
              <ProjectList
                onOpenProject={(id, meta) => openProject(id, meta)}
                onImportClick={() => fileInput.current?.click()}
              />
            }
          />
        </div>
      </div>

      {openModal && (
        <OpenProjectModal
          mode={openModal}
          onClose={() => setOpenModal(null)}
          onImportClick={() => fileInput.current?.click()}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsModal
          commands={commands}
          onClose={() => setShortcutsOpen(false)}
        />
      )}

      <RecoveryModal onOpenProject={openProject} />

      <input
        ref={fileInput}
        type="file"
        accept=".json,.berly,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportFile(file);
          e.target.value = '';
        }}
      />
    </ShellActionsProvider>
  );
}
