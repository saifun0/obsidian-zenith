import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';

/**
 * What dropping a task into a group *means*.
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

/** Smart-bucket ids, matching the headings in the task list. */
export type BucketId = 'overdue' | 'today' | 'later' | 'done' | 'cancelled';

/**
 * The edit that lands a task in `bucket`, or null when that isn't a sensible
 * destination.
 *
 * "Overdue" is deliberately not droppable: it means *the deadline has passed*,
 * and there's no honest way to put something there on purpose.
 *
 * Dropping into an active bucket also revives a done/cancelled task. Without
 * that, dragging something out of Done would set a due date, change nothing
 * visible, and look broken.
 */
export function bucketDrop(bucket: BucketId, task: Task, today: string): BucketDrop | null {
    const inactive = task.status === 'done' || task.status === 'cancelled';

    switch (bucket) {
        case 'today':
            return { dueDate: today, status: inactive ? 'todo' : undefined };
        case 'later':
            // "Later" is everything active that isn't due today or overdue, so
            // clearing the date is the move that always gets you there.
            return { dueDate: null, status: inactive ? 'todo' : undefined };
        case 'done':
            return task.status === 'done' ? null : { status: 'done' };
        case 'cancelled':
            return task.status === 'cancelled' ? null : { status: 'cancelled' };
        case 'overdue':
        default:
            return null;
    }
}

/** Whether a task dropped into this bucket would actually change anything. */
export function canDropInBucket(bucket: BucketId, task: Task, today: string): boolean {
    return bucketDrop(bucket, task, today) !== null;
}
