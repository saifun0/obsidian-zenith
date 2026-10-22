import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { applyTaskPatch, parseTaskText, readTarget } from '../src/modules/tasks/services/taskFormat';
import { parseDetails, writeDetails } from '../src/modules/tasks/services/taskDetails';
import {
    amountTowards,
    parseCountChange,
    quotaInputText,
    quotaReached,
    readQuotaInput,
    weekAmounts,
} from '../src/modules/tasks/services/taskHours';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import { buildGoals, goalSteps } from '../src/modules/tasks/services/goalTree';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * Tasks closed by times rather than a tick: `🎯 12` books in all, `🎯 3/w`
 * workouts a week. The times are the `🔢` they keep; a weekly one also keeps
 * each week's on a line under it, as the hours do.
 */

const DEFAULTS = { priority: 'none' as const, tags: [] };

describe('a count on a line', () => {
    it('is a bare number after the 🎯, and its tally the 🔢', () => {
        expect(parseTaskText('Read books 🎯 12 🔢 5', DEFAULTS)).toMatchObject({
            title: 'Read books',
            target: { amount: 12, weekly: false, count: true },
            tally: 5,
        });
        expect(readTarget('3/w')).toEqual({ amount: 3, weekly: true, count: true });
        // Hours still say so.
        expect(readTarget('20h/w')).toEqual({ amount: 1200, weekly: true });
        expect(readTarget('0')).toBeUndefined();
    });

    it('is written in its place, before the time spent', () => {
        expect(
            applyTaskPatch('Gym ⏱ 1h', {
                target: { amount: 3, weekly: true, count: true },
                tally: 2,
            })
        ).toBe('Gym 🎯 3/w 🔢 2 ⏱ 1h');
        expect(applyTaskPatch('Read 🎯 12 🔢 5', { tally: null })).toBe('Read 🎯 12');
        // The same count, written the same way: left as it is.
        expect(
            applyTaskPatch('Read 🎯 12', { target: { amount: 12, weekly: false, count: true } })
        ).toBe('Read 🎯 12');
    });

    it('keeps its weeks apart from the hours', () => {
        const details = parseDetails(['A note', '- 2026-10-12 🔢 2', '- 2026-10-12 ⏱ 1h']);
        expect(details.counts).toEqual([{ start: '2026-10-12', count: 2 }]);
        expect(details.weeks).toEqual([{ start: '2026-10-12', minutes: 60 }]);
        expect(details.description).toBe('A note');
    });

    it('keeps the weeks a save leaves out', () => {
        const lines = ['- [ ] Gym 🎯 3/w 🔢 2', '    - 2026-10-12 🔢 2'];
        expect(writeDetails(lines, 0, { description: 'Legs', attachments: [] })).toEqual([
            '- [ ] Gym 🎯 3/w 🔢 2',
            '    Legs',
            '    - 2026-10-12 🔢 2',
        ]);
    });
});

describe('how far a count has got', () => {
    const weekly = {
        target: { amount: 3, weekly: true, count: true },
        tally: 7,
        counts: [
            { start: '2026-10-12', count: 3 },
            { start: '2026-10-19', count: 1 },
        ],
    };
    const inAll = (tally: number) => ({
        target: { amount: 12, weekly: false, count: true },
        tally,
    });

    it('is this week for a weekly one, and the whole tally otherwise', () => {
        expect(amountTowards(weekly, '2026-10-21', 'mon')).toBe(1);
        expect(amountTowards(inAll(5), '2026-10-21', 'mon')).toBe(5);
        expect(weekAmounts(weekly)).toEqual([
            { start: '2026-10-12', amount: 3 },
            { start: '2026-10-19', amount: 1 },
        ]);
    });

    it('can be closed once the times in all are in, never for a week', () => {
        expect(quotaReached(inAll(12))).toBe(true);
        expect(quotaReached(inAll(11))).toBe(false);
        expect(quotaReached({ ...weekly, tally: 99 })).toBe(false);
    });

    it('reads what its field is told', () => {
        expect(parseCountChange('3')).toBe(3);
        expect(parseCountChange('+2')).toBe(2);
        expect(parseCountChange('−1')).toBe(-1);
        expect(parseCountChange('-1')).toBe(-1);
        expect(parseCountChange('1.5')).toBeUndefined();
        expect(parseCountChange('0')).toBeUndefined();
    });

    it('is set in the editor as a whole number, or as hours', () => {
        expect(readQuotaInput('12', true, false)).toEqual({
            amount: 12,
            weekly: false,
            count: true,
        });
        expect(readQuotaInput('12', false, true)).toEqual({ amount: 720, weekly: true });
        expect(readQuotaInput('1,5', true, false)).toBeUndefined();
        expect(quotaInputText({ amount: 12, weekly: false, count: true })).toBe('12');
        expect(quotaInputText({ amount: 90, weekly: false })).toBe('1.5');
    });
});

/** A vault of one file, with `process` applying the transform. */
function fakeApp(path: string, content: string) {
    const file = new TFile();
    file.path = path;
    const store = { text: content };
    const app = {
        vault: {
            getAbstractFileByPath: (p: string) => (p === path ? file : null),
            process: (_f: unknown, fn: (data: string) => string) => {
                store.text = fn(store.text);
                return Promise.resolve(store.text);
            },
        },
    } as unknown as App;
    return { app, store };
}

describe('counting', () => {
    it('adds to the 🔢, and to this week’s line for a weekly task', async () => {
        const { app, store } = fakeApp(
            'G.md',
            ['- [ ] Gym 🎯 3/w 🔢 3', '    - 2026-10-12 🔢 3'].join('\n')
        );
        const writer = new TaskWriter(app);
        expect(await writer.addCountInFile('G.md', 1, 1, 'Gym', '2026-10-19')).toBe(true);
        expect(await writer.addCountInFile('G.md', 1, 1, 'Gym', '2026-10-19')).toBe(true);
        expect(store.text.split('\n')).toEqual([
            '- [ ] Gym 🎯 3/w 🔢 5',
            '    - 2026-10-12 🔢 3',
            '    - 2026-10-19 🔢 2',
        ]);
    });

    it('takes back, never under none, and drops a week left at nothing', async () => {
        const { app, store } = fakeApp(
            'G.md',
            ['- [ ] Gym 🎯 3/w 🔢 1', '    - 2026-10-19 🔢 1'].join('\n')
        );
        await new TaskWriter(app).addCountInFile('G.md', 1, -2, 'Gym', '2026-10-19');
        expect(store.text).toBe('- [ ] Gym 🎯 3/w');
    });

    it('keeps no weeks for a count in all, and checks the title', async () => {
        const { app, store } = fakeApp('B.md', '- [ ] Read 🎯 12');
        await new TaskWriter(app).addCountInFile('B.md', 1, 1, 'Read', '2026-10-19');
        expect(store.text).toBe('- [ ] Read 🎯 12 🔢 1');
        expect(await new TaskWriter(app).addCountInFile('B.md', 1, 1, 'Something else')).toBe(
            false
        );
    });

    it('leaves a count’s weeks to the 🔢 when the timer stops on it', async () => {
        const { app, store } = fakeApp('G.md', '- [ ] Gym 🎯 3/w');
        await new TaskWriter(app).setSpentInFile('G.md', 1, 60, '2026-10-19');
        expect(store.text).toBe('- [ ] Gym 🎯 3/w ⏱ 1h');
    });
});

// ── In the goals' tree ─────────────────────────────────

function sub(title: string, extra: Partial<SubTask> = {}): SubTask {
    return { title, status: 'todo', lineNumber: 2, subtasks: [], ...extra } as SubTask;
}

function goal(extra: Partial<Task>): Task {
    return {
        id: 'g',
        title: 'Read more',
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: ['goal'],
        filePath: 'Goals.md',
        lineNumber: 1,
        subtasks: [],
        createdAt: 0,
        ...extra,
    } as Task;
}

describe('a count in the goals’ tree', () => {
    it('measures a goal that asks for times by every time under it', () => {
        const [tree] = buildGoals(
            [
                goal({
                    target: { amount: 12, weekly: false, count: true },
                    tally: 2,
                    subtasks: [sub('Novels', { tally: 4 }), sub('Essays', { tally: 3 })],
                }),
            ],
            'goal'
        );
        expect(tree.countUnder).toBe(9);
        expect(tree.progress).toBe(0.75);
        expect(tree.ready).toBe(false);
    });

    it('lists a weekly count under today until its week is done', () => {
        const now = { today: '2026-10-21', weekStart: 'mon' as const };
        const gym = (count: number) =>
            goal({
                subtasks: [
                    sub('Gym', {
                        target: { amount: 3, weekly: true, count: true },
                        counts: [{ start: '2026-10-19', count }],
                    }),
                ],
            });
        expect(goalSteps([gym(2)], 'goal', now).map((r) => [r.title, r.habit])).toEqual([
            ['Gym', true],
        ]);
        expect(goalSteps([gym(3)], 'goal', now)).toEqual([]);
    });
});
