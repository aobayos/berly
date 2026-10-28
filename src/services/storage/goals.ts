// Writing goals and the log of what was written each day. Kept on this
// computer only — in localStorage, through SecureStorage like everything else
// that names the writer's projects — never in a project file: a goal is the
// writer's, not the screenplay's, and the general one spans every project.
import { useSyncExternalStore } from 'react';
import { SecureStorage } from '@/services/secure-storage';
import {
	PERIODS,
	dayKey,
	periodDays,
	periodStart,
	type GoalSet,
	type GoalUnit,
	type Period,
	type ProjectGoal,
} from '@/services/writingGoals';

const KEY = 'berly.goals';
/** Enough for a year of streaks and twelve months of history. */
const KEEP_DAYS = 400;

export interface DayLog {
	/** Writing effort in words (see writingGoals.ts), per project id. */
	words: Record<string, number>;
	/** Per script: its length in pages when first measured that day, and the
	 * latest — the day's pages are the difference. */
	pages: Record<string, { project: string; start: number; end: number }>;
	/** Goals reached that day, as metKey()s. Stamped when it happens, so
	 * changing a goal later doesn't rewrite the history or the streak. */
	met: string[];
}

export interface GoalsState {
	general?: GoalSet;
	projects: Record<string, ProjectGoal>;
	days: Record<string, DayLog>;
}

/** The general scope, beside project ids. */
export const GENERAL = 'general';

/** What a day's `met` list holds for one scope's goal over one period. */
export function metKey(scope: string, period: Period): string {
	return `${scope}@${period}`;
}

let state: GoalsState = load();
const listeners = new Set<() => void>();

function load(): GoalsState {
	const stored = SecureStorage.get<GoalsState>(KEY);
	return { projects: {}, days: {}, ...stored };
}

function commit(next: GoalsState) {
	state = next;
	SecureStorage.set(KEY, state);
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useGoals(): GoalsState {
	return useSyncExternalStore(subscribe, () => state);
}

/** A scope's goals: the general ones, or a project's. */
export function goalsFor(goals: GoalsState, scope: string): GoalSet | undefined {
	return scope === GENERAL ? goals.general : goals.projects[scope]?.periods;
}

export function setGoals(scope: string, next: GoalSet | undefined) {
	if (scope === GENERAL) {
		commit({ ...state, general: next });
		return;
	}
	setProjectGoal(scope, { ...state.projects[scope], periods: next });
}

export function setProjectGoal(projectId: string, goal: ProjectGoal) {
	const projects = { ...state.projects, [projectId]: goal };
	if (!goal.periods && !goal.length) delete projects[projectId];
	commit({ ...state, projects });
}

/** A day's progress in `unit`, for one project or (for the general scope)
 * all of them. Pages can come out negative on a day of cuts; callers show 0. */
export function dayProgress(log: DayLog | undefined, unit: GoalUnit, scope: string): number {
	if (!log) return 0;
	const mine = (project: string) => scope === GENERAL || project === scope;
	if (unit === 'words') {
		return Object.entries(log.words)
			.filter(([project]) => mine(project))
			.reduce((sum, [, words]) => sum + words, 0);
	}
	return Object.values(log.pages)
		.filter((entry) => mine(entry.project))
		.reduce((sum, entry) => sum + entry.end - entry.start, 0);
}

/** Progress over the whole period holding `day`, up to `day`. */
export function periodProgress(
	days: Record<string, DayLog>,
	unit: GoalUnit,
	scope: string,
	period: Period,
	day: string = dayKey(),
): number {
	return periodDays(periodStart(day, period), period, day).reduce(
		(sum, d) => sum + dayProgress(days[d], unit, scope),
		0,
	);
}

/** Whether a scope's goal for a period was reached during the period holding
 * `day` — on any of its days, since the stamp lands on the day it happened. */
export function periodMet(
	days: Record<string, DayLog>,
	scope: string,
	period: Period,
	day: string = dayKey(),
): boolean {
	const key = metKey(scope, period);
	return periodDays(periodStart(day, period), period, day).some((d) => days[d]?.met.includes(key) ?? false);
}

/** Records writing in one script and returns the goals this has just met,
 * as { scope, period }, so the editor can say so — once. */
export function recordWriting(
	projectId: string,
	scriptId: string,
	effort: number,
	pages: number | null,
): { scope: string; period: Period }[] {
	const today = dayKey();
	const previous = state.days[today] ?? { words: {}, pages: {}, met: [] };
	const log: DayLog = {
		words: { ...previous.words },
		pages: { ...previous.pages },
		met: [...previous.met],
	};
	if (effort > 0) log.words[projectId] = (log.words[projectId] ?? 0) + effort;
	if (pages !== null) {
		const entry = log.pages[scriptId];
		log.pages[scriptId] = { project: projectId, start: entry?.start ?? pages, end: pages };
	}
	const days = { ...state.days, [today]: log };

	const reached: { scope: string; period: Period }[] = [];
	for (const scope of [GENERAL, projectId]) {
		const goals = goalsFor(state, scope);
		if (!goals) continue;
		for (const period of PERIODS) {
			const target = goals[period];
			if (!target || target <= 0 || periodMet(days, scope, period, today)) continue;
			if (periodProgress(days, goals.unit, scope, period, today) >= target) {
				log.met.push(metKey(scope, period));
				reached.push({ scope, period });
			}
		}
	}

	// A script's first measurement of the day is kept even with nothing
	// written — it is where the day's pages start from.
	const known = previous.pages[scriptId];
	const unchanged =
		effort <= 0 && reached.length === 0 && (pages === null || (known !== undefined && known.end === pages));
	if (unchanged) return [];

	const oldest = dayKey(new Date(Date.now() - KEEP_DAYS * 86_400_000));
	for (const day of Object.keys(days)) if (day < oldest) delete days[day];
	commit({ ...state, days });
	return reached;
}
