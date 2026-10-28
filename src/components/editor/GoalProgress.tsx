// Writing progress at the foot of the editor's sidebar: every goal that is
// set — this project's and the general ones, per day, week or month — or,
// with none, simply what has been written today, this week and this month.
import { GENERAL, goalsFor, periodProgress, useGoals } from '@/services/storage/goals';
import { PERIODS, dayKey, type GoalUnit } from '@/services/writingGoals';
import { formatEighths } from '@/services/pagination';
import { useI18n } from '@/i18n';

export default function GoalProgress({ projectId }: { projectId: string }) {
	const { t, lang } = useI18n();
	const state = useGoals();
	const today = dayKey();
	const numbers = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US');
	const amount = (value: number, unit: GoalUnit) =>
		unit === 'words'
			? numbers.format(Math.floor(Math.max(0, value)))
			: formatEighths(Math.max(0, Math.round(value * 8)));
	const unitName = (unit: GoalUnit) => (unit === 'words' ? t.unitWords : t.unitPages);
	const periodName = { day: t.today, week: t.thisWeek, month: t.thisMonth };

	const scopes = [
		{ scope: projectId, label: t.goalThisProject },
		{ scope: GENERAL, label: t.goalAllProjects },
	].filter(({ scope }) => goalsFor(state, scope));
	// Whose goal it is only needs saying when both have one.
	const rows = scopes.flatMap(({ scope, label }) => {
		const goals = goalsFor(state, scope);
		if (!goals) return [];
		return PERIODS.flatMap((period) => {
			const target = goals[period];
			if (!target) return [];
			const value = periodProgress(state.days, goals.unit, scope, period, today);
			return [
				{
					key: `${scope}-${period}`,
					label: scopes.length > 1 ? `${label} · ${periodName[period]}` : periodName[period],
					value,
					target,
					unit: goals.unit,
				},
			];
		});
	});

	if (rows.length === 0) {
		// No goal anywhere: still say how much has been written.
		return (
			<div
				className="goal-progress"
				aria-label={t.goalsTab}>
				{PERIODS.map((period) => (
					<div
						key={period}
						className="goal-progress-text">
						<span>{periodName[period]}</span>
						<span>
							{amount(periodProgress(state.days, 'words', GENERAL, period, today), 'words')} {t.unitWords}
						</span>
					</div>
				))}
			</div>
		);
	}

	return (
		<div
			className="goal-progress"
			aria-label={t.goalsTab}>
			{rows.map(({ key, label, value, target, unit }) => {
				const share = Math.min(1, Math.max(0, value / target));
				return (
					<div
						key={key}
						className="goal-progress-row">
						<div className="goal-progress-text">
							<span>{label}</span>
							<span>
								{amount(value, unit)} / {amount(target, unit)} {unitName(unit)}
							</span>
						</div>
						<div className={`goals-meter ${share >= 1 ? 'is-met' : ''}`}>
							<span style={{ width: `${share * 100}%` }} />
						</div>
					</div>
				);
			})}
		</div>
	);
}
