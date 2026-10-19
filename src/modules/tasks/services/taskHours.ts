import { startOfWeek, type WeekStart } from '../../../core/calendarDates';
import type { WeekLog } from './taskDetails';
import { parseDuration, type HourTarget } from './taskFormat';

/**
 * Tasks closed by time put in rather than by a tick: `🎯 100h` — a hundred
 * hours in all — or `🎯 20h/w`, twenty every week.
 *
 * The time is what the task already keeps: the timer's `⏱` total, which an
 * hour or two typed in by hand adds to as well. A task that asks for so many
 * a week also keeps each week's hours on a line of its own under it, so a new
 * week starts from nothing while the ones before stay in the note.
 *
 * Neither kind closes itself: a hundred hours reached is a task that can be
 * closed, and a week's twenty reached is a week that is done.
 */

/** What a task has to say about its hours. */
interface Hours {
    target?: HourTarget;
    spentMinutes?: number;
    weeks?: WeekLog[];
}

/** The minutes that count towards the target: this week's for a weekly one, all of them otherwise. */
export function minutesTowards(task: Hours, today: string, weekStart: WeekStart): number {
    if (!task.target) return 0;
    if (!task.target.weekly) return task.spentMinutes ?? 0;
    const week = startOfWeek(today, weekStart);
    return task.weeks?.find((w) => w.start === week)?.minutes ?? 0;
}

/** How far towards the target, 0 to 1. */
export function hoursShare(task: Hours, today: string, weekStart: WeekStart): number {
    if (!task.target) return 0;
    return Math.min(1, minutesTowards(task, today, weekStart) / task.target.minutes);
}

/** A target in all, reached: the task can be closed. A week's is never that. */
export function hoursReached(task: Hours): boolean {
    return !!task.target && !task.target.weekly && (task.spentMinutes ?? 0) >= task.target.minutes;
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
