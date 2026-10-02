import { describe, it, expect } from 'vitest';
import {
    addDays,
    bucketDrop,
    bucketOf,
    canDropInBucket,
} from '../src/modules/tasks/services/taskBuckets';
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

    it('schedules for tomorrow, and for the last day of the week ahead', () => {
        expect(bucketDrop('tomorrow', task(), TODAY)).toEqual({ dueDate: '2026-07-27', status: undefined });
        expect(bucketDrop('week', task(), TODAY)).toEqual({ dueDate: '2026-08-02', status: undefined });
    });

    it('clears the due date for "no date"', () => {
        expect(bucketDrop('nodate', task({ dueDate: TODAY }), TODAY)).toEqual({
            dueDate: null,
            status: undefined,
        });
    });

    it('revives a done task dropped into an active bucket', () => {
        expect(bucketDrop('today', task({ status: 'done', completed: true }), TODAY)).toEqual({
            dueDate: TODAY,
            status: 'todo',
        });
        expect(bucketDrop('nodate', task({ status: 'cancelled' }), TODAY)).toEqual({
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

    it('never accepts "later" — no single day is what it means', () => {
        expect(bucketDrop('later', task(), TODAY)).toBeNull();
    });
});

describe('canDropInBucket', () => {
    it('mirrors bucketDrop', () => {
        expect(canDropInBucket('today', task(), TODAY)).toBe(true);
        expect(canDropInBucket('overdue', task(), TODAY)).toBe(false);
        expect(canDropInBucket('done', task({ status: 'done' }), TODAY)).toBe(false);
    });
});

describe('bucketOf', () => {
    const at = (dueDate?: string, status: TaskStatus = 'todo') => bucketOf(task({ dueDate, status }), TODAY);

    it('reads the due date like a diary', () => {
        expect(at('2026-07-25')).toBe('overdue');
        expect(at(TODAY)).toBe('today');
        expect(at('2026-07-27')).toBe('tomorrow');
        expect(at('2026-07-28')).toBe('week');
        expect(at('2026-08-02')).toBe('week');
        expect(at('2026-08-03')).toBe('later');
        expect(at(undefined)).toBe('nodate');
    });

    it('puts what is closed under how it was closed, whatever its date', () => {
        expect(at('2026-07-25', 'done')).toBe('done');
        expect(at(undefined, 'cancelled')).toBe('cancelled');
        expect(at('2026-07-25', 'in-progress')).toBe('overdue');
    });

    it('counts across a month and a year end', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(bucketOf(task({ dueDate: '2027-01-01' }), '2026-12-31')).toBe('tomorrow');
    });

    it('takes an unreadable date as no date rather than as a day', () => {
        expect(at('someday')).toBe('nodate');
    });
});
