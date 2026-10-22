import { describe, expect, it } from 'vitest';
import { weekSeries } from '../src/modules/tasks/services/taskHours';
import { buildGoals, weeksUnder } from '../src/modules/tasks/services/goalTree';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * The chart over a tally's field: the last eight weeks, this one at the
 * right, each with what was put in — and for a goal that asks for hours or
 * times in all, what was put in on everything under it.
 */

describe('the weeks a chart draws', () => {
    it('are the last ones up to this, oldest first, empty where nothing was put in', () => {
        const weeks = [
            { start: '2026-09-28', amount: 300 },
            { start: '2026-10-12', amount: 120 },
            { start: '2026-10-19', amount: 60 },
        ];
        expect(weekSeries(weeks, '2026-10-19', 4)).toEqual([
            { start: '2026-09-28', amount: 300 },
            { start: '2026-10-05', amount: 0 },
            { start: '2026-10-12', amount: 120 },
            { start: '2026-10-19', amount: 60 },
        ]);
    });

    it('leave out the weeks before the first drawn', () => {
        const series = weekSeries([{ start: '2026-01-05', amount: 60 }], '2026-10-19', 8);
        expect(series).toHaveLength(8);
        expect(series.every((w) => w.amount === 0)).toBe(true);
    });
});

const sub = (title: string, extra: Partial<SubTask> = {}): SubTask =>
    ({ title, status: 'todo', lineNumber: 2, subtasks: [], ...extra }) as SubTask;

describe('the weeks under a goal', () => {
    it('add up what each step put in, each kind on its own', () => {
        const goal = {
            id: 'g',
            title: 'Run',
            status: 'todo',
            completed: false,
            priority: 'none',
            tags: ['goal'],
            filePath: 'Goals.md',
            lineNumber: 1,
            createdAt: '',
            subtasks: [
                sub('Easy runs', {
                    weeks: [
                        { start: '2026-10-12', minutes: 90 },
                        { start: '2026-10-19', minutes: 30 },
                    ],
                }),
                sub('Long runs', {
                    weeks: [{ start: '2026-10-19', minutes: 120 }],
                    counts: [{ start: '2026-10-19', count: 2 }],
                }),
            ],
        } as Task;
        const [node] = buildGoals([goal], 'goal');
        expect(weeksUnder(node, false)).toEqual([
            { start: '2026-10-12', amount: 90 },
            { start: '2026-10-19', amount: 150 },
        ]);
        expect(weeksUnder(node, true)).toEqual([{ start: '2026-10-19', amount: 2 }]);
    });
});
