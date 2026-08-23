import { describe, it, expect } from 'vitest';
import { bucketDrop, canDropInBucket } from '../src/modules/tasks/services/taskBuckets';
import type { Task } from '../src/store/taskSlice';
import type { TaskStatus } from '../src/core/constants';

const TODAY = '2026-07-26';

function task(over: Partial<Task> = {}): Task {
    return {
        id: 'f.md:1',
        title: 'A task',
        status: 'todo' as TaskStatus,
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'f.md',
        lineNumber: 1,
        createdAt: '2026-07-01T00:00:00.000Z',
        ...over,
    };
}

describe('bucketDrop', () => {
    it('schedules for today', () => {
        expect(bucketDrop('today', task(), TODAY)).toEqual({ dueDate: TODAY, status: undefined });
    });

    it('clears the due date for "later"', () => {
        expect(bucketDrop('later', task({ dueDate: TODAY }), TODAY)).toEqual({
            dueDate: null,
            status: undefined,
        });
    });

    it('revives a done task dropped into an active bucket', () => {
        expect(bucketDrop('today', task({ status: 'done', completed: true }), TODAY)).toEqual({
            dueDate: TODAY,
            status: 'todo',
        });
        expect(bucketDrop('later', task({ status: 'cancelled' }), TODAY)).toEqual({
            dueDate: null,
            status: 'todo',
        });
    });

    it('completes and cancels', () => {
        expect(bucketDrop('done', task(), TODAY)).toEqual({ status: 'done' });
        expect(bucketDrop('cancelled', task(), TODAY)).toEqual({ status: 'cancelled' });
    });

    it('refuses drops that would change nothing', () => {
        expect(bucketDrop('done', task({ status: 'done' }), TODAY)).toBeNull();
        expect(bucketDrop('cancelled', task({ status: 'cancelled' }), TODAY)).toBeNull();
    });

    it('never accepts "overdue" — a deadline in the past is not a destination', () => {
        expect(bucketDrop('overdue', task(), TODAY)).toBeNull();
        expect(bucketDrop('overdue', task({ status: 'done' }), TODAY)).toBeNull();
    });
});

describe('canDropInBucket', () => {
    it('mirrors bucketDrop', () => {
        expect(canDropInBucket('today', task(), TODAY)).toBe(true);
        expect(canDropInBucket('overdue', task(), TODAY)).toBe(false);
        expect(canDropInBucket('done', task({ status: 'done' }), TODAY)).toBe(false);
    });
});
