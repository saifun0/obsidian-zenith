import { addDays, isoToDate } from '../../../core/calendarDates';
import { daysBetweenIso, toLocalIsoDate } from '../../../core/dateUtils';
import type { Task } from '../../../store/taskSlice';
import type { Project } from '../../projects/projectsTypes';
import { hijriDate, RAMADAN_MONTH } from '../../prayer/hijri';

/**
 * Days until the things that are coming.
 *
 * Nothing here is a new kind of record. The dates already exist — a task's 📅,
 * a project's `targetDate`, the Hijri calendar — and the widget only counts
 * down to them; the one thing it keeps of its own is the handful of dates the
 * user types on the back of its card (a birthday, a trip), stored with that
 * card like any other widget setting.
 *
 * A task is counted only when it is marked for it, with a tag: a vault holds
 * hundreds of dated tasks, and a countdown to each of them would be the task
 * list again, sorted by date.
 */

export type CountdownSource = 'task' | 'project' | 'hijri' | 'own';

export interface Countdown {
    key: string;
    title: string;
    date: string;
    source: CountdownSource;
    /** The note it comes from, for the tap that opens it. */
    path?: string;
    /** Hijri events carry their name as a key, to be translated at render. */
    hijri?: HijriEvent;
}

export interface OwnEvent {
    title: string;
    date: string;
    /** Comes round every year — a birthday, an anniversary. */
    yearly?: boolean;
}

export const HIJRI_EVENTS = ['ramadan', 'eidFitr', 'arafah', 'eidAdha'] as const;
export type HijriEvent = (typeof HIJRI_EVENTS)[number];

const HIJRI_DAYS: Record<HijriEvent, { month: number; day: number }> = {
    ramadan: { month: RAMADAN_MONTH, day: 1 },
    eidFitr: { month: 10, day: 1 },
    arafah: { month: 12, day: 9 },
    eidAdha: { month: 12, day: 10 },
};

/** A Hijri year is 354 or 355 days; a little over one finds every event once. */
const HIJRI_HORIZON = 360;

/**
 * The next date of each Hijri event, today included. Walks the days rather
 * than converting back, because the platform only converts one way — and the
 * result follows the same calendar (and offset) the prayer view shows.
 */
export function hijriCountdowns(today: string, offset = 0): Countdown[] {
    const out: Countdown[] = [];
    const left = new Set<HijriEvent>(HIJRI_EVENTS);
    for (let i = 0; i <= HIJRI_HORIZON && left.size > 0; i += 1) {
        const date = addDays(today, i);
        const h = hijriDate(isoToDate(date), offset);
        if (!h) return out;
        for (const event of left) {
            const at = HIJRI_DAYS[event];
            if (h.month === at.month && h.day === at.day) {
                out.push({
                    key: `hijri:${event}`,
                    title: event,
                    date,
                    source: 'hijri',
                    hijri: event,
                });
                left.delete(event);
            }
        }
    }
    return out;
}

/** This year's date of a yearly event, or next year's once it has passed. */
export function nextYearly(date: string, today: string): string {
    const [, m, d] = date.split('-').map(Number);
    const on = (year: number) => {
        const last = new Date(year, m, 0).getDate();
        return toLocalIsoDate(new Date(year, m - 1, Math.min(d, last)));
    };
    const year = isoToDate(today).getFullYear();
    const thisYear = on(year);
    return thisYear >= today ? thisYear : on(year + 1);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function ownCountdowns(events: readonly OwnEvent[], today: string): Countdown[] {
    const out: Countdown[] = [];
    events.forEach((event, i) => {
        if (!ISO.test(event.date) || !event.title.trim()) return;
        const date = event.yearly ? nextYearly(event.date, today) : event.date;
        if (date < today) return;
        out.push({ key: `own:${i}`, title: event.title.trim(), date, source: 'own' });
    });
    return out;
}

const tagOf = (tag: string) => tag.trim().replace(/^#/, '').toLowerCase();

/** Open tasks carrying the tag, with a due date still ahead. */
export function taskCountdowns(tasks: readonly Task[], tag: string, today: string): Countdown[] {
    const wanted = tagOf(tag);
    if (!wanted) return [];
    return tasks
        .filter(
            (task) =>
                !!task.dueDate &&
                task.dueDate >= today &&
                task.status !== 'done' &&
                task.status !== 'cancelled' &&
                task.tags.some((t) => tagOf(t) === wanted)
        )
        .map((task) => ({
            key: `task:${task.id}`,
            title: task.title,
            date: task.dueDate as string,
            source: 'task' as const,
            path: task.filePath,
        }));
}

/** Projects still under way, with a target date still ahead. */
export function projectCountdowns(projects: readonly Project[], today: string): Countdown[] {
    return projects
        .filter(
            (p) =>
                !!p.targetDate &&
                ISO.test(p.targetDate) &&
                p.targetDate >= today &&
                p.status !== 'completed' &&
                p.status !== 'archived'
        )
        .map((p) => ({
            key: `project:${p.id}`,
            title: p.title,
            date: p.targetDate as string,
            source: 'project' as const,
            path: p.filePath,
        }));
}

/** Soonest first; on the same day, the user's own before the rest. */
export function upcoming(lists: ReadonlyArray<readonly Countdown[]>, limit: number): Countdown[] {
    const order: Record<CountdownSource, number> = { own: 0, hijri: 1, project: 2, task: 3 };
    return lists
        .flat()
        .sort((a, b) => a.date.localeCompare(b.date) || order[a.source] - order[b.source])
        .slice(0, limit);
}

export function daysUntil(date: string, today: string): number {
    return daysBetweenIso(today, date);
}
