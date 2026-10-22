import { describe, expect, it } from 'vitest';
import { buildGoals, quietWeeks } from '../src/modules/tasks/services/goalTree';
import { buildTaskBody } from '../src/modules/tasks/services/taskFormat';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * A goal nothing has been done towards for a fortnight says so: "quiet for 3
 * weeks". What counts as done is what the note says happened — a step closed
 * or given up, one written, a week of hours or times put in.
 */

const sub = (title: string, extra: Partial<SubTask> = {}): SubTask =>
    ({ title, status: 'todo', lineNumber: 2, subtasks: [], ...extra }) as SubTask;

function goal(extra: Partial<Task> = {}): Task {
    return {
        id: 'g',
        title: 'Run a half marathon',
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: ['goal'],
        filePath: 'Goals.md',
        lineNumber: 1,
        subtasks: [],
        createdAt: '2026-01-01T00:00:00Z',
        ...extra,
    } as Task;
}

const tree = (task: Task) => buildGoals([task], 'goal')[0];

describe('when a goal last moved', () => {
    it('is the latest a step was closed, given up or written', () => {
        const node = tree(
            goal({
                createdDate: '2026-09-01',
                subtasks: [
                    sub('Run 10 km', { status: 'done', doneDate: '2026-10-02' }),
                    sub('Swim', { status: 'cancelled', cancelledDate: '2026-09-20' }),
                    sub('Run 12 km', { createdDate: '2026-10-05' }),
                ],
            })
        );
        expect(node.lastMoved).toBe('2026-10-05');
    });

    it('reads a week of hours or times as that week’s last day', () => {
        const node = tree(
            goal({
                subtasks: [
                    sub('Easy runs', { weeks: [{ start: '2026-10-05', minutes: 90 }] }),
                    sub('Gym', { counts: [{ start: '2026-09-28', count: 2 }] }),
                ],
            })
        );
        expect(node.lastMoved).toBe('2026-10-11');
    });

    it('is nothing when the note says nothing of it', () => {
        expect(tree(goal({ subtasks: [sub('Run 10 km')] })).lastMoved).toBeUndefined();
    });
});

describe('a quiet goal', () => {
    const moved = (day: string) => tree(goal({ createdDate: day }));

    it('says so after a fortnight, in whole weeks', () => {
        expect(quietWeeks(moved('2026-10-09'), '2026-10-22')).toBeNull();
        expect(quietWeeks(moved('2026-10-08'), '2026-10-22')).toBe(2);
        expect(quietWeeks(moved('2026-10-01'), '2026-10-22')).toBe(3);
    });

    it('says nothing when closed, or when nothing says when it moved', () => {
        const done = tree(goal({ createdDate: '2026-01-01', status: 'done' }));
        expect(quietWeeks(done, '2026-10-22')).toBeNull();
        expect(quietWeeks(tree(goal()), '2026-10-22')).toBeNull();
    });

    it('takes a week still running as moving now', () => {
        const node = tree(
            goal({ subtasks: [sub('Gym', { counts: [{ start: '2026-10-19', count: 1 }] })] })
        );
        expect(quietWeeks(node, '2026-10-22')).toBeNull();
    });
});

describe('a new goal or step', () => {
    it('is written with the day, for its quiet to count from', () => {
        expect(
            buildTaskBody({
                title: 'Read',
                priority: 'none',
                tags: ['goal'],
                createdDate: '2026-10-22',
            })
        ).toBe('Read ➕ 2026-10-22 #goal');
    });
});
