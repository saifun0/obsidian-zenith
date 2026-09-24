import type { Task } from '../../../store/taskSlice';
import type { TaskPatch } from '../../tasks/services/taskFormat';
import { formatMinutes, slotDate } from './calendarTime';

/**
 * Moving a task on the hour grid, as arithmetic.
 *
 * Dragging a block, stretching it, dropping an undated-hour task onto a row,
 * nudging with the arrow keys — each ends as a new start, maybe a new end, and
 * maybe a new day. This file turns that into the change to the task's line, so
 * the component only deals with pointers and the rules can be tested with
 * numbers.
 *
 * Three rules worth keeping:
 * - Stretching changes the end of the `⏰` range, never `⏲`: the countdown is
 *   how long you set a timer for, not when the thing ends.
 * - Moving keeps whatever end the line states — and states none it did not:
 *   a block whose height came from `⏲`, or from the default slot, stays that
 *   way.
 * - Another day changes whichever date the `⏰` belongs to. When that is the
 *   due date, it is a deadline moving, and the caller asks first.
 */

/** Everything lands on a quarter hour: finer is fiddly with a pointer, coarser is not enough. */
export const SNAP_MINUTES = 15;

/**
 * The latest a block may end: the last quarter hour. `24:00` is not a time a
 * task line can carry, and a block ending at midnight would have to say it.
 */
const LAST_END = 24 * 60 - SNAP_MINUTES;

export function snap(minutes: number, step = SNAP_MINUTES): number {
    return Math.round(minutes / step) * step;
}

export interface GridSlot {
    date: string;
    start: number;
    end: number;
}

/**
 * A block moved to start at `start` (unsnapped), keeping its length, and kept
 * within the day.
 */
export function movedSlot(date: string, start: number, length: number): GridSlot {
    const len = Math.max(SNAP_MINUTES, length);
    const s = Math.max(0, Math.min(snap(start), LAST_END - len));
    return { date, start: s, end: s + len };
}

/** A block's end dragged to `end` (unsnapped): at least a quarter hour long, and not past the day. */
export function resizedSlot(date: string, start: number, end: number): GridSlot {
    const e = Math.max(start + SNAP_MINUTES, Math.min(snap(end), LAST_END));
    return { date, start, end: e };
}

export type DragMode = 'move' | 'resize' | 'place';

export interface SlotChange {
    patch: TaskPatch;
    /** The date field that moves, when the day changes. */
    dateField?: 'dueDate' | 'scheduledDate' | 'startDate';
    /** A due date is moving: a deadline, which the caller confirms first. */
    confirm: boolean;
}

/**
 * The change to a task's line that puts it at `to`.
 *
 * `mode` says what the gesture was: `resize` writes an end; `move` shifts an
 * end the line states, and writes none it did not; `place` gives an hour to a
 * task that had none, and no end — the grid's default slot will draw it, as a
 * guess, until someone stretches it.
 */
export function slotChange(task: Task, mode: DragMode, to: GridSlot): SlotChange {
    const patch: TaskPatch = { dueTime: formatMinutes(to.start) };
    if (mode === 'resize' || (mode === 'move' && task.dueEndTime)) {
        patch.dueEndTime = formatMinutes(to.end);
    } else if (mode === 'place') {
        patch.dueEndTime = null;
    }

    const current = slotDate(task);
    if (!current || current === to.date) return { patch, confirm: false };

    const dateField = task.dueDate ? 'dueDate' : task.scheduledDate ? 'scheduledDate' : 'startDate';
    patch[dateField] = to.date;
    return { patch, dateField, confirm: dateField === 'dueDate' };
}

/**
 * Whether a task can be given an hour by dropping it on the grid from `date`'s
 * all-day band.
 *
 * Only an open task, and only from the day its hour would belong to: dragging
 * the "starts Monday" chip of a task due Friday onto Monday 10:00 would set
 * an hour on Friday, which is not what anyone dragging it meant.
 */
export function canPlace(task: Task, date: string): boolean {
    if (task.status === 'done' || task.status === 'cancelled') return false;
    return slotDate(task) === date;
}
