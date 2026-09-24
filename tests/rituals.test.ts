import { describe, it, expect } from 'vitest';
import {
    doneToday,
    leftovers,
    overdueTasks,
    ritualEvents,
    ritualFor,
    todaysTasks,
    triagePatch,
} from '../src/modules/journal/services/rituals';
import type { Task } from '../src/store/taskSlice';

const TODAY = '2026-09-24';

function task(over: Partial<Task>): Task {
    return {
        id: over.title ?? 'x',
        title: 'x',
        status: 'todo',
        completed: false,
        priority: 'medium',
        tags: [],
        subtasks: [],
        filePath: 'Tasks.md',
        lineNumber: 1,
        createdAt: '2026-09-01',
        ...over,
    } as Task;
}

const TASKS = [
    task({ title: 'due today', dueDate: TODAY }),
    task({ title: 'planned today', scheduledDate: TODAY }),
    task({ title: 'captured', filePath: 'Journal/2026-09-24.md' }),
    task({ title: 'late', dueDate: '2026-09-20' }),
    task({ title: 'planned before', scheduledDate: '2026-09-22' }),
    task({ title: 'tomorrow', dueDate: '2026-09-25' }),
    task({ title: 'done today', status: 'done', completed: true, doneDate: TODAY, dueDate: TODAY }),
    task({ title: 'dropped', status: 'cancelled', dueDate: '2026-09-20' }),
];
const titles = (list: Task[]) => list.map((t) => t.title);

describe('the morning', () => {
    it('lists today’s open tasks — dated today or written into today’s note', () => {
        expect(titles(todaysTasks(TASKS, TODAY, 'Journal/2026-09-24.md'))).toEqual([
            'due today',
            'planned today',
            'captured',
        ]);
    });

    it('lists what is left over from before, and nothing closed', () => {
        expect(titles(overdueTasks(TASKS, TODAY))).toEqual(['late', 'planned before']);
    });
});

describe('the evening', () => {
    it('shows what got done today', () => {
        expect(titles(doneToday(TASKS, TODAY))).toEqual(['done today']);
    });

    it('offers today’s and earlier open tasks, each once', () => {
        expect(titles(leftovers(TASKS, TODAY, 'Journal/2026-09-24.md'))).toEqual([
            'due today',
            'planned today',
            'captured',
            'late',
            'planned before',
        ]);
    });

    it('moves a task by its ⏳ date in its own line — today or tomorrow', () => {
        expect(triagePatch('today', TODAY)).toEqual({ scheduledDate: TODAY });
        expect(triagePatch('postpone', TODAY)).toEqual({ scheduledDate: '2026-09-25' });
    });
});

describe('ritualFor', () => {
    it('is the morning until the afternoon, the evening after', () => {
        expect(ritualFor(7)).toBe('morning');
        expect(ritualFor(14)).toBe('morning');
        expect(ritualFor(15)).toBe('evening');
    });
});

describe('ritualEvents', () => {
    const at = (iso: string) => new Date(iso).getTime();

    it('one reminder each morning and evening, at the chosen hours', () => {
        const events = ritualEvents(at('2026-09-24T00:00'), at('2026-09-25T00:00'), 8, 21);
        expect(events.map((e) => [e.kind, e.at])).toEqual([
            ['morning', at('2026-09-24T08:00')],
            ['evening', at('2026-09-24T21:00')],
        ]);
        expect(events[0].key).toBe('ritual:morning:2026-09-24');
    });

    it('leaves out an hour set to none', () => {
        const events = ritualEvents(at('2026-09-24T00:00'), at('2026-09-25T00:00'), -1, 21);
        expect(events.map((e) => e.kind)).toEqual(['evening']);
    });
});
