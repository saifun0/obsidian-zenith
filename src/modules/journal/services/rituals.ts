import type { Task } from '../../../store/taskSlice';
import type { TaskPatch } from '../../tasks/services/taskFormat';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { addDays } from './journalDates';

/**
 * The morning and evening rituals, as lists and decisions.
 *
 * Morning: what today holds, which one thing matters most, and what is left
 * over from before. Evening: what got done, what did not — each to be kept for
 * today, moved on, or let go — and a line for tomorrow.
 *
 * A task that moves stays where it is written. Postponing sets its ⏳ date in
 * its own line; nothing is cut out of one note and pasted into another. That is
 * the promise the journal makes about tasks captured into a day, and the
 * rituals keep it.
 *
 * No streaks, no count of rituals done: skipping one costs nothing.
 */

export type RitualKind = 'morning' | 'evening';

export const RITUAL_STEPS = [
    'morning.today',
    'morning.focus',
    'morning.overdue',
    'evening.done',
    'evening.open',
    'evening.tomorrow',
] as const;
export type RitualStep = (typeof RITUAL_STEPS)[number];

/** The frontmatter key the day's main task is kept under. */
export const FOCUS_KEY = 'focus';

const open = (t: Task) => t.status !== 'done' && t.status !== 'cancelled';

/**
 * Today's open tasks: due or planned for today, or written into today's note —
 * captured tasks carry no date of their own and are still that day's.
 */
export function todaysTasks(tasks: readonly Task[], today: string, notePath?: string): Task[] {
    return tasks.filter(
        (t) =>
            open(t) &&
            (t.dueDate === today ||
                t.scheduledDate === today ||
                (!!notePath && t.filePath === notePath && !t.dueDate && !t.scheduledDate))
    );
}

/** Open tasks whose day has passed: due or planned before today. */
export function overdueTasks(tasks: readonly Task[], today: string): Task[] {
    return tasks.filter(
        (t) =>
            open(t) &&
            ((!!t.dueDate && t.dueDate < today) ||
                (!t.dueDate && !!t.scheduledDate && t.scheduledDate < today))
    );
}

/** What was finished today. */
export function doneToday(tasks: readonly Task[], today: string): Task[] {
    return tasks.filter((t) => t.status === 'done' && t.doneDate === today);
}

/** The evening's leftovers: today's and earlier days' open tasks, each once. */
export function leftovers(tasks: readonly Task[], today: string, notePath?: string): Task[] {
    const seen = new Set<string>();
    return [...todaysTasks(tasks, today, notePath), ...overdueTasks(tasks, today)].filter(
        (t) => !seen.has(t.id) && !!seen.add(t.id)
    );
}

export type TriageAction = 'today' | 'postpone' | 'cancel';

/**
 * What a triage choice writes. `today` and `postpone` set the ⏳ date in the
 * task's own line — today, or tomorrow; `cancel` is a status change, and the
 * caller hands it to the writer that stamps ❌.
 */
export function triagePatch(action: Exclude<TriageAction, 'cancel'>, today: string): TaskPatch {
    return { scheduledDate: action === 'today' ? today : addDays(today, 1) };
}

/** Which ritual fits the hour: the morning until the afternoon, the evening after. */
export function ritualFor(hour: number): RitualKind {
    return hour < 15 ? 'morning' : 'evening';
}

export interface RitualEvent {
    key: string;
    at: number;
    kind: RitualKind;
    date: string;
}

/** The reminders due in `[from, to)`: one a morning, one an evening. */
export function ritualEvents(
    from: number,
    to: number,
    morningHour: number,
    eveningHour: number
): RitualEvent[] {
    const out: RitualEvent[] = [];
    const first = new Date(from);
    for (let i = 0; i < 8; i++) {
        for (const [kind, hour] of [
            ['morning', morningHour],
            ['evening', eveningHour],
        ] as const) {
            if (hour < 0) continue;
            const at = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, hour);
            const when = at.getTime();
            if (when < from || when >= to) continue;
            const date = toLocalIsoDate(at);
            out.push({ key: `ritual:${kind}:${date}`, at: when, kind, date });
        }
    }
    return out.sort((a, b) => a.at - b.at);
}
