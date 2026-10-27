import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectList from '@/app/ProjectList';
import TitleBar from '@/components/common/TitleBar';
import TabBar from '@/components/common/TabBar';
import Workspace from '@/app/Workspace';
import OpenProjectModal, { type OpenMode } from '@/components/modals/OpenProjectModal';
import ShortcutsModal from '@/components/modals/ShortcutsModal';
import { useI18n } from '@/i18n';
import { useTabs } from '@/contexts/tabs';
import { useAddressBar } from '@/contexts/addressBar';
import {
  ShellActionsProvider,
  useCommands,
  useMenus,
  type CommandContext,
  type ShellActions,
} from '@/contexts/commands';
import { matchesAccelerator } from '@/services/shortcuts';
import {
  clearRecents as clearRecentsStore,
  forceCloseWindow,
  listRecents,
  onMenuCommand,
  onOpenProject,
  onRequestClose,
  setWindowUnsaved,
  takePendingPaths,
  isDesktop,
} from '@/desktop/bridge';
import { importProject, pickScreenplayFile } from '@/services/storage';
import type { ImportedScreenplay } from '@/services/screenplayImport';
import { parseScreenplay } from '@/services/screenplayImport';
import {
  appendEpisode,
  projectFromImport,
  replaceEpisode,
} from '@/services/screenplayMerge';
import ImportModal, { type ImportTarget } from '@/components/modals/ImportModal';
import {
  commitProject,
  discardRecovery,
  isFileBased,
  openFileDialog,
  openFilePath,
  unsavedDocuments,
  useHasUnsaved,
} from '@/services/storage/documents';
import { useUnsavedGuard } from '@/contexts/UnsavedGuard';
import RecoveryModal from '@/components/modals/RecoveryModal';
import type { RecentProject } from '@/desktop/types';

export default function Shell() {
  const { t } = useI18n();
  const { openProject } = useTabs();
  const guard = useUnsavedGuard();
  // The desktop window has no address bar to keep in step.
  useAddressBar(!isDesktop);
  const [openModal, setOpenModal] = useState<OpenMode | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const screenplayInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    imported: ImportedScreenplay;
  } | null>(null);
  const [importReport, setImportReport] = useState<Record<string, number> | null>(null);

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

  /** Parses immediately so the target dialog can report what was actually
   * found — and so a file that isn't a screenplay fails before the writer has
   * chosen where to put it. */
  const stageScreenplay = useCallback(
    (name: string, text: string) => {
      try {
        const parsed = parseScreenplay(name, text);
        if (parsed.elements.length === 0) {
          window.alert(t.importEmpty);
          return;
        }
        setPendingImport({ filename: name, imported: parsed });
      } catch {
        window.alert(t.importFailed);
      }
    },
    [t]
  );

  /** Native picker on the desktop, file input in the browser — the same split
   * as openFromFile, for the same reason. */
  const importScreenplay = useCallback(() => {
    if (!isFileBased) {
      screenplayInput.current?.click();
      return;
    }
    void pickScreenplayFile().then((file) => {
      if (file) stageScreenplay(file.name, file.text);
    });
  }, [stageScreenplay]);

  const shellActions = useMemo<ShellActions>(
    () => ({
      openProjectDialog,
      openFromFile,
      importScreenplay,
      showShortcuts: () => setShortcutsOpen(true),
    }),
    [openProjectDialog, openFromFile, importScreenplay]
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

  function handleScreenplayFile(file: File) {
    void file.text().then((text) => stageScreenplay(file.name, text));
  }

  async function applyImport(target: ImportTarget) {
    if (!pendingImport) return;
    const { imported } = pendingImport;
    const project =
      target.kind === 'new'
        ? projectFromImport(imported, target.name)
        : target.kind === 'append'
          ? appendEpisode(target.project, imported, target.episodeName)
          : replaceEpisode(target.project, imported, target.scriptId);

    await commitProject(project);
    setPendingImport(null);
    setImportReport(imported.dropped);
    openProject(project.id, { title: project.name, kind: project.kind });
  }

  return (
    <ShellActionsProvider value={shellActions}>
      <div className="app-shell">
        <TitleBar menus={menus} />
        <TabBar onNewTab={() => openProjectDialog('open')} />
        <div className="app-body">
          <Workspace
            home={
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

      {pendingImport && (
        <ImportModal
          filename={pendingImport.filename}
          imported={pendingImport.imported}
          onCancel={() => setPendingImport(null)}
          onConfirm={(target) => void applyImport(target)}
        />
      )}

      {importReport && Object.keys(importReport).length > 0 && (
        <div className="modal-backdrop" onMouseDown={() => setImportReport(null)}>
          <div
            className="modal modal-narrow"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">{t.importDroppedTitle}</h2>
            <p className="modal-text">{t.importDroppedIntro}</p>
            <ul className="modal-list import-dropped">
              {Object.entries(importReport).map(([type, count]) => (
                <li key={type}>
                  {type} × {count}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setImportReport(null)}
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <input
        ref={screenplayInput}
        type="file"
        accept=".fountain,.fdx,.txt,.spmd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleScreenplayFile(file);
          e.target.value = '';
        }}
      />
    </ShellActionsProvider>
  );
}
