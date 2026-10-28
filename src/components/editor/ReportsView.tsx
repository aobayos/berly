// Trelby's script, character, scene and location reports, read off the
// scripts as they stand: one episode in the editor's drawer, the whole
// project on the project page. Every row leads back to the script.
import { useMemo, useState, type ReactNode } from 'react';
import type { BibleEntry } from '@/model/types';
import { ELEMENT_TYPES } from '@/model/types';
import { characterResolver } from '@/services/characterAliases';
import { pageRanges, projectReport, type ReportPart } from '@/services/scriptReport';
import DialogueChart from '@/components/editor/DialogueChart';
import { useI18n } from '@/i18n';

type Tab = 'overview' | 'characters' | 'dialogue' | 'scenes' | 'locations';

interface Props {
	/** The scripts reported on, each with the breaks ScriptPages measured. */
	parts: ReportPart[];
	/** A whole series: rows say which episodes rather than which pages, since
	 * page numbers only mean something within one script. */
	series?: boolean;
	/** Drawer width: the less essential columns go. */
	compact?: boolean;
	/** The project's Bible, so a character's aliases count as them. */
	bible: BibleEntry[];
	onJump(elementId: string): void;
}

export default function ReportsView({ parts, series = false, compact = false, bible, onJump }: Props) {
	const { t, lang } = useI18n();
	const [tab, setTab] = useState<Tab>('overview');
	const report = useMemo(() => projectReport(parts, characterResolver(bible)), [parts, bible]);
	const where = (row: { pages: number[]; episodes: number[] }) => pageRanges(series ? row.episodes : row.pages);
	const whereLabel = series ? t.reportEpisodes : t.pagesTab;

	const number = useMemo(() => new Intl.NumberFormat(lang), [lang]);
	const percent = useMemo(() => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }), [lang]);

	const characters = useSorted(
		report.characters,
		{
			name: (c) => c.name,
			speeches: (c) => c.speeches,
			words: (c) => c.words,
			scenes: (c) => c.scenes,
			pages: (c) => (series ? c.episodes : c.pages).length,
		},
		'words',
	);
	const locations = useSorted(
		report.locations,
		{
			name: (l) => l.name,
			scenes: (l) => l.scenes,
			pages: (l) => (series ? l.episodes : l.pages).length,
		},
		'scenes',
	);

	const tabs: [Tab, string][] = [
		['overview', t.reportOverview],
		['characters', t.bibleCharacters],
		['dialogue', t.reportDialogue],
		['scenes', t.sceneNavigator],
		['locations', t.bibleLocations],
	];

	const className = `reports ${compact ? 'reports-compact' : ''}`;

	if (report.words === 0) {
		return (
			<div className={className}>
				<p className="home-empty">{t.reportEmpty}</p>
			</div>
		);
	}

	const otherWords = report.words - report.dialogueWords - report.actionWords;

	return (
		<div className={className}>
			<div
				className="reports-tabs"
				role="tablist">
				{tabs.map(([id, label]) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						className={`reports-tab ${tab === id ? 'is-active' : ''}`}
						onClick={() => setTab(id)}>
						{label}
					</button>
				))}
			</div>

			{tab === 'overview' && (
				<div className="reports-overview">
					<div className="report-tiles">
						{(
							[
								...(series ? [[t.reportEpisodes, report.episodes.length] as const] : []),
								[t.pagesTab, report.pages],
								[t.sceneNavigator, report.scenes.length],
								[t.bibleCharacters, report.characters.length],
								[t.reportWords, report.words],
							] as const
						).map(([label, value]) => (
							<div
								key={label}
								className="report-tile">
								<span className="report-tile-value">{number.format(value)}</span>
								<span className="report-tile-label">{label}</span>
							</div>
						))}
					</div>

					<section className="report-section">
						<h3 className="bible-heading">{t.reportBalance}</h3>
						<div
							className="report-split"
							aria-hidden="true">
							<span
								className="report-split-dialogue"
								style={{ flexGrow: report.dialogueWords }}
							/>
							<span
								className="report-split-action"
								style={{ flexGrow: report.actionWords }}
							/>
							<span
								className="report-split-other"
								style={{ flexGrow: otherWords }}
							/>
						</div>
						<ul className="report-legend">
							<li>
								<i className="report-split-dialogue" /> {t.elements.dialogue}{' '}
								{percent.format(report.dialogueWords / report.words)}
							</li>
							<li>
								<i className="report-split-action" /> {t.elements.action}{' '}
								{percent.format(report.actionWords / report.words)}
							</li>
							<li>
								<i className="report-split-other" /> {t.reportOther}{' '}
								{percent.format(otherWords / report.words)}
							</li>
						</ul>
					</section>

					{series && (
						<section className="report-section">
							<h3 className="bible-heading">{t.reportEpisodes}</h3>
							<table className="report-table">
								<thead>
									<tr>
										<th className="num">#</th>
										<th>{t.reportName}</th>
										<th className="num">{t.pagesTab}</th>
										<th className="num">{t.sceneNavigator}</th>
										<th className="num">{t.reportWords}</th>
									</tr>
								</thead>
								<tbody>
									{report.episodes.map((e) => (
										<tr key={e.scriptId}>
											<td className="num">{e.number}</td>
											<td>{e.name}</td>
											<td className="num">{number.format(e.pages)}</td>
											<td className="num">{number.format(e.scenes)}</td>
											<td className="num">{number.format(e.words)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}

					<section className="report-section">
						<h3 className="bible-heading">{t.reportElements}</h3>
						<table className="report-table report-table-compact">
							<tbody>
								{ELEMENT_TYPES.map((type) => (
									<tr key={type}>
										<td>{t.elements[type]}</td>
										<td className="num">{number.format(report.elementCounts[type])}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				</div>
			)}

			{tab === 'characters' && (
				<table className="report-table">
					<thead>
						<tr>
							<SortHeader
								sort={characters}
								k="name">
								{t.reportName}
							</SortHeader>
							<SortHeader
								sort={characters}
								k="speeches"
								num>
								{t.reportSpeeches}
							</SortHeader>
							<SortHeader
								sort={characters}
								k="words"
								num>
								{t.reportWords}
							</SortHeader>
							<th>{t.reportShare}</th>
							<SortHeader
								sort={characters}
								k="scenes"
								num>
								{t.sceneNavigator}
							</SortHeader>
							<SortHeader
								sort={characters}
								k="pages">
								{whereLabel}
							</SortHeader>
						</tr>
					</thead>
					<tbody>
						{characters.rows.map((c) => (
							<tr key={c.name}>
								<td>
									<button
										type="button"
										className="report-link"
										onClick={() => onJump(c.firstElementId)}>
										{c.name}
									</button>
								</td>
								<td className="num">{number.format(c.speeches)}</td>
								<td className="num">{number.format(c.words)}</td>
								<td>
									<span className="report-share">
										<span className="report-share-bar">
											<span style={{ width: `${c.share * 100}%` }} />
										</span>
										{percent.format(c.share)}
									</span>
								</td>
								<td className="num">{number.format(c.scenes)}</td>
								<td className="report-pages">{where(c)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{tab === 'dialogue' && (
				<DialogueChart
					chart={report.dialogue}
					series={series}
					onJump={onJump}
				/>
			)}

			{tab === 'scenes' && (
				<table className="report-table">
					<thead>
						<tr>
							{series && <th className="num">{t.reportEpisode}</th>}
							<th className="num">#</th>
							<th>{t.reportHeading}</th>
							<th>{t.page}</th>
							<th className="col-optional">{t.bibleCharacters}</th>
							<th className="num">{t.reportSpeeches}</th>
							<th className="num">{t.reportWords}</th>
						</tr>
					</thead>
					<tbody>
						{report.scenes.map((s) => (
							<tr key={s.elementId}>
								{series && <td className="num">{s.episode}</td>}
								<td className="num">{s.number}</td>
								<td>
									<button
										type="button"
										className="report-link"
										onClick={() => onJump(s.elementId)}>
										{s.heading || t.emptyScenePlaceholder}
									</button>
								</td>
								<td className="report-pages">
									{s.firstPage === s.lastPage ? s.firstPage : `${s.firstPage}–${s.lastPage}`}
								</td>
								<td className="report-names col-optional">{s.speakers.join(', ')}</td>
								<td className="num">{number.format(s.speeches)}</td>
								<td className="num">{number.format(s.words)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{tab === 'locations' &&
				(report.locations.length === 0 ? (
					<p className="home-empty">{t.noLocations}</p>
				) : (
					<table className="report-table">
						<thead>
							<tr>
								<SortHeader
									sort={locations}
									k="name">
									{t.reportLocation}
								</SortHeader>
								<SortHeader
									sort={locations}
									k="scenes"
									num>
									{t.sceneNavigator}
								</SortHeader>
								<SortHeader
									sort={locations}
									k="pages">
									{whereLabel}
								</SortHeader>
								<th className="col-optional">{t.bibleCharacters}</th>
							</tr>
						</thead>
						<tbody>
							{locations.rows.map((l) => (
								<tr key={l.name}>
									<td>
										<button
											type="button"
											className="report-link"
											onClick={() => onJump(l.firstElementId)}>
											{l.name}
										</button>
									</td>
									<td className="num">{number.format(l.scenes)}</td>
									<td className="report-pages">{where(l)}</td>
									<td className="report-names col-optional">{l.characters.join(', ')}</td>
								</tr>
							))}
						</tbody>
					</table>
				))}
		</div>
	);
}

interface Sorted<T> {
	rows: T[];
	key: string;
	desc: boolean;
	sortBy(key: string): void;
}

/** Click a column to sort by it; click it again to reverse. Text sorts A→Z
 * first, numbers largest first — the end a writer looks at. */
function useSorted<T>(rows: T[], columns: Record<string, (row: T) => string | number>, initial: string): Sorted<T> {
	const [key, setKey] = useState(initial);
	const [desc, setDesc] = useState(true);
	const read = columns[key];
	const sorted = [...rows].sort((a, b) => {
		const x = read(a);
		const y = read(b);
		const order = typeof x === 'number' && typeof y === 'number' ? y - x : String(x).localeCompare(String(y));
		return desc ? order : -order;
	});
	return {
		rows: sorted,
		key,
		desc,
		sortBy(next) {
			if (next === key) setDesc(!desc);
			else {
				setKey(next);
				setDesc(true);
			}
		},
	};
}

function SortHeader<T>({ sort, k, num, children }: { sort: Sorted<T>; k: string; num?: boolean; children: ReactNode }) {
	const active = sort.key === k;
	return (
		<th
			className={num ? 'num' : undefined}
			aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}>
			<button
				type="button"
				className={`report-sort ${active ? 'is-active' : ''}`}
				onClick={() => sort.sortBy(k)}>
				{children}
				{active && <span className="report-sort-mark">{sort.desc ? '↓' : '↑'}</span>}
			</button>
		</th>
	);
}
