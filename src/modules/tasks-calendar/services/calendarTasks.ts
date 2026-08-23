/**
 * Placing tasks on a calendar.
 *
 * A task can land on a day for more than one reason — it starts then, it's due
 * then, it was finished then, or it simply lives in that day's note — and the
 * reason is what the calendar is really showing. So a day doesn't hold tasks, it
 * holds `CalendarEntry`s: a task plus the *kind* of date that put it there. The
 * same task legitimately appears twice (🛫 Monday, 📅 Friday), which is the
 * behaviour the calendar exists for.
 */

import type { Task } from '../../../store/taskSlice';
import { PRIORITY_WEIGHT } from '../../../core/constants';
import { daysBetweenIso as daysBetween } from '../../../core/dateUtils';
import { slotDate, taskSlot } from './calendarTime';

/**
 * Why a task is on a day. Ordered by how loudly it wants attention — the order
 * entries are stacked in a cell, and the order the legend reads in.
 */
export const ENTRY_KINDS = [
    'overdue',
    'due',
    'recurrence',
    'start',
    'scheduled',
    'process',
    'dailyNote',
    'done',
    'cancelled',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Kinds that count as finished, and are what the "hide done" filter hides. */
const CLOSED_KINDS = new Set<EntryKind>(['done', 'cancelled']);

export interface CalendarEntry {
    /** Unique per rendered row: one task can appear on several days, and twice
     *  on one day if two of its dates coincide. */
    key: string;
    task: Task;
    kind: EntryKind;
    /** How many days past due, for the overdue flag. Only set on `overdue`. */
    overdueBy?: number;
    /**
     * Minutes from midnight the task happens at, from its `⏰`.
     *
     * Set on the ONE entry whose date the marker qualifies (see
     * {@link slotDate}) — the same task's start-date entry is still all-day,
     * because "starts Monday" doesn't happen at 15:45. Entries carrying this
     * are what the hour grid draws; everything else goes in the all-day band.
     */
    startMinutes?: number;
    /** Minutes from midnight it ends at, when the note stated one. */
    endMinutes?: number;
}

/**
 * A task that runs from 🛫 to 📅, kept out of `byDate` on purpose.
 *
 * Repeating the title in every cell between the two dates is what turns a month
 * with two live projects into thirty identical chips — the first version of this
 * calendar did exactly that. A span is one object, and the views that have
 * columns to work with draw it as a single bar across them.
 */
export interface CalendarSpan {
    key: string;
    task: Task;
    /** Start date, inclusive. */
    from: string;
    /** Due date, inclusive. */
    to: string;
    /**
     * The bar's last day also carries a timed entry, because the task states an
     * hour. The bar shows the run-up, the entry shows the deadline itself —
     * and the two must not both be counted as work due in the range.
     */
    timedEnd?: boolean;
}

export interface CalendarOptions {
    /** Today, as `YYYY-MM-DD` — overdue is relative to it. */
    today: string;
    /**
     * Draw a task with both a start and a due date on every day in between, the
     * way a calendar app draws a multi-day event.
     */
    spanDays: boolean;
    /** Place undated tasks on the date of the daily note they live in. */
    showDailyNotes: boolean;
    /** Hide done and cancelled entries. */
    hideDone: boolean;
    /**
     * Recover a daily note's date from its vault path — the journal's matcher.
     * Undefined when the journal module can't tell (no invertible pattern), and
     * the daily-note placement is then simply off.
     */
    dailyNoteDate?: (path: string) => string | null;
}

const isOpen = (task: Task): boolean => task.status === 'todo' || task.status === 'in-progress';

/**
 * Whether a task should be drawn as a bar rather than as day entries: it runs
 * over more than one day, and that stretch is still ahead of you.
 *
 * A recurring task is excluded even when it carries both dates — its 🛫→📅
 * window describes one occurrence, and stretching it across the calendar would
 * claim something about every future repeat that isn't true. Overdue is
 * excluded too: a bar ending in the past is history, and the task is already
 * shouting from today's cell.
 */
function spansDays(task: Task, opts: CalendarOptions): boolean {
    return (
        opts.spanDays &&
        !task.recurrence &&
        !!task.startDate &&
        !!task.dueDate &&
        task.startDate < task.dueDate &&
        task.dueDate >= opts.today
    );
}

/**
 * Every day a task should appear on, with the reason for each.
 *
 * Overdue is deliberately *not* placed on the day it was due — an unfinished
 * task from three weeks ago belongs where you'll see it, so the caller pins
 * overdue entries to today (see {@link buildCalendar}).
 */
function entriesForTask(task: Task, opts: CalendarOptions): Array<{ date: string; entry: CalendarEntry }> {
    const out: Array<{ date: string; entry: CalendarEntry }> = [];

    // The hour, and the one date it describes. An overdue entry never takes it:
    // that entry is pinned to today (see below), and 15:45 *last Tuesday* would
    // put a block on today's grid at a time nothing is happening.
    const slot = taskSlot(task);
    const timedOn = slot ? slotDate(task) : undefined;

    const push = (date: string, kind: EntryKind, overdueBy?: number) => {
        const timed = slot && date === timedOn && kind !== 'overdue';
        out.push({
            date,
            entry: {
                key: `${task.id}:${kind}:${date}`,
                task,
                kind,
                overdueBy,
                startMinutes: timed ? slot.start : undefined,
                endMinutes: timed ? slot.end : undefined,
            },
        });
    };

    if (!isOpen(task)) {
        // A finished task shows on the day it was finished. Without a ✅ date —
        // the Tasks plugin only writes one if you ask it to — its due date is
        // the best guess at when that was.
        const closedOn = task.doneDate ?? task.dueDate;
        if (closedOn) push(closedOn, task.status === 'cancelled' ? 'cancelled' : 'done');
        return out;
    }

    // A spanning task's bar already carries both of its dates, so emitting them
    // again here would put a chip at each end of it.
    if (!spansDays(task, opts)) {
        if (task.dueDate) {
            if (task.dueDate < opts.today) {
                push(opts.today, 'overdue', daysBetween(task.dueDate, opts.today));
            } else {
                push(task.dueDate, task.recurrence ? 'recurrence' : 'due');
            }
        }
        if (task.startDate) push(task.startDate, 'start');
    } else if (slot && task.dueDate && task.dueDate === timedOn) {
        // …except when it states an hour. A bar can say which days a task runs
        // over but not that it is due at 15:45, and that hour is the whole
        // reason the task carries a `⏰`. So the bar keeps the run and this
        // entry takes the deadline — one chip at one end, on purpose. Always
        // `due`: a recurring task never spans (see {@link spansDays}).
        push(task.dueDate, 'due');
    }

    if (task.scheduledDate) push(task.scheduledDate, 'scheduled');

    // Undated tasks captured in a daily note belong to that note's day. A task
    // that carries any date of its own is already placed above.
    if (opts.showDailyNotes && !task.dueDate && !task.startDate && !task.scheduledDate) {
        const date = opts.dailyNoteDate?.(task.filePath);
        if (date) push(date, 'dailyNote');
    }

    return out;
}

/**
 * Sort within a cell: by kind, then by the clock, then by priority.
 *
 * The hour outranks priority because it isn't a preference — a list that reads
 * 09:00, 11:30, 15:45 is the day in the order it happens, and re-ordering two
 * of those by importance makes the column stop being a timeline. Entries with
 * no hour follow the timed ones for the same reason: they're the part of the
 * day that hasn't been placed yet.
 */
function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
    const kind = ENTRY_KINDS.indexOf(a.kind) - ENTRY_KINDS.indexOf(b.kind);
    if (kind !== 0) return kind;
    if (a.startMinutes !== b.startMinutes) {
        if (a.startMinutes === undefined) return 1;
        if (b.startMinutes === undefined) return -1;
        return a.startMinutes - b.startMinutes;
    }
    const priority = PRIORITY_WEIGHT[b.task.priority] - PRIORITY_WEIGHT[a.task.priority];
    if (priority !== 0) return priority;
    return a.task.title.localeCompare(b.task.title);
}

export interface CalendarCounts {
    /** Entries per kind, over whatever range was asked for. */
    byKind: Record<EntryKind, number>;
    /** Done ÷ (done + open) as a percentage, 100 when there's nothing to do. */
    percentDone: number;
    /** Open entries — what's still on your plate in this range. */
    remaining: number;
}

export interface Calendar {
    /** ISO date → the entries on that day, already sorted. */
    byDate: Map<string, CalendarEntry[]>;
    /** Multi-day tasks, for the views that can draw a bar across columns. */
    spans: CalendarSpan[];
}

/** Place every task on the days it belongs to. */
export function buildCalendar(tasks: Task[], opts: CalendarOptions): Calendar {
    const byDate = new Map<string, CalendarEntry[]>();
    const spans: CalendarSpan[] = [];

    for (const task of tasks) {
        if (isOpen(task) && spansDays(task, opts)) {
            spans.push({
                key: `${task.id}:span`,
                task,
                from: task.startDate as string,
                to: task.dueDate as string,
                timedEnd: taskSlot(task) !== undefined && slotDate(task) === task.dueDate,
            });
        }
        for (const { date, entry } of entriesForTask(task, opts)) {
            if (opts.hideDone && CLOSED_KINDS.has(entry.kind)) continue;
            const list = byDate.get(date);
            if (list) list.push(entry);
            else byDate.set(date, [entry]);
        }
    }

    for (const list of byDate.values()) list.sort(compareEntries);
    return { byDate, spans };
}

// ── Laying spans out across a row of days ────────────

export interface SpanSegment {
    span: CalendarSpan;
    /** Column of the first day this row shows of the span. */
    from: number;
    /** Column of the last day this row shows of the span. */
    to: number;
    /** The span reaches beyond this row — draw a flat cap, not a rounded one. */
    clippedStart: boolean;
    clippedEnd: boolean;
    /** Which stacked bar this is, 0-based. */
    lane: number;
}

/**
 * Fit the spans crossing `dates` into as few stacked lanes as possible.
 *
 * The classic interval-packing greedy: take the bars left to right and drop
 * each into the first lane whose last bar has already ended. Longest-first
 * within the same start keeps the long runs at the top, where they read as the
 * backdrop the shorter ones sit against.
 */
export function layoutSpans(
    spans: CalendarSpan[],
    dates: string[]
): { segments: SpanSegment[]; lanes: number } {
    if (dates.length === 0) return { segments: [], lanes: 0 };
    const first = dates[0];
    const last = dates[dates.length - 1];

    const visible = spans
        .filter((span) => span.from <= last && span.to >= first)
        .map((span) => ({
            span,
            from: Math.max(0, dates.indexOf(span.from)),
            to: span.to > last ? dates.length - 1 : dates.indexOf(span.to),
            clippedStart: span.from < first,
            clippedEnd: span.to > last,
        }))
        .sort(
            (a, b) =>
                a.from - b.from ||
                b.to - b.from - (a.to - a.from) ||
                a.span.task.title.localeCompare(b.span.task.title)
        );

    /** Last column each lane is occupied through. */
    const laneEnds: number[] = [];
    const segments = visible.map((seg) => {
        let lane = laneEnds.findIndex((end) => end < seg.from);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = seg.to;
        return { ...seg, lane };
    });

    return { segments, lanes: laneEnds.length };
}

/** Tally the entries falling inside `dates` (a month's or a week's cells). */
export function countEntries(calendar: Calendar, dates: Iterable<string>): CalendarCounts {
    const byKind = Object.fromEntries(ENTRY_KINDS.map((k) => [k, 0])) as Record<EntryKind, number>;
    const inRange = new Set(dates);

    for (const date of inRange) {
        for (const entry of calendar.byDate.get(date) ?? []) byKind[entry.kind] += 1;
    }

    // A span counts as work in this range when it *lands* here — that's the day
    // it's due, and the day it either got done or didn't.
    let spansDue = 0;
    for (const span of calendar.spans) {
        if ([...inRange].some((d) => d >= span.from && d <= span.to)) byKind.process += 1;
        // A bar whose last day already emitted a `due` entry has been counted
        // by the loop above; counting it again would make one task two.
        if (inRange.has(span.to) && !span.timedEnd) spansDue += 1;
    }

    const done = byKind.done;
    // "Work in this range" is what was due, what's late, and what got finished.
    // Start and scheduled dates are the same tasks seen from another angle —
    // counting them would make the progress ring drift below what you achieved.
    const total = byKind.due + byKind.recurrence + byKind.overdue + done + spansDue;
    return {
        byKind,
        percentDone: total === 0 ? 100 : Math.round((done / total) * 100),
        remaining: total - done,
    };
}

/**
 * Entries across a date range, flattened and in calendar order — the agenda.
 *
 * A list has no columns to draw a bar across, so each span reappears here as
 * what it actually is on the two days that matter: it starts, and it's due.
 * Empty days are dropped — a list of "nothing on this day" is not an agenda.
 */
export function agenda(
    calendar: Calendar,
    dates: string[]
): Array<{ date: string; entries: CalendarEntry[] }> {
    const extra = new Map<string, CalendarEntry[]>();
    for (const span of calendar.spans) {
        const dates: Array<[string, EntryKind]> = [[span.from, 'start']];
        // A bar that states an hour already has a real due entry on its last
        // day, carrying that hour. Synthesising a second one here would list
        // the same deadline twice, once with the time and once without.
        if (!span.timedEnd) dates.push([span.to, 'due']);

        for (const [date, kind] of dates) {
            const entry: CalendarEntry = { key: `${span.key}:${kind}`, task: span.task, kind };
            extra.set(date, [...(extra.get(date) ?? []), entry]);
        }
    }

    return dates
        .map((date) => ({
            date,
            entries: [...(calendar.byDate.get(date) ?? []), ...(extra.get(date) ?? [])].sort(
                compareEntries
            ),
        }))
        .filter((day) => day.entries.length > 0);
}
