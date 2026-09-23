import { describe, it, expect } from 'vitest';
import {
    digestCounts,
    digestEvents,
    findTask,
    taskEvents,
} from '../src/modules/tasks/services/taskReminders';
import { reminderPluginEnabled } from '../src/modules/tasks/components/ReminderPluginWarning';
import type { Task } from '../src/store/taskSlice';
import type { App } from 'obsidian';

function task(over: Partial<Task>): Task {
    return {
        id: 'x',
        title: 'Call mom',
        status: 'todo',
        completed: false,
        priority: 'medium',
        tags: [],
        subtasks: [],
        filePath: 'Day.md',
        lineNumber: 3,
        createdAt: '2026-09-01',
        ...over,
    } as Task;
}

const ms = (iso: string) => new Date(iso).getTime();

describe('taskEvents', () => {
    const tasks = [
        task({ title: 'Call mom', dueDate: '2026-09-24', dueTime: '18:00' }),
        task({ title: 'No time', dueDate: '2026-09-24' }),
        task({
            title: 'Done already',
            dueDate: '2026-09-24',
            dueTime: '09:00',
            status: 'done',
            completed: true,
        }),
        task({ title: 'Given up', dueDate: '2026-09-24', dueTime: '10:00', status: 'cancelled' }),
        task({ title: 'Tomorrow', dueDate: '2026-09-25', dueTime: '08:00' }),
    ];

    it('reminds of open tasks with a time, and only those', () => {
        const events = taskEvents(tasks, ms('2026-09-24T00:00'), ms('2026-09-25T00:00'), 0);
        expect(events.map((e) => e.title)).toEqual(['Call mom']);
        expect(events[0].at).toBe(ms('2026-09-24T18:00'));
    });

    it('comes the chosen number of minutes early', () => {
        const [event] = taskEvents(tasks, ms('2026-09-24T00:00'), ms('2026-09-25T00:00'), 15);
        expect(event.at).toBe(ms('2026-09-24T17:45'));
    });

    it('keys a reminder by its occurrence, so moving the task makes a new one', () => {
        const [a] = taskEvents(tasks, ms('2026-09-24T00:00'), ms('2026-09-25T00:00'), 0);
        const moved = taskEvents(
            [task({ title: 'Call mom', dueDate: '2026-09-24', dueTime: '19:00' })],
            ms('2026-09-24T00:00'),
            ms('2026-09-25T00:00'),
            0
        )[0];
        expect(a.key).not.toBe(moved.key);
    });

    it('keeps to the window it is asked about', () => {
        const events = taskEvents(tasks, ms('2026-09-24T18:00'), ms('2026-09-25T08:00'), 0);
        expect(events.map((e) => e.title)).toEqual(['Call mom']);
    });
});

describe('digestEvents', () => {
    it('one a morning, at the chosen hour', () => {
        const events = digestEvents(ms('2026-09-24T00:00'), ms('2026-09-26T00:00'), 8);
        expect(events.map((e) => [e.date, e.at])).toEqual([
            ['2026-09-24', ms('2026-09-24T08:00')],
            ['2026-09-25', ms('2026-09-25T08:00')],
        ]);
    });

    it('none when switched off', () => {
        expect(digestEvents(ms('2026-09-24T00:00'), ms('2026-09-26T00:00'), -1)).toEqual([]);
    });

    it('not today’s if the hour has passed when asked', () => {
        const events = digestEvents(ms('2026-09-24T09:00'), ms('2026-09-25T09:00'), 8);
        expect(events.map((e) => e.date)).toEqual(['2026-09-25']);
    });
});

describe('digestCounts', () => {
    it('counts the day’s tasks without a time, and what is overdue', () => {
        const counts = digestCounts(
            [
                task({ dueDate: '2026-09-24' }),
                task({ dueDate: '2026-09-24' }),
                task({ dueDate: '2026-09-24', dueTime: '18:00' }),
                task({ dueDate: '2026-09-20' }),
                task({ dueDate: '2026-09-20', status: 'done', completed: true }),
                task({ dueDate: '2026-09-30' }),
                task({}),
            ],
            '2026-09-24'
        );
        expect(counts).toEqual({ today: 2, overdue: 1 });
    });
});

describe('findTask', () => {
    const tasks = [
        task({ title: 'Call mom', dueDate: '2026-09-24', dueTime: '18:00', lineNumber: 7 }),
    ];

    it('finds the task as the notes have it now', () => {
        expect(
            findTask(tasks, {
                filePath: 'Day.md',
                title: 'Call mom',
                date: '2026-09-24',
                time: '18:00',
            })?.lineNumber
        ).toBe(7);
    });

    it('finds nothing once it has moved, been renamed or been done', () => {
        expect(
            findTask(tasks, { filePath: 'Day.md', title: 'Call mom', time: '19:00' })
        ).toBeUndefined();
        expect(findTask(tasks, { filePath: 'Day.md', title: 'Call dad' })).toBeUndefined();
        expect(
            findTask([{ ...tasks[0], status: 'done', completed: true }], {
                filePath: 'Day.md',
                title: 'Call mom',
            })
        ).toBeUndefined();
    });
});

describe('reminderPluginEnabled', () => {
    const appWith = (ids: string[]) =>
        ({ plugins: { enabledPlugins: new Set(ids) } }) as unknown as App;

    it('notices the Reminder plugin under either of its ids', () => {
        expect(reminderPluginEnabled(appWith(['obsidian-reminder-plugin']))).toBe(true);
        expect(reminderPluginEnabled(appWith(['obsidian-reminder']))).toBe(true);
        expect(reminderPluginEnabled(appWith(['dataview']))).toBe(false);
        expect(reminderPluginEnabled({} as App)).toBe(false);
    });
});
