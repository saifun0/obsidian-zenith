import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { buildGoals, goalSteps, habitsUnder } from '../src/modules/tasks/services/goalTree';
import { parseHoursChange } from '../src/modules/tasks/services/taskHours';
import { nestUnder, insertUnder } from '../src/modules/tasks/services/taskMove';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * The goals, finished: time taken off as well as put in, a goal that asks for
 * hours itself, its habits in the day's list, and a step moved under another.
 */

let line = 0;
const task = (title: string, over: Partial<Task> = {}): Task =>
    ({
        id: `Goals.md:${++line}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'Goals.md',
        lineNumber: line,
        ...over,
    }) as Task;
const sub = (title: string, over: Partial<SubTask> = {}): SubTask => ({
    title,
    status: 'todo',
    completed: false,
    lineNumber: ++line,
    subtasks: [],
    ...over,
});

/** A vault of files, with `read` and `process` working on them. */
function fakeApp(files: Record<string, string>) {
    const store = { ...files };
    const handles = new Map<string, TFile>();
    for (const path of Object.keys(files)) {
        const file = new TFile();
        file.path = path;
        handles.set(path, file);
    }
    const app = {
        vault: {
            getAbstractFileByPath: (p: string) => handles.get(p) ?? null,
            read: (f: TFile) => Promise.resolve(store[f.path]),
            process: (f: TFile, fn: (data: string) => string) => {
                store[f.path] = fn(store[f.path]);
                return Promise.resolve(store[f.path]);
            },
        },
    } as unknown as App;
    return { app, store };
}

describe('taking time off', () => {
    it('reads a minus, a phone’s too, as time to take off', () => {
        expect(parseHoursChange('-1,5')).toBe(-90);
        expect(parseHoursChange('−1h30')).toBe(-90);
        expect(parseHoursChange('– 2')).toBe(-120);
        expect(parseHoursChange('+2')).toBe(120);
        expect(parseHoursChange('1')).toBe(60);
        expect(parseHoursChange('-')).toBeUndefined();
    });

    it('takes it off the total and the week, never below nothing', async () => {
        const { app, store } = fakeApp({
            'Goals.md': ['- [ ] C++ 🎯 20h/w ⏱ 10h', '    - 2026-10-12 ⏱ 10h'].join('\n'),
        });
        const writer = new TaskWriter(app);
        expect(await writer.addSpentInFile('Goals.md', 1, -240, 'C++', '2026-10-12')).toBe(true);
        expect(store['Goals.md'].split('\n')).toEqual([
            '- [ ] C++ 🎯 20h/w ⏱ 6h',
            '    - 2026-10-12 ⏱ 6h',
        ]);
        await writer.addSpentInFile('Goals.md', 1, -600, 'C++', '2026-10-12');
        // Nothing left: the ⏱ and the week's line both go.
        expect(store['Goals.md']).toBe('- [ ] C++ 🎯 20h/w');
    });
});

describe('a goal that asks for hours', () => {
    const goal = () =>
        task('Learn C++', {
            tags: ['goal'],
            target: { amount: 18000, weekly: false },
            subtasks: [
                sub('Study', {
                    target: { amount: 1200, weekly: true },
                    spentMinutes: 5400,
                    weeks: [{ start: '2026-10-12', minutes: 600 }],
                }),
                sub('Book', { spentMinutes: 1800, status: 'done' }),
            ],
        });

    it('is as far along as all the time put in under it, the habits’ too', () => {
        const [tree] = buildGoals([goal()], 'goal');
        expect(tree.hoursUnder).toBe(7200);
        expect(tree.progress).toBe(0.4);
        expect(tree.ready).toBe(false);
    });

    it('can be closed once those hours are in', () => {
        const big = goal();
        big.target = { amount: 6000, weekly: false };
        expect(buildGoals([big], 'goal')[0].ready).toBe(true);
    });

    it('names the habits under it, for the week its line does not count', () => {
        const [tree] = buildGoals([goal()], 'goal');
        expect(habitsUnder(tree).map((h) => h.title)).toEqual(['Study']);
    });
});

describe('a goal’s habits in the day’s list', () => {
    const goal = (minutes: number) =>
        task('Learn C++', {
            tags: ['goal'],
            subtasks: [
                sub('Study', {
                    target: { amount: 1200, weekly: true },
                    weeks: [{ start: '2026-10-12', minutes }],
                }),
            ],
        });
    const now = { today: '2026-10-18', weekStart: 'mon' as const };

    it('stand under today until the week’s hours are in', () => {
        const rows = goalSteps([goal(600)], 'goal', now);
        expect(rows.map((r) => [r.title, r.dueDate, r.goal, r.habit])).toEqual([
            ['Study', '2026-10-18', 'Learn C++', true],
        ]);
        expect(goalSteps([goal(1200)], 'goal', now)).toEqual([]);
    });

    it('are not listed without a week to read them by', () => {
        expect(goalSteps([goal(600)], 'goal')).toEqual([]);
    });
});

describe('moving a step under another', () => {
    const note = [
        '- [ ] Learn C++ #goal',
        '\t- [ ] Basics',
        '\t\t- [ ] Pointers',
        '\t\t\t- [ ] Smart pointers',
        '\t- [ ] Projects',
        '\t\t- [ ] A small game',
    ];

    it('puts it, with what is under it, last under the other, a step in', () => {
        // "Pointers" (line 3) under "Projects" (line 5).
        expect(nestUnder(note, 3, 5)).toEqual([
            '- [ ] Learn C++ #goal',
            '\t- [ ] Basics',
            '\t- [ ] Projects',
            '\t\t- [ ] A small game',
            '\t\t- [ ] Pointers',
            '\t\t\t- [ ] Smart pointers',
        ]);
        // And back up, above where it was.
        expect(nestUnder(note, 6, 2)).toEqual([
            '- [ ] Learn C++ #goal',
            '\t- [ ] Basics',
            '\t\t- [ ] Pointers',
            '\t\t\t- [ ] Smart pointers',
            '\t\t- [ ] A small game',
            '\t- [ ] Projects',
        ]);
    });

    it('does not put a step under itself or under what is under it', () => {
        expect(nestUnder(note, 3, 3)).toBeNull();
        expect(nestUnder(note, 3, 4)).toBeNull();
    });

    it('indents a first child the way its parent is indented', () => {
        const spaces = ['- [ ] Goal', '    - [ ] Stage', '- [ ] Loose'];
        expect(insertUnder(spaces, ['- [ ] Step'], 2)).toEqual([
            '- [ ] Goal',
            '    - [ ] Stage',
            '        - [ ] Step',
            '- [ ] Loose',
        ]);
    });

    it('moves across notes: into the other first, then out of its own', async () => {
        const { app, store } = fakeApp({
            'Goals.md': ['- [ ] Learn C++ #goal', '\t- [ ] Projects'].join('\n'),
            'Inbox.md': ['- [ ] Make a game', '\t- [ ] Pick a library', '- [ ] Milk'].join('\n'),
        });
        const ok = await new TaskWriter(app).moveUnderInFile(
            { filePath: 'Inbox.md', lineNumber: 1, title: 'Make a game' },
            { filePath: 'Goals.md', lineNumber: 2, title: 'Projects' }
        );
        expect(ok).toBe(true);
        expect(store['Goals.md'].split('\n')).toEqual([
            '- [ ] Learn C++ #goal',
            '\t- [ ] Projects',
            '\t\t- [ ] Make a game',
            '\t\t\t- [ ] Pick a library',
        ]);
        expect(store['Inbox.md']).toBe('- [ ] Milk');
    });

    it('leaves both notes alone when a line is not what was shown', async () => {
        const { app, store } = fakeApp({
            'Goals.md': '- [ ] Something else',
            'Inbox.md': '- [ ] Make a game',
        });
        const ok = await new TaskWriter(app).moveUnderInFile(
            { filePath: 'Inbox.md', lineNumber: 1, title: 'Make a game' },
            { filePath: 'Goals.md', lineNumber: 1, title: 'Projects' }
        );
        expect(ok).toBe(false);
        expect(store).toEqual({
            'Goals.md': '- [ ] Something else',
            'Inbox.md': '- [ ] Make a game',
        });
    });
});
