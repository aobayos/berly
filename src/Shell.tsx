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
import { importProject, pickImportFile } from '@/services/storage';
import type { ImportedScreenplay } from '@/services/screenplayImport';
import { parseScreenplay } from '@/services/screenplayImport';
import { appendEpisode, projectFromImport, replaceEpisode } from '@/services/screenplayMerge';
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
	const { openProject, activeTab } = useTabs();
	const guard = useUnsavedGuard();
	// The desktop window has no address bar to keep in step.
	useAddressBar(!isDesktop);
	const [openModal, setOpenModal] = useState<OpenMode | null>(null);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const [recents, setRecents] = useState<RecentProject[]>([]);
	const fileInput = useRef<HTMLInputElement>(null);
	/** The series an import was started from, held across the file picker. */
	const importInto = useRef<string | undefined>(undefined);
	const [pendingImport, setPendingImport] = useState<{
		filename: string;
		imported: ImportedScreenplay;
		intoShow?: string;
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
		[refreshRecents],
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
		[openProject],
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
				setPendingImport({
					filename: name,
					imported: parsed,
					intoShow: importInto.current,
				});
			} catch {
				window.alert(t.importFailed);
			}
		},
		[t],
	);

	/** The one way in for anything from outside: a BERLY project is copied into
	 * the library, anything else is read as a screenplay (Fountain, Final Draft,
	 * Trelby) and goes to the import dialog. Decided by content, like the
	 * screenplay formats themselves — a project is JSON, none of them are. */
	const importText = useCallback(
		(name: string, text: string) => {
			if (!/^\s*\{/.test(text)) {
				stageScreenplay(name, text);
				return;
			}
			void importProject(text)
				.then((project) => {
					openProject(project.id, { title: project.name, kind: project.kind });
					setOpenModal(null);
				})
				.catch(() => window.alert(t.importError));
		},
		[stageScreenplay, openProject, t],
	);

	/** Native picker on the desktop, file input in the browser — the same split
	 * as openFromFile, for the same reason. */
	const pickImport = useCallback(
		(intoShow?: string) => {
			importInto.current = intoShow;
			if (!isFileBased) {
				fileInput.current?.click();
				return;
			}
			void pickImportFile().then((file) => {
				if (file) importText(file.name, file.text);
			});
		},
		[importText],
	);
	const importFile = useCallback(() => pickImport(), [pickImport]);
	const importEpisode = useCallback((showId: string) => pickImport(showId), [pickImport]);

	const shellActions = useMemo<ShellActions>(
		() => ({
			openProjectDialog,
			openFromFile,
			importFile,
			importEpisode,
			showShortcuts: () => setShortcutsOpen(true),
		}),
		[openProjectDialog, openFromFile, importFile, importEpisode],
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
		[shellActions, recents, openRecent, refreshRecents],
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
		[commands],
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
		[guard],
	);

	// Recents change whenever a project is opened in a tab.
	useEffect(() => {
		if (openModal === null) refreshRecents();
	}, [openModal, refreshRecents]);

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
		// Straight to the script that was just written: an added episode is the
		// last one, a replaced one keeps its id; a new project lands as usual.
		const scriptId =
			target.kind === 'append'
				? project.scripts[project.scripts.length - 1]?.id
				: target.kind === 'replace'
					? target.scriptId
					: undefined;
		openProject(project.id, {
			title: project.name,
			kind: project.kind,
			path: scriptId ? `/project/${project.id}/script/${scriptId}` : undefined,
		});
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
								onImportClick={importFile}
							/>
						}
					/>
				</div>
			</div>

			{openModal && (
				<OpenProjectModal
					mode={openModal}
					onClose={() => setOpenModal(null)}
					onImportClick={importFile}
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
					// From a series' own button the target is settled; from the menu
					// inside a series tab it is only the likely answer.
					intoShow={pendingImport.intoShow ?? (activeTab?.kind === 'show' ? activeTab.projectId : undefined)}
					locked={Boolean(pendingImport.intoShow)}
				/>
			)}

			{importReport && Object.keys(importReport).length > 0 && (
				<div
					className="modal-backdrop"
					onMouseDown={() => setImportReport(null)}>
					<div
						className="modal modal-narrow"
						role="dialog"
						aria-modal="true"
						onMouseDown={(e) => e.stopPropagation()}>
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
								onClick={() => setImportReport(null)}>
								{t.close}
							</button>
						</div>
					</div>
				</div>
			)}

			<input
				ref={fileInput}
				type="file"
				accept=".berly,.json,application/json,.fountain,.fdx,.trelby,.txt,.spmd"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void file.text().then((text) => importText(file.name, text));
					e.target.value = '';
				}}
			/>
		</ShellActionsProvider>
	);
}
