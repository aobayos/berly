// Writing tracking and goals: everything on Home, one project on its project
// page. What was written today, this week and this month, against the goals
// for each, if any. The numbers come from the log the editor records into
// (see src/services/storage/goals.ts); nothing here measures anything itself.
import { useMemo, useState } from 'react';
import { Fire } from '@phosphor-icons/react';
import type { Project } from '@/model/types';
import {
	GENERAL,
	dayProgress,
	goalsFor,
	metKey,
	periodMet,
	periodProgress,
	setGoals,
	setProjectGoal,
	useGoals,
} from '@/services/storage/goals';
import {
	PERIODS,
	countWords,
	dayKey,
	periodDays,
	periodsAgo,
	streak,
	suggestedDaily,
	type GoalSet,
	type GoalUnit,
	type Period,
} from '@/services/writingGoals';
import { formatEighths } from '@/services/pagination';
import { useI18n, type Dict } from '@/i18n';

interface Props {
	/** A project's tracking and goals; everything, across projects, when absent. */
	project?: Project;
	/** The project's length in pages, measured — for a length goal in pages. */
	pageCount?: number;
}

/** How many bars the history shows for each period. */
const HISTORY: Record<Period, number> = { day: 30, week: 12, month: 12 };

function useAmount() {
	const { t, lang } = useI18n();
	const numbers = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US');
	return (value: number, unit: GoalUnit) =>
		unit === 'words'
			? `${numbers.format(Math.floor(Math.max(0, value)))} ${t.unitWords}`
			: `${formatEighths(Math.max(0, Math.round(value * 8)))} ${t.unitPages}`;
}

function periodLabels(t: Dict): Record<Period, { now: string; goal: string }> {
	return {
		day: { now: t.today, goal: t.goalPerDay },
		week: { now: t.thisWeek, goal: t.goalPerWeek },
		month: { now: t.thisMonth, goal: t.goalPerMonth },
	};
}

export default function GoalsView({ project, pageCount }: Props) {
	const { t } = useI18n();
	const state = useGoals();
	const amount = useAmount();
	const today = dayKey();
	const scope = project?.id ?? GENERAL;
	const goals: GoalSet = goalsFor(state, scope) ?? { unit: 'words' };
	const other: GoalUnit = goals.unit === 'words' ? 'pages' : 'words';
	const labels = periodLabels(t);
	const days = goals.day ? streak((day) => state.days[day]?.met.includes(metKey(scope, 'day')) ?? false, today) : 0;

	function save(next: GoalSet) {
		// Nothing set and the default unit: nothing worth storing.
		const empty = !PERIODS.some((p) => next[p]) && next.unit === 'words';
		setGoals(scope, empty ? undefined : next);
	}

	return (
		<div className="goals">
			<section className="goals-card goals-card-wide">
				<header className="goals-card-head">
					<h2>{project ? t.goalProjectTitle : t.goalGeneralTitle}</h2>
					{days > 0 && (
						<span
							className="goals-streak"
							title={t.goalStreakHint}>
							<Fire
								size={15}
								weight="fill"
							/>{' '}
							{days} {days === 1 ? t.day : t.days}
						</span>
					)}
				</header>

				<div className="goals-tiles">
					{PERIODS.map((period) => {
						const value = periodProgress(state.days, goals.unit, scope, period, today);
						const target = goals[period];
						const met = periodMet(state.days, scope, period, today);
						return (
							<div
								key={period}
								className="goals-tile">
								<span className="goals-tile-label">{labels[period].now}</span>
								<p className="goals-today">
									<strong>{amount(value, goals.unit)}</strong>
									{target ? ` / ${amount(target, goals.unit)}` : ''}
								</p>
								{target ? (
									<Meter
										value={value}
										max={target}
									/>
								) : null}
								<span className="goals-tile-other">
									{met ? (
										<span className="goals-met-tag">{t.goalMet}</span>
									) : (
										amount(periodProgress(state.days, other, scope, period, today), other)
									)}
								</span>
							</div>
						);
					})}
				</div>

				<div className="goals-edit">
					<span>{t.goalsLabel}</span>
					{PERIODS.map((period) => (
						<label
							key={period}
							className="goals-field">
							<NumberField
								value={goals[period]}
								onCommit={(value) => save({ ...goals, [period]: value })}
								label={labels[period].goal}
							/>
							{labels[period].goal}
						</label>
					))}
					<UnitSelect
						value={goals.unit}
						onChange={(unit) => save({ ...goals, unit })}
					/>
				</div>
				<p className="goals-hint">
					{goals.unit === 'words' ? t.goalWordsRule : t.goalPagesRule}{' '}
					{project ? t.goalProjectScope : t.goalGeneralScope}
				</p>

				<History
					goals={goals}
					scope={scope}
					today={today}
				/>
			</section>

			{project && (
				<LengthGoal
					project={project}
					pageCount={pageCount}
					onUseDaily={(day, unit) =>
						// Another unit would rescale the other periods: they go.
						save(unit === goals.unit ? { ...goals, day } : { unit, day })
					}
				/>
			)}
		</div>
	);
}

/** How long the finished project should be, and by when. */
function LengthGoal({
	project,
	pageCount,
	onUseDaily,
}: {
	project: Project;
	pageCount?: number;
	onUseDaily: (daily: number, unit: GoalUnit) => void;
}) {
	const { t, lang } = useI18n();
	const goals = useGoals();
	const amount = useAmount();
	const projectGoal = goals.projects[project.id] ?? {};
	const length = projectGoal.length;

	const words = useMemo(
		() => project.scripts.reduce((sum, s) => sum + s.elements.reduce((n, el) => n + countWords(el.text), 0), 0),
		[project.scripts],
	);

	const save = (next: typeof length) => setProjectGoal(project.id, { ...projectGoal, length: next });

	if (!length) {
		return (
			<section className="goals-card">
				<header className="goals-card-head">
					<h2>{t.goalLengthTitle}</h2>
				</header>
				<div className="goals-empty">
					<p>{t.goalLengthEmpty}</p>
					<button
						type="button"
						className="btn btn-ghost"
						onClick={() => save({ unit: 'pages', total: project.kind === 'show' ? 60 : 110 })}>
						{t.goalSet}
					</button>
				</div>
			</section>
		);
	}

	const current = length.unit === 'words' ? words : pageCount;
	const deadline = isDay(length.deadline) ? length.deadline : undefined;
	const suggestion = current === undefined ? null : suggestedDaily(current, length.total, deadline);
	const dateFmt = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'long' });
	const deadlineLabel = deadline ? dateFmt.format(new Date(`${deadline}T12:00:00`)) : '';

	return (
		<section className="goals-card">
			<header className="goals-card-head">
				<h2>{t.goalLengthTitle}</h2>
			</header>
			<p className="goals-today">
				<strong>{current === undefined ? '…' : amount(current, length.unit)}</strong> /{' '}
				{amount(length.total, length.unit)}
			</p>
			<Meter
				value={current ?? 0}
				max={length.total}
			/>
			<div className="goals-edit">
				<NumberField
					value={length.total}
					onCommit={(total) => total && save({ ...length, total })}
					label={t.goalLengthLabel}
				/>
				<UnitSelect
					value={length.unit}
					onChange={(unit) => save({ ...length, unit })}
				/>
				<label className="goals-field">
					{t.goalDeadline}
					<input
						type="date"
						className="input"
						value={length.deadline ?? ''}
						// A date being typed passes through values like year 302026;
						// only a whole one is kept.
						onChange={(e) => {
							const value = e.target.value;
							if (!value) save({ ...length, deadline: undefined });
							else if (isDay(value)) save({ ...length, deadline: value });
						}}
					/>
				</label>
				<button
					type="button"
					className="btn btn-small"
					onClick={() => save(undefined)}>
					{t.goalRemove}
				</button>
			</div>
			{suggestion !== null && (
				<p className="goals-suggestion">
					{t.goalToFinishBy} {deadlineLabel}
					{t.colon} <strong>{amount(suggestion, length.unit)}</strong> {t.goalPerDay}
					{suggestion > 0 && (
						<button
							type="button"
							className="btn btn-small"
							onClick={() => onUseDaily(suggestion, length.unit)}>
							{t.goalUseAsDaily}
						</button>
					)}
				</p>
			)}
		</section>
	);
}

/** A real calendar day as YYYY-MM-DD, four-digit year. */
function isDay(value: string | undefined): value is string {
	return (
		value !== undefined &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		!Number.isNaN(new Date(`${value}T12:00:00`).getTime())
	);
}

function Meter({ value, max }: { value: number; max: number }) {
	const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
	return (
		<div className={`goals-meter ${share >= 1 ? 'is-met' : ''}`}>
			<span style={{ width: `${share * 100}%` }} />
		</div>
	);
}

/** The last 30 days, 12 weeks or 12 months, one bar each, against that
 * period's goal line when there is one. */
function History({ goals, scope, today }: { goals: GoalSet; scope: string; today: string }) {
	const { t, lang } = useI18n();
	const state = useGoals();
	const amount = useAmount();
	const [period, setPeriod] = useState<Period>('day');
	const [hovered, setHovered] = useState<number | null>(null);
	const target = goals[period];

	const bars = useMemo(() => {
		const count = HISTORY[period];
		return Array.from({ length: count }, (_, i) => {
			const start = periodsAgo(today, period, count - 1 - i);
			const days = periodDays(start, period, today);
			const last = days[days.length - 1] ?? start;
			return {
				start,
				value: Math.max(
					0,
					days.reduce((sum, d) => sum + dayProgress(state.days[d], goals.unit, scope), 0),
				),
				met: periodMet(state.days, scope, period, last),
			};
		});
	}, [state.days, goals.unit, scope, period, today]);

	const top = Math.max(target ?? 0, ...bars.map((b) => b.value)) * 1.1 || 1;
	const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
	const label = (start: string) => {
		const date = new Date(`${start}T12:00:00`);
		if (period === 'month') {
			return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
		}
		const day = new Intl.DateTimeFormat(locale, {
			weekday: period === 'day' ? 'short' : undefined,
			day: 'numeric',
			month: 'short',
		}).format(date);
		return period === 'week' ? `${t.weekOf} ${day}` : day;
	};
	const shown = bars[hovered ?? bars.length - 1];
	const switches: [Period, string][] = [
		['day', t.historyDays],
		['week', t.historyWeeks],
		['month', t.historyMonths],
	];

	return (
		<figure className="goals-history">
			<div className="goals-history-head">
				<figcaption className="goals-history-readout">
					<span>{label(shown.start)}</span>
					<strong>{amount(shown.value, goals.unit)}</strong>
					{shown.met && <span className="goals-met-tag">{t.goalMet}</span>}
				</figcaption>
				<div
					className="view-switch goals-period-switch"
					role="tablist">
					{switches.map(([id, text]) => (
						<button
							key={id}
							type="button"
							role="tab"
							aria-selected={period === id}
							className={`view-btn ${period === id ? 'is-active' : ''}`}
							onClick={() => {
								setPeriod(id);
								setHovered(null);
							}}>
							{text}
						</button>
					))}
				</div>
			</div>
			<div
				className="goals-bars"
				role="img"
				aria-label={t.goalHistoryLabel}
				onMouseLeave={() => setHovered(null)}>
				{target ? (
					<span
						className="goals-line"
						style={{ bottom: `${(target / top) * 100}%` }}
					/>
				) : null}
				{bars.map((bar, i) => (
					<span
						key={bar.start}
						className={`goals-bar ${bar.met ? 'is-met' : ''} ${hovered === i ? 'is-hovered' : ''}`}
						onMouseEnter={() => setHovered(i)}>
						<span style={{ height: `${(bar.value / top) * 100}%` }} />
					</span>
				))}
			</div>
			<div className="goals-axis">
				<span>{label(bars[0].start)}</span>
				<span>{periodLabels(t)[period].now}</span>
			</div>
		</figure>
	);
}

/** A number typed freely and committed on Enter or leaving the field, so a
 * half-typed value never becomes the goal. Emptied, it clears the goal. */
function NumberField({
	value,
	onCommit,
	label,
}: {
	value: number | undefined;
	onCommit: (value: number | undefined) => void;
	label: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const commit = () => {
		if (draft === null) return;
		const parsed = Number(draft);
		if (!draft.trim()) onCommit(undefined);
		else if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
		setDraft(null);
	};
	return (
		<input
			type="number"
			min={1}
			className="input goals-number"
			aria-label={label}
			placeholder="—"
			value={draft ?? (value ? String(value) : '')}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === 'Enter') commit();
				if (e.key === 'Escape') setDraft(null);
			}}
		/>
	);
}

function UnitSelect({ value, onChange }: { value: GoalUnit; onChange: (unit: GoalUnit) => void }) {
	const { t } = useI18n();
	return (
		<select
			className="input goals-unit"
			value={value}
			onChange={(e) => onChange(e.target.value as GoalUnit)}>
			<option value="words">{t.unitWords}</option>
			<option value="pages">{t.unitPages}</option>
		</select>
	);
}
