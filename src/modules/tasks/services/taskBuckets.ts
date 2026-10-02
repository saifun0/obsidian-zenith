import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';

/**
 * The smart groups of the task list, and what dropping a task into one *means*.
 *
 * The groups read like a diary: what has slipped, today, tomorrow, the week
 * ahead, later, and what has no day at all — then what was finished or given
 * up. "Later" used to hold everything that was not today or overdue, so next
 * Tuesday, next spring and "some day" sat in one pile of thirty-four.
 *
 * Reordering inside a group is a change of order; crossing into another group
 * is a change of data — the group is only ever a rendering of that data. So a
 * cross-group drop edits the task until it genuinely belongs where it landed,
 * rather than moving lines around and letting it snap back on the next reparse.
 */
export interface BucketDrop {
    /** ISO date, `null` to clear, `undefined` to leave alone. */
    dueDate?: string | null;
    status?: TaskStatus;
}

/** Smart-group ids, in the order the list draws them. */
export const BUCKETS = [
    'overdue',
    'today',
    'tomorrow',
    'week',
    'later',
    'nodate',
    'done',
    'cancelled',
] as const;

export type BucketId = (typeof BUCKETS)[number];

/** How far ahead "the week" reaches, counting today as day 0. */
export const WEEK_AHEAD = 7;

const DAY_MS = 86_400_000;

/** The ISO date `days` after `iso`. Calendar arithmetic, so no time zone enters it. */
export function addDays(iso: string, days: number): string {
    return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `today` to `iso`; negative once it has passed. */
function daysFrom(today: string, iso: string): number {
    return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/** The group a task is drawn in. */
export function bucketOf(task: Task, today: string): BucketId {
    if (task.status === 'done') return 'done';
    if (task.status === 'cancelled') return 'cancelled';
    if (!task.dueDate) return 'nodate';
    const d = daysFrom(today, task.dueDate);
    if (Number.isNaN(d)) return 'nodate';
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d <= WEEK_AHEAD) return 'week';
    return 'later';
}

/**
 * The edit that lands a task in `bucket`, or null when that isn't a sensible
 * destination.
 *
 * Two groups take nothing. "Overdue" means *the deadline has passed*, and
 * there's no honest way to put something there on purpose. "Later" is every
 * day past the coming week, and no one of them is what a drop there means —
 * "no day yet" has a group of its own now.
 *
 * "The week" lands on its last day: a task dragged there is one to be done
 * this week, and the end of the week is when that stops being true.
 *
 * Dropping into an active group also revives a done/cancelled task. Without
 * that, dragging something out of Done would set a due date, change nothing
 * visible, and look broken.
 */
export function bucketDrop(bucket: BucketId, task: Task, today: string): BucketDrop | null {
    const inactive = task.status === 'done' || task.status === 'cancelled';
    const revive = inactive ? ('todo' as const) : undefined;

    switch (bucket) {
        case 'today':
            return { dueDate: today, status: revive };
        case 'tomorrow':
            return { dueDate: addDays(today, 1), status: revive };
        case 'week':
            return { dueDate: addDays(today, WEEK_AHEAD), status: revive };
        case 'nodate':
            return { dueDate: null, status: revive };
        case 'done':
            return task.status === 'done' ? null : { status: 'done' };
        case 'cancelled':
            return task.status === 'cancelled' ? null : { status: 'cancelled' };
        case 'overdue':
        case 'later':
        default:
            return null;
    }
}

/** Whether a task dropped into this group would actually change anything. */
export function canDropInBucket(bucket: BucketId, task: Task, today: string): boolean {
    return bucketDrop(bucket, task, today) !== null;
}
