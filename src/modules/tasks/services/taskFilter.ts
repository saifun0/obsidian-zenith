import type { Task } from '../../../store/taskSlice';
import { PRIORITY_WEIGHT } from '../../../core/constants';
import type { Priority } from '../../../core/constants';
import { shiftIsoDate } from './taskFormat';

export { PRIORITY_WEIGHT };

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

/** Whether a task's due date satisfies `filter`, relative to `today`. */
export function matchesDue(dueDate: string | undefined, filter: DueFilter, today: string): boolean {
    if (filter === 'all') return true;
    if (!dueDate) return filter === 'none';
    switch (filter) {
        case 'none':
            return false;
        case 'overdue':
            return dueDate < today;
        case 'today':
            return dueDate === today;
        case 'week':
            // Dates are ISO `YYYY-MM-DD`, so string comparison is date
            // comparison. The end of the window comes from `shiftIsoDate`, which
            // formats in local time — `toISOString()` here would convert local
            // midnight to the previous day east of UTC and cut the week short.
            return dueDate >= today && dueDate <= shiftIsoDate(today, 7);
        default:
            return true;
    }
}

export interface TaskQuery {
    /** Active tab: 'all' | 'active' | 'in-progress' | 'done'. */
    tab: string;
    priority: Priority | 'all';
    tag: string;
    search: string;
    /** `manual` = the order the lines sit in their files (what drag-and-drop edits). */
    sort: 'manual' | 'dueDate' | 'priority' | 'created';
    /**
     * Narrow by deadline. `none` finds the tasks with no date at all — the ones
     * that quietly accumulate because no view ever surfaces them.
     */
    due?: DueFilter;
    /** Today's local date as `YYYY-MM-DD`, injected for testability. */
    today: string;
}

/**
 * Filter + sort tasks for the Tasks view. Pure (no Obsidian / no `Date.now`),
 * so it's unit-testable and reused by the component.
 */
export function queryTasks(tasks: Task[], q: TaskQuery): Task[] {
    let result: Task[] = [...tasks];

    // ── Tab ──
    switch (q.tab) {
        case 'active':
            result = result.filter((t) => t.status === 'todo' || t.status === 'in-progress');
            break;
        case 'in-progress':
            result = result.filter((t) => t.status === 'in-progress');
            break;
        case 'done':
            result = result.filter((t) => t.status === 'done');
            break;
        case 'all':
        default:
            // Everything, including done & cancelled (so cancelled stays reachable).
            break;
    }

    // ── Priority ──
    if (q.priority !== 'all') {
        result = result.filter((t) => t.priority === q.priority);
    }

    // ── Due date ──
    if (q.due && q.due !== 'all') {
        result = result.filter((t) => matchesDue(t.dueDate, q.due as DueFilter, q.today));
    }

    // ── Tag ──
    if (q.tag) {
        const tagLower = q.tag.toLowerCase();
        result = result.filter((t) => t.tags.some((tag) => tag.toLowerCase().includes(tagLower)));
    }

    // ── Text search (title or tags) ──
    const query = q.search.trim().toLowerCase();
    if (query) {
        result = result.filter(
            (t) =>
                t.title.toLowerCase().includes(query) ||
                t.tags.some((tag) => tag.toLowerCase().includes(query))
        );
    }

    // ── Sort ──
    result.sort((a, b) => {
        switch (q.sort) {
            // File order — the only mode where dragging a task can visibly move
            // it, since every other mode derives the order from task data.
            case 'manual':
                return a.filePath.localeCompare(b.filePath) || a.lineNumber - b.lineNumber;
            case 'dueDate': {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return a.dueDate.localeCompare(b.dueDate);
            }
            case 'priority':
                return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
            case 'created':
            default:
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
    });

    return result;
}
