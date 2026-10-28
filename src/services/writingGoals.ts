// Writing goals: how much a day's writing counts, and whether it met a goal.
// Pure arithmetic over snapshots of the script — the store that keeps the
// days lives in src/services/storage/goals.ts, the measuring in Editor.
//
// Words are counted as effort rather than net length: a word added counts 1,
// a word removed counts ½. Cutting is work too, but less of it than writing,
// and a revision day must not look like a day that went backwards.
import type { ScriptElement } from '@/model/types';

export type GoalUnit = 'words' | 'pages';

export type Period = 'day' | 'week' | 'month';
export const PERIODS: Period[] = ['day', 'week', 'month'];

/** One scope's goals — the general one, or a project's. Every period is
 * optional; the unit is shared, and also what its tracking is shown in when
 * no goal is set at all. */
export interface GoalSet {
	unit: GoalUnit;
	day?: number;
	week?: number;
	month?: number;
}

/** A project's own goals. Either part may be set without the other. */
export interface ProjectGoal {
	periods?: GoalSet;
	/** How long the finished project should be, in `length.unit`. */
	length?: { unit: GoalUnit; total: number; deadline?: string };
}

export function hasTargets(goals: GoalSet | undefined): boolean {
	return Boolean(goals && PERIODS.some((period) => goals[period]));
}

export const ADDED_WEIGHT = 1;
export const REMOVED_WEIGHT = 0.5;

function words(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

export function countWords(text: string): number {
	return words(text).length;
}

/** Words in `after` that `before` didn't have, and the reverse — as
 * multisets, so moving a word costs nothing and a word typed twice counts
 * twice. */
export function wordChanges(before: string, after: string): { added: number; removed: number } {
	const counts = new Map<string, number>();
	for (const word of words(before)) counts.set(word, (counts.get(word) ?? 0) + 1);
	let added = 0;
	for (const word of words(after)) {
		const left = counts.get(word) ?? 0;
		if (left > 0) counts.set(word, left - 1);
		else added++;
	}
	let removed = 0;
	for (const left of counts.values()) removed += left;
	return { added, removed };
}

/** The effort between two snapshots of one script, element by element (by
 * id, so a scene moved elsewhere counts nothing). */
export function writingEffort(before: Map<string, string>, after: ScriptElement[]): number {
	let added = 0;
	let removed = 0;
	const seen = new Set<string>();
	for (const el of after) {
		seen.add(el.id);
		const change = wordChanges(before.get(el.id) ?? '', el.text);
		added += change.added;
		removed += change.removed;
	}
	for (const [id, text] of before) if (!seen.has(id)) removed += countWords(text);
	return added * ADDED_WEIGHT + removed * REMOVED_WEIGHT;
}

export function snapshot(elements: ScriptElement[]): Map<string, string> {
	return new Map(elements.map((el) => [el.id, el.text]));
}

/** The local calendar day, as the key the log is stored under. */
export function dayKey(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function daysAgo(key: string, n: number): string {
	const date = parseDay(key);
	date.setDate(date.getDate() - n);
	return dayKey(date);
}

/** The first day of the period holding `day`. Weeks start on Monday, the
 * ISO and French convention; months on the 1st. */
export function periodStart(day: string, period: Period): string {
	const date = parseDay(day);
	if (period === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	if (period === 'month') date.setDate(1);
	return dayKey(date);
}

/** The period `n` periods before the one holding `day`, by its first day. */
export function periodsAgo(day: string, period: Period, n: number): string {
	if (period === 'day') return daysAgo(day, n);
	if (period === 'week') return daysAgo(periodStart(day, 'week'), 7 * n);
	const date = parseDay(periodStart(day, 'month'));
	date.setMonth(date.getMonth() - n);
	return dayKey(date);
}

/** Every day of the period starting on `start`, up to `until` at most. */
export function periodDays(start: string, period: Period, until: string): string[] {
	const end = period === 'day' ? start : daysAgo(periodsAgo(start, period, -1), 1);
	const days: string[] = [];
	for (let day = start; day <= end && day <= until; day = daysAgo(day, -1)) days.push(day);
	return days;
}

/** Days in a row that met a goal, ending today — or yesterday, while today
 * is still in progress, so an unfinished morning doesn't read as a broken
 * streak. */
export function streak(met: (day: string) => boolean, today: string = dayKey()): number {
	let day = met(today) ? today : daysAgo(today, 1);
	let count = 0;
	while (met(day)) {
		count++;
		day = daysAgo(day, 1);
	}
	return count;
}

/** What a day needs to bring to reach `total` by `deadline`, today included.
 * Null without a deadline, or once it has passed. */
export function suggestedDaily(
	current: number,
	total: number,
	deadline: string | undefined,
	today: string = dayKey(),
): number | null {
	if (!deadline || deadline < today) return null;
	const [y, m, d] = deadline.split('-').map(Number);
	const [ty, tm, td] = today.split('-').map(Number);
	const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000) + 1;
	return Math.max(0, Math.ceil((total - current) / days));
}
