/**
 * Placing a task at an hour of the day.
 *
 * The calendar's other service, `calendarTasks`, answers *which day* a task
 * belongs on. This one answers *when on that day* — and only that, so it stays
 * free of the entry model and can be tested with plain numbers.
 *
 * Everything here counts in **minutes from local midnight**. A `Date` would
 * carry a timezone the task line never stated, and `"09:00"` sorts and packs
 * badly; an integer does both correctly and reduces the grid's arithmetic to
 * multiplication by a row height.
 */

import type { Task } from '../../../store/taskSlice';

/** Minutes in a day — the ceiling every slot is clamped to. */
export const DAY_MINUTES = 24 * 60;

/** `09:30` → 570. Anything that isn't `HH:MM` → undefined. */
export function minutesOfDay(time: string | undefined): number | undefined {
    const m = time?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return undefined;
    const hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    if (hours > 23 || minutes > 59) return undefined;
    return hours * 60 + minutes;
}

/** 570 → `09:30`. Minutes past the end of the day wrap to `24:00`. */
export function formatMinutes(minutes: number): string {
    const clamped = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface TimeSlot {
    /** Minutes from midnight the task starts at. */
    start: number;
    /**
     * Minutes from midnight it ends at — only when the note actually said so,
     * through `⏰ 09:00-10:30` or `⏲ 45m`. Absent means "unknown", not
     * "instant": the grid substitutes a default slot and draws it as a guess.
     */
    end?: number;
}

/**
 * When a task happens, from the markers it carries.
 *
 * Three sources, in falling order of how much they claim:
 *   `⏰ 09:00-10:30` — an actual range, so an actual block;
 *   `⏰ 09:00` + `⏲ 45m` — the countdown you set for it is the best available
 *      statement of how long the thing takes;
 *   `⏰ 09:00` alone — a start and nothing else.
 *
 * A task with no `⏰` has no slot at all, even with a `⏲`: a duration without a
 * start can't be placed on a grid, and guessing one would invent a commitment
 * the note never made.
 */
export function taskSlot(task: Task): TimeSlot | undefined {
    const start = minutesOfDay(task.dueTime);
    if (start === undefined) return undefined;

    const stated = minutesOfDay(task.dueEndTime);
    if (stated !== undefined && stated > start) return { start, end: stated };

    if (task.timerMinutes && task.timerMinutes > 0) {
        return { start, end: Math.min(start + task.timerMinutes, DAY_MINUTES) };
    }
    return { start };
}

/**
 * The date a task's `⏰` qualifies.
 *
 * Its due date, or — when it has none — the day it's scheduled for, then the
 * day it starts. An hour has to belong to exactly one day, and that is the day
 * the task is actually *for*; the same fallback chain the recurrence rollover
 * uses to pick its anchor date, for the same reason.
 */
export function slotDate(task: Task): string | undefined {
    return task.dueDate ?? task.scheduledDate ?? task.startDate;
}

/** Anything the grid can place: an item that knows when it starts. */
export interface TimedItem {
    /** Minutes from midnight. Undefined for an all-day item. */
    startMinutes?: number;
    /** Minutes from midnight, when stated. */
    endMinutes?: number;
}

export interface TimedBlock<T> {
    item: T;
    start: number;
    end: number;
    /** The end came from the note rather than from the default slot. */
    stated: boolean;
    /** Which side-by-side column this block takes, 0-based. */
    column: number;
    /** How many columns the overlapping group needs. */
    columns: number;
}

/**
 * Split a day's items into what the hour grid draws and what the all-day band
 * above it does.
 *
 * Nothing is dropped in either direction — a task with no hour is not less of a
 * task, it just has no row to sit in.
 */
export function splitTimed<T extends TimedItem>(items: T[]): { timed: T[]; allDay: T[] } {
    const timed: T[] = [];
    const allDay: T[] = [];
    for (const item of items) {
        if (item.startMinutes === undefined) allDay.push(item);
        else timed.push(item);
    }
    return { timed, allDay };
}

/**
 * Lay a day's timed items out side by side.
 *
 * Overlapping items are gathered into clusters — chains of items that touch,
 * directly or through a third — and each cluster is divided into as many
 * columns as it needs: take the items in start order and drop each into the
 * first column whose last item has already finished. Cluster by cluster rather
 * than over the whole day, so a busy morning doesn't squeeze a lone afternoon
 * block into a quarter of the width.
 *
 * `defaultMinutes` fills in an end the note didn't state. A minimum length is
 * applied *after* the packing so a 5-minute item still yields a visible block
 * without stealing width from something that genuinely runs alongside it.
 */
export function layoutDay<T extends TimedItem>(
    items: T[],
    defaultMinutes: number
): Array<TimedBlock<T>> {
    const blocks = items
        .map((item) => {
            const start = Math.max(0, Math.min(item.startMinutes ?? 0, DAY_MINUTES));
            const stated = item.endMinutes !== undefined && item.endMinutes > start;
            const end = stated
                ? Math.min(item.endMinutes as number, DAY_MINUTES)
                : Math.min(start + Math.max(defaultMinutes, 1), DAY_MINUTES);
            return { item, start, end, stated, column: 0, columns: 1 };
        })
        // Longest first among equal starts: the long block takes the leftmost
        // column, which is where the eye looks for "what is this hour about".
        .sort((a, b) => a.start - b.start || b.end - a.end);

    let cluster: Array<TimedBlock<T>> = [];
    let clusterEnd = -1;

    const closeCluster = () => {
        if (cluster.length === 0) return;
        /** Last minute each column is occupied until. */
        const columnEnds: number[] = [];
        for (const block of cluster) {
            let column = columnEnds.findIndex((end) => end <= block.start);
            if (column === -1) column = columnEnds.length;
            columnEnds[column] = block.end;
            block.column = column;
        }
        for (const block of cluster) block.columns = columnEnds.length;
        cluster = [];
        clusterEnd = -1;
    };

    for (const block of blocks) {
        if (cluster.length > 0 && block.start >= clusterEnd) closeCluster();
        cluster.push(block);
        clusterEnd = Math.max(clusterEnd, block.end);
    }
    closeCluster();

    return blocks;
}

/** The hours a grid shows, as `[from, to)` whole hours. */
export interface HourWindow {
    from: number;
    to: number;
}

/**
 * Which hours to draw.
 *
 * A full day is 24 rows, and on most days the first seven are empty — so the
 * default window is the waking hours, widened to cover anything that actually
 * falls outside them. That way nothing is ever hidden by the setting: an alarm
 * at 05:30 pulls the window open rather than disappearing from the grid.
 */
export function hourWindow(blocks: Array<{ start: number; end: number }>, allHours: boolean): HourWindow {
    if (allHours) return { from: 0, to: 24 };

    let from = 7;
    let to = 23;
    for (const block of blocks) {
        from = Math.min(from, Math.floor(block.start / 60));
        // An event ending exactly on the hour doesn't need the next row.
        to = Math.max(to, Math.ceil(block.end / 60));
    }
    return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}
