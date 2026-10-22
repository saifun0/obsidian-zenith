import { startOfWeek, type WeekStart } from '../../../core/calendarDates';
import type { WeekCount, WeekLog } from './taskDetails';
import { parseDuration, shiftIsoDate, type TaskQuota } from './taskFormat';

/**
 * Tasks closed by what was put in rather than by a tick: hours — `🎯 100h` in
 * all, `🎯 20h/w` every week — or times — `🎯 12` books, `🎯 3/w` workouts.
 *
 * The time is what the task already keeps: the timer's `⏱` total, which an
 * hour or two typed in by hand adds to as well. The times are its `🔢`. A
 * task that asks for so many a week also keeps each week's on a line of its
 * own under it, so a new week starts from nothing while the ones before stay
 * in the note.
 *
 * Neither kind closes itself: a hundred hours reached is a task that can be
 * closed, and a week's twenty reached is a week that is done.
 */

/** What a task has to say about what it asks for. */
interface Quota {
    target?: TaskQuota;
    spentMinutes?: number;
    weeks?: WeekLog[];
    tally?: number;
    counts?: WeekCount[];
}

/** The minutes that count towards hours: this week's for a weekly target, all of them otherwise. */
export function minutesTowards(task: Quota, today: string, weekStart: WeekStart): number {
    if (!task.target || task.target.count) return 0;
    if (!task.target.weekly) return task.spentMinutes ?? 0;
    const week = startOfWeek(today, weekStart);
    return task.weeks?.find((w) => w.start === week)?.minutes ?? 0;
}

/** What counts towards the target, minutes or times: this week's for a weekly one. */
export function amountTowards(task: Quota, today: string, weekStart: WeekStart): number {
    const target = task.target;
    if (!target) return 0;
    if (!target.count) return minutesTowards(task, today, weekStart);
    if (!target.weekly) return task.tally ?? 0;
    const week = startOfWeek(today, weekStart);
    return task.counts?.find((w) => w.start === week)?.count ?? 0;
}

/** How far towards the target, 0 to 1. */
export function quotaShare(task: Quota, today: string, weekStart: WeekStart): number {
    if (!task.target) return 0;
    return Math.min(1, amountTowards(task, today, weekStart) / task.target.amount);
}

/**
 * Whether a target is drawn: times always, hours while the timer is on —
 * hours are the timer's, and a tally of them with no way to time them is a
 * figure that never moves.
 */
export function quotaShown(target: TaskQuota | undefined, timerOn: boolean): boolean {
    return !!target && (!!target.count || timerOn);
}

/** A target in all, reached: the task can be closed. A week's is never that. */
export function quotaReached(task: Quota): boolean {
    const target = task.target;
    if (!target || target.weekly) return false;
    return (target.count ? (task.tally ?? 0) : (task.spentMinutes ?? 0)) >= target.amount;
}

/** Each week's minutes or times, oldest first: the weeks of a weekly target. */
export function weekAmounts(task: Quota): Array<{ start: string; amount: number }> {
    if (task.target?.count)
        return (task.counts ?? []).map((w) => ({ start: w.start, amount: w.count }));
    return (task.weeks ?? []).map((w) => ({ start: w.start, amount: w.minutes }));
}

/** A week of what was put in, as a chart draws it. */
export interface WeekAmount {
    start: string;
    amount: number;
}

/**
 * The last `n` weeks up to the one starting `thisWeek`, oldest first, each
 * with what was put in — nothing, for a week with no line.
 */
export function weekSeries(
    weeks: readonly WeekAmount[],
    thisWeek: string,
    n: number
): WeekAmount[] {
    const by = new Map(weeks.map((w) => [w.start, w.amount]));
    const out: WeekAmount[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const start = shiftIsoDate(thisWeek, -7 * i);
        out.push({ start, amount: by.get(start) ?? 0 });
    }
    return out;
}

/** An amount as a tally says it: hours as `7.5`, times as they are. */
export function formatAmount(target: TaskQuota, amount: number, locale = 'en'): string {
    return target.count ? amount.toLocaleString(locale) : formatHours(amount, locale);
}

/**
 * What an editor's field says a task asks for: hours as `20` or `1h30`, or a
 * count as a whole number of times. Nothing, for a field left empty or not
 * understood.
 */
export function readQuotaInput(
    text: string,
    count: boolean,
    weekly: boolean
): TaskQuota | undefined {
    if (count) {
        const times = /^\s*\d{1,4}\s*$/.test(text) ? Number(text) : 0;
        return times > 0 ? { amount: times, weekly, count: true } : undefined;
    }
    const minutes = parseHoursInput(text);
    return minutes ? { amount: minutes, weekly } : undefined;
}

/** The field's text for a target already set: the inverse of `readQuotaInput`. */
export function quotaInputText(target: TaskQuota | undefined, locale = 'en'): string {
    if (!target) return '';
    return target.count ? String(target.amount) : formatHours(target.amount, locale);
}

/** What a count's field asks for: `3` more, `+2`, or with a minus, `-1` fewer. */
export function parseCountChange(text: string): number | undefined {
    const m = text.trim().match(/^([-−–+])?\s*(\d{1,4})$/);
    const times = m ? Number(m[2]) : 0;
    if (!times) return undefined;
    return m && m[1] && m[1] !== '+' ? -times : times;
}

/**
 * Time as it is typed into the "+" field: `1,5` or `1.5` is an hour and a
 * half — a bare number is hours — and `1h30`, `90m`, `1ч30м` say it outright.
 */
export function parseHoursInput(text: string): number | undefined {
    const clean = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/,/g, '.')
        .replace(/ч/g, 'h')
        .replace(/м(ин)?/g, 'm');
    if (!clean) return undefined;
    if (/^\d+(\.\d+)?$/.test(clean)) {
        const minutes = Math.round(parseFloat(clean) * 60);
        return minutes > 0 ? minutes : undefined;
    }
    return parseDuration(clean);
}

/**
 * What the "+" field asks for: time to add, or with a minus — a hyphen, or the
 * typographic one a phone may put in — time to take off. Minutes, signed.
 */
export function parseHoursChange(text: string): number | undefined {
    const trimmed = text.trim();
    const minus = /^[-−–]/.test(trimmed);
    const minutes = parseHoursInput(trimmed.replace(/^[-−–+]\s*/, ''));
    return minutes ? (minus ? -minutes : minutes) : undefined;
}

/** Minutes as hours, the way a tally says them: 450 → `7.5` (`7,5` in Russian), 1200 → `20`. */
export function formatHours(minutes: number, locale = 'en'): string {
    const hours = Math.round((minutes / 60) * 10) / 10;
    return hours.toLocaleString(locale, { maximumFractionDigits: 1 });
}
