import { describe, it, expect } from 'vitest';
import { queryTasks, matchesDue, type TaskQuery } from '../src/modules/tasks/services/taskFilter';
import type { Task } from '../src/store/taskSlice';
import type { TaskStatus } from '../src/core/constants';

const TODAY = '2025-06-15';

function task(partial: Partial<Task> & { status?: TaskStatus }): Task {
    const status = partial.status ?? 'todo';
    return {
        id: partial.id ?? Math.random().toString(),
        title: partial.title ?? 'Task',
        status,
        completed: status === 'done',
        priority: partial.priority ?? 'medium',
        tags: partial.tags ?? [],
        dueDate: partial.dueDate,
        subtasks: partial.subtasks ?? [],
        filePath: partial.filePath ?? 'tasks/Inbox.md',
        lineNumber: partial.lineNumber ?? 1,
        createdAt: partial.createdAt ?? '2025-01-01T00:00:00.000Z',
    };
}

const baseQuery: TaskQuery = {
    tab: 'all',
    priority: 'all',
    tag: '',
    search: '',
    sort: 'created',
    today: TODAY,
};

const tasks: Task[] = [
    task({ id: '1', title: 'Overdue', dueDate: '2025-06-10', priority: 'high', tags: ['work'] }),
    task({ id: '2', title: 'In prog', status: 'in-progress', priority: 'urgent', tags: ['home'] }),
    task({ id: '3', title: 'Future', dueDate: '2025-07-01', priority: 'low', tags: ['work'] }),
    task({ id: '4', title: 'Done thing', status: 'done', priority: 'high' }),
    task({ id: '5', title: 'Cancelled', status: 'cancelled', priority: 'low' }),
];

describe('queryTasks — tabs', () => {
    it('all includes every status (cancelled stays reachable)', () => {
        const ids = queryTasks(tasks, baseQuery).map((t) => t.id);
        expect(ids).toContain('5');
        expect(ids).toHaveLength(5);
    });

    it('active = todo + in-progress', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tab: 'active' }).map((t) => t.id).sort();
        expect(ids).toEqual(['1', '2', '3']);
    });

    it('in-progress only', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tab: 'in-progress' }).map((t) => t.id);
        expect(ids).toEqual(['2']);
    });

    it('done only', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tab: 'done' }).map((t) => t.id);
        expect(ids).toEqual(['4']);
    });
});

describe('queryTasks — filters', () => {
    it('filters by priority', () => {
        const ids = queryTasks(tasks, { ...baseQuery, priority: 'high' }).map((t) => t.id).sort();
        expect(ids).toEqual(['1', '4']);
    });

    it('filters by tag (case-insensitive, substring)', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tag: 'WOR' }).map((t) => t.id).sort();
        expect(ids).toEqual(['1', '3']);
    });

    it('search matches title or tags', () => {
        expect(queryTasks(tasks, { ...baseQuery, search: 'future' }).map((t) => t.id)).toEqual(['3']);
        expect(queryTasks(tasks, { ...baseQuery, search: 'home' }).map((t) => t.id)).toEqual(['2']);
    });
});

describe('queryTasks — sorting', () => {
    it('sorts by dueDate ascending, undated last', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tab: 'active', sort: 'dueDate' }).map((t) => t.id);
        expect(ids).toEqual(['1', '3', '2']);
    });

    it('sorts by priority weight descending', () => {
        const ids = queryTasks(tasks, { ...baseQuery, tab: 'active', sort: 'priority' }).map((t) => t.id);
        expect(ids[0]).toBe('2'); // urgent
        expect(ids[ids.length - 1]).toBe('3'); // low
    });
});

describe('matchesDue', () => {
    const TODAY = '2026-07-26';

    it('accepts everything on "all"', () => {
        expect(matchesDue(undefined, 'all', TODAY)).toBe(true);
        expect(matchesDue('2020-01-01', 'all', TODAY)).toBe(true);
    });

    it('finds tasks with no date — the ones nothing else surfaces', () => {
        expect(matchesDue(undefined, 'none', TODAY)).toBe(true);
        expect(matchesDue(TODAY, 'none', TODAY)).toBe(false);
    });

    it('splits overdue from today', () => {
        expect(matchesDue('2026-07-25', 'overdue', TODAY)).toBe(true);
        expect(matchesDue(TODAY, 'overdue', TODAY)).toBe(false);
        expect(matchesDue(TODAY, 'today', TODAY)).toBe(true);
    });

    it('covers the next seven days inclusive, and not the past', () => {
        expect(matchesDue(TODAY, 'week', TODAY)).toBe(true);
        expect(matchesDue('2026-08-02', 'week', TODAY)).toBe(true);
        expect(matchesDue('2026-08-03', 'week', TODAY)).toBe(false);
        expect(matchesDue('2026-07-25', 'week', TODAY)).toBe(false);
    });

    it('excludes undated tasks from every dated filter', () => {
        for (const f of ['overdue', 'today', 'week'] as const) {
            expect(matchesDue(undefined, f, TODAY)).toBe(false);
        }
    });

    it('crosses a month boundary correctly', () => {
        expect(matchesDue('2026-08-01', 'week', '2026-07-28')).toBe(true);
        expect(matchesDue('2026-08-05', 'week', '2026-07-28')).toBe(false);
    });
});
