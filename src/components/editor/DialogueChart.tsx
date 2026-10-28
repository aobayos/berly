// Trelby's dialogue chart: one row per character, one column per page — a
// series' episodes end to end — and each bar as tall as the words that
// character speaks on that page. Shows at a glance who carries which stretch
// of the script and who vanishes for twenty pages. Every bar leads there.
import { useMemo, useState } from 'react';
import type { DialogueChart as Chart } from '@/services/scriptReport';
import { useI18n } from '@/i18n';

interface Props {
	chart: Chart;
	series: boolean;
	onJump(elementId: string): void;
}

export default function DialogueChart({ chart, series, onJump }: Props) {
	const { t, lang } = useI18n();
	const [hovered, setHovered] = useState<{ row: number; cell: number } | null>(null);
	const number = useMemo(() => new Intl.NumberFormat(lang), [lang]);
	const { columns, rows } = chart;
	const count = columns.length;
	const top = Math.max(1, ...rows.flatMap((row) => row.cells.map((cell) => cell.words)));
	const x = (column: number) => `${((column + 0.5) / count) * 100}%`;

	// Where each episode starts, for the dividers and the axis.
	const episodes = useMemo(() => {
		const starts: { episode: number; from: number; to: number }[] = [];
		columns.forEach((c, i) => {
			const last = starts[starts.length - 1];
			if (last?.episode === c.episode) last.to = i;
			else starts.push({ episode: c.episode, from: i, to: i });
		});
		return starts;
	}, [columns]);

	const ticks = useMemo(() => {
		if (series) return [];
		const step = count > 60 ? 20 : count > 20 ? 10 : count > 8 ? 5 : 1;
		const pages = [1];
		for (let page = step; page < count; page += step) if (page > 1) pages.push(page);
		if (count > 1 && pages[pages.length - 1] !== count) pages.push(count);
		return pages;
	}, [series, count]);

	const place = (column: number) => {
		const c = columns[column];
		return series ? `${t.reportEpisode} ${c.episode}, ${t.page.toLowerCase()} ${c.page}` : `${t.page} ${c.page}`;
	};

	if (rows.length === 0) return <p className="home-empty">{t.dialogueEmpty}</p>;

	const shown = hovered && rows[hovered.row].cells[hovered.cell];

	return (
		<figure className="dialogue-chart">
			<figcaption className="goals-history-readout dialogue-readout">
				{shown && hovered ? (
					<>
						<strong>{rows[hovered.row].name}</strong>
						<span>{place(shown.column)}</span>
						<strong>
							{number.format(shown.words)} {t.unitWords}
						</strong>
					</>
				) : (
					<span>{t.dialogueHint}</span>
				)}
			</figcaption>

			<div
				className="dialogue-row dialogue-head"
				aria-hidden="true">
				<span />
				<span />
				<span className="dialogue-total">{t.reportWords}</span>
			</div>

			<div
				className="dialogue-rows"
				role="img"
				aria-label={t.dialogueChartLabel}
				onMouseLeave={() => setHovered(null)}>
				{rows.map((row, r) => (
					<div
						key={row.name}
						className="dialogue-row">
						<button
							type="button"
							className="report-link dialogue-name"
							title={row.name}
							onClick={() => onJump(row.firstElementId)}>
							{row.name}
						</button>
						<div
							className="dialogue-strip"
							style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
							{episodes.slice(1).map((e) => (
								<span
									key={e.episode}
									className="dialogue-divider"
									style={{ left: `${(e.from / count) * 100}%` }}
								/>
							))}
							{row.cells.map((cell, c) => (
								<button
									key={cell.column}
									type="button"
									tabIndex={-1}
									className={`dialogue-cell ${hovered?.row === r && hovered.cell === c ? 'is-hovered' : ''}`}
									style={{ gridColumn: cell.column + 1 }}
									aria-label={`${row.name}, ${place(cell.column)}`}
									onMouseEnter={() => setHovered({ row: r, cell: c })}
									onClick={() => onJump(cell.elementId)}>
									<span style={{ height: `${(cell.words / top) * 100}%` }} />
								</button>
							))}
						</div>
						<span className="dialogue-total">{number.format(row.words)}</span>
					</div>
				))}
			</div>

			<div
				className="dialogue-row dialogue-axis-row"
				aria-hidden="true">
				<span />
				<div className="dialogue-axis">
					{series
						? episodes.map((e) => (
								<span
									key={e.episode}
									style={{ left: x((e.from + e.to) / 2) }}>
									{t.reportEpisode} {e.episode}
								</span>
							))
						: ticks.map((page) => (
								<span
									key={page}
									style={{ left: x(page - 1) }}>
									{page}
								</span>
							))}
				</div>
				<span />
			</div>
		</figure>
	);
}
