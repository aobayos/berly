// Where an imported screenplay lands. The parse has already happened by the
// time this opens, so the dialog can show what it actually found rather than
// asking the writer to commit blind.
import { useEffect, useMemo, useState } from 'react';
import type { ImportedScreenplay, ScreenplayFormat } from '@/services/screenplayImport';
import { nameFromFilename } from '@/services/screenplayImport';
import type { Project, ProjectMeta } from '@/model/types';
import { listProjects } from '@/services/storage';
import { currentProject } from '@/services/storage/documents';
import { useI18n, type Dict } from '@/i18n';

// Exhaustive on purpose: a new import format won't build until it has a name.
const FORMAT_LABEL: Record<ScreenplayFormat, (t: Dict) => string> = {
	fountain: (t) => t.importFormatFountain,
	fdx: (t) => t.importFormatFdx,
	trelby: (t) => t.importFormatTrelby,
};

export type ImportTarget =
	| { kind: 'new'; name: string }
	| { kind: 'append'; project: Project; episodeName: string }
	| { kind: 'replace'; project: Project; scriptId: string };

interface Props {
	filename: string;
	imported: ImportedScreenplay;
	onCancel(): void;
	onConfirm(target: ImportTarget): void;
	/** The series whose tab the import was started from: the dialog opens on
	 * "as an episode" with it already chosen, since that's almost certainly
	 * where the writer means it to go. */
	intoShow?: string;
	/** Started from that series' own Import Episode: where it goes is already
	 * answered, so only the episode itself (name, or which one to replace) is. */
	locked?: boolean;
}

export default function ImportModal({ filename, imported, onCancel, onConfirm, intoShow, locked = false }: Props) {
	const { t } = useI18n();
	const [mode, setMode] = useState<'new' | 'episode'>(intoShow ? 'episode' : 'new');
	const [name, setName] = useState(imported.titlePage.title?.trim() || nameFromFilename(filename));
	const [shows, setShows] = useState<ProjectMeta[]>([]);
	const [showId, setShowId] = useState(intoShow ?? '');
	const [series, setSeries] = useState<Project | null>(null);
	const [episodeMode, setEpisodeMode] = useState<'append' | 'replace'>('append');
	const [scriptId, setScriptId] = useState('');

	useEffect(() => {
		void listProjects().then((all) => setShows(all.filter((p) => p.kind === 'show')));
	}, []);

	// The episode pickers need the full project, not the meta the list carries.
	useEffect(() => {
		if (!showId) {
			setSeries(null);
			return;
		}
		void currentProject(showId).then((p) => {
			setSeries(p);
			setScriptId(p?.scripts[0]?.id ?? '');
		});
	}, [showId]);

	const sceneCount = useMemo(() => imported.elements.filter((el) => el.type === 'scene').length, [imported.elements]);

	const canConfirm =
		mode === 'new' ? name.trim().length > 0 : Boolean(series) && (episodeMode === 'append' || Boolean(scriptId));

	function confirm() {
		if (mode === 'new') {
			onConfirm({ kind: 'new', name: name.trim() });
			return;
		}
		if (!series) return;
		if (episodeMode === 'append') {
			onConfirm({
				kind: 'append',
				project: series,
				episodeName: name.trim() || `${t.defaultEpisodeName} ${series.scripts.length + 1}`,
			});
		} else {
			onConfirm({ kind: 'replace', project: series, scriptId });
		}
	}

	return (
		<div
			className="modal-backdrop"
			onMouseDown={onCancel}>
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				onMouseDown={(e) => e.stopPropagation()}>
				<h2 className="modal-title">{locked ? `${t.importEpisode} · ${series?.name ?? ''}` : t.importTitle}</h2>

				<p className="modal-text import-summary">
					{t.importFrom} <strong>{filename}</strong> · {FORMAT_LABEL[imported.format](t)} · {sceneCount}{' '}
					{t.importScenesRead} · {imported.elements.length} {t.importElementsRead}
				</p>

				{!locked && (
					<div className="import-modes">
						<label>
							<input
								type="radio"
								checked={mode === 'new'}
								onChange={() => setMode('new')}
							/>
							{t.importTargetNew}
						</label>
						<label>
							<input
								type="radio"
								checked={mode === 'episode'}
								onChange={() => setMode('episode')}
								disabled={shows.length === 0}
							/>
							{t.importTargetEpisode}
						</label>
					</div>
				)}

				{mode === 'new' ? (
					<label className="field">
						{t.importProjectName}
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoFocus
						/>
					</label>
				) : !locked && shows.length === 0 ? (
					<p className="import-note">{t.importNoSeries}</p>
				) : (
					<>
						{!locked && (
							<label className="field">
								{t.importSeries}
								<select
									value={showId}
									onChange={(e) => setShowId(e.target.value)}>
									<option value="">—</option>
									{shows.map((s) => (
										<option
											key={s.id}
											value={s.id}>
											{s.name}
										</option>
									))}
								</select>
							</label>
						)}

						{series && (
							<>
								<div className="import-modes">
									<label>
										<input
											type="radio"
											checked={episodeMode === 'append'}
											onChange={() => setEpisodeMode('append')}
										/>
										{t.importModeAppend}
									</label>
									<label>
										<input
											type="radio"
											checked={episodeMode === 'replace'}
											onChange={() => setEpisodeMode('replace')}
										/>
										{t.importModeReplace}
									</label>
								</div>

								{episodeMode === 'append' ? (
									<label className="field">
										{t.importEpisodeName}
										<input
											value={name}
											onChange={(e) => setName(e.target.value)}
										/>
									</label>
								) : (
									<>
										<label className="field">
											{t.importEpisodeToReplace}
											<select
												value={scriptId}
												onChange={(e) => setScriptId(e.target.value)}>
												{series.scripts.map((s) => (
													<option
														key={s.id}
														value={s.id}>
														{s.name}
													</option>
												))}
											</select>
										</label>
										<p className="import-warning">{t.importReplaceWarning}</p>
									</>
								)}
							</>
						)}
					</>
				)}

				<div className="modal-actions">
					<button
						type="button"
						className="btn btn-ghost"
						onClick={onCancel}>
						{t.cancel}
					</button>
					<button
						type="button"
						className="btn btn-primary"
						disabled={!canConfirm}
						onClick={confirm}>
						{t.importConfirm}
					</button>
				</div>
			</div>
		</div>
	);
}
