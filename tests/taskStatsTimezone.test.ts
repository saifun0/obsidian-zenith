import { describe, it, expect, afterEach } from 'vitest';
import { computeTaskStats } from '../src/modules/tasks/services/taskStats';
import type { Task } from '../src/store/taskSlice';

/**
 * The stats ranges count local days. The start of "week" used to be taken
 * from `toISOString()`, which is UTC: east of Greenwich — Moscow, where most
 * of this plugin's users are — that moved it a day back, and a week held
 * eight days of completions.
 */
const original = process.env.TZ;

afterEach(() => {
    process.env.TZ = original;
});

const done = (doneDate: string) =>
    ({ id: doneDate, title: doneDate, status: 'done', doneDate, tags: [] }) as unknown as Task;

describe('a week of completions in UTC+3', () => {
    it('is seven days back, not eight', () => {
        process.env.TZ = 'Europe/Moscow';
        const stats = computeTaskStats(
            [done('2026-09-23'), done('2026-09-24'), done('2026-09-30')],
            '2026-09-30',
            'week'
        );
        // The 23rd is exactly a week before the 30th and belongs to it; the
        // 22nd would not, and nor would anything before.
        expect(stats.completedInRange).toBe(3);

        const eighth = computeTaskStats([done('2026-09-22')], '2026-09-30', 'week');
        expect(eighth.completedInRange).toBe(0);
    });
});
