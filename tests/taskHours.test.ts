import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
    applyTaskPatch,
    parseTaskText,
    readTarget,
} from '../src/modules/tasks/services/taskFormat';
import { addToWeek, parseDetails, writeDetails } from '../src/modules/tasks/services/taskDetails';
import {
    formatHours,
    quotaReached,
    quotaShare,
    minutesTowards,
    parseHoursInput,
} from '../src/modules/tasks/services/taskHours';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';

/**
 * Tasks closed by hours rather than a tick: `🎯 100h` in all, `🎯 20h/w` a
 * week. The time is the `⏱` they keep; a weekly one also keeps each week's
 * hours on a line under it, so a new week starts from nothing.
 */

const DEFAULTS = { priority: 'none' as const, tags: [] };

describe('the 🎯 on a line', () => {
    it('reads hours in all and hours a week, and leaves the title alone', () => {
        expect(parseTaskText('Learn English 🎯 20h/w ⏱ 7h30m', DEFAULTS)).toMatchObject({
            title: 'Learn English',
            target: { amount: 1200, weekly: true },
            spentMinutes: 450,
        });
        expect(parseTaskText('Arabic 🎯 100h', DEFAULTS).target).toEqual({
            amount: 6000,
            weekly: false,
        });
        expect(readTarget('1h30m/week')).toEqual({ amount: 90, weekly: true });
        expect(readTarget('soon')).toBeUndefined();
    });

    it('is written, changed and taken off like any marker', () => {
        expect(applyTaskPatch('Learn English', { target: { amount: 1200, weekly: true } })).toBe(
            'Learn English 🎯 20h/w'
        );
        expect(
            applyTaskPatch('Arabic 🎯 20h/w ⏱ 2h', { target: { amount: 6000, weekly: false } })
        ).toBe('Arabic 🎯 100h ⏱ 2h');
        expect(applyTaskPatch('Arabic 🎯 100h', { target: null })).toBe('Arabic');
        // The same hours, written the same way: left as they are.
        expect(applyTaskPatch('Arabic 🎯 100h', { target: { amount: 6000, weekly: false } })).toBe(
            'Arabic 🎯 100h'
        );
    });
});

describe('the weeks under a task', () => {
    it('are read apart from the note and the attachments', () => {
        const details = parseDetails([
            'Grammar first',
            '- 2026-10-12 ⏱ 18h',
            '- 2026-10-19 ⏱ 7h30m',
            '[[Plan]]',
        ]);
        expect(details.description).toBe('Grammar first');
        expect(details.attachments).toHaveLength(1);
        expect(details.weeks).toEqual([
            { start: '2026-10-12', minutes: 1080 },
            { start: '2026-10-19', minutes: 450 },
        ]);
        expect(parseDetails(['Just a note']).weeks).toBeUndefined();
    });

    it('are kept by a save that does not deal in them', () => {
        const lines = [
            '- [ ] Learn English 🎯 20h/w',
            '    Old note',
            '    - 2026-10-12 ⏱ 18h',
            '- [ ] Next',
        ];
        const out = writeDetails(lines, 0, { description: 'New note', attachments: [] });
        expect(out).toEqual([
            '- [ ] Learn English 🎯 20h/w',
            '    New note',
            '    - 2026-10-12 ⏱ 18h',
            '- [ ] Next',
        ]);
    });

    it('add up within a week, and start a new line for a new one', () => {
        const weeks = addToWeek([{ start: '2026-10-12', minutes: 60 }], '2026-10-12', 30);
        expect(weeks).toEqual([{ start: '2026-10-12', minutes: 90 }]);
        expect(addToWeek(weeks, '2026-10-19', 45)).toEqual([
            { start: '2026-10-12', minutes: 90 },
            { start: '2026-10-19', minutes: 45 },
        ]);
    });
});

describe('how far a task has got', () => {
    const weekly = {
        target: { amount: 1200, weekly: true },
        spentMinutes: 1530,
        weeks: [
            { start: '2026-10-12', minutes: 1080 },
            { start: '2026-10-19', minutes: 450 },
        ],
    };

    it('counts this week for a weekly one, and everything for one in all', () => {
        expect(minutesTowards(weekly, '2026-10-21', 'mon')).toBe(450);
        expect(quotaShare(weekly, '2026-10-21', 'mon')).toBe(0.375);
        // A new week, nothing put in yet.
        expect(minutesTowards(weekly, '2026-10-26', 'mon')).toBe(0);
        const all = { target: { amount: 6000, weekly: false }, spentMinutes: 3000 };
        expect(minutesTowards(all, '2026-10-21', 'mon')).toBe(3000);
        expect(quotaShare(all, '2026-10-21', 'mon')).toBe(0.5);
    });

    it('can be closed once the hours in all are in — a week’s never ends it', () => {
        expect(quotaReached({ target: { amount: 600, weekly: false }, spentMinutes: 600 })).toBe(
            true
        );
        expect(quotaReached({ target: { amount: 600, weekly: false }, spentMinutes: 599 })).toBe(
            false
        );
        expect(quotaReached({ ...weekly, spentMinutes: 99999 })).toBe(false);
    });
});

describe('time typed into the “+” field', () => {
    it('is hours when it is a bare number, with a comma or a point', () => {
        expect(parseHoursInput('1,5')).toBe(90);
        expect(parseHoursInput('1.5')).toBe(90);
        expect(parseHoursInput('2')).toBe(120);
    });

    it('says hours and minutes outright, in English or Russian', () => {
        expect(parseHoursInput('1h30')).toBe(90);
        expect(parseHoursInput('90m')).toBe(90);
        expect(parseHoursInput('1ч 30м')).toBe(90);
        expect(parseHoursInput('45 мин')).toBe(45);
    });

    it('is nothing when it says nothing', () => {
        expect(parseHoursInput('')).toBeUndefined();
        expect(parseHoursInput('soon')).toBeUndefined();
        expect(parseHoursInput('0')).toBeUndefined();
    });

    it('is shown back as hours, to a tenth', () => {
        expect(formatHours(450)).toBe('7.5');
        expect(formatHours(1200)).toBe('20');
        expect(formatHours(450, 'ru')).toBe('7,5');
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

describe('putting time in', () => {
    it('adds to the ⏱, and to this week’s line for a weekly task', async () => {
        const { app, store } = fakeApp(
            'Goals.md',
            ['- [ ] Learn English 🎯 20h/w ⏱ 18h', '    - 2026-10-12 ⏱ 18h'].join('\n')
        );
        const writer = new TaskWriter(app);
        expect(await writer.addSpentInFile('Goals.md', 1, 90, 'Learn English', '2026-10-19')).toBe(
            true
        );
        expect(await writer.addSpentInFile('Goals.md', 1, 30, 'Learn English', '2026-10-19')).toBe(
            true
        );
        expect(store.text.split('\n')).toEqual([
            '- [ ] Learn English 🎯 20h/w ⏱ 20h',
            '    - 2026-10-12 ⏱ 18h',
            '    - 2026-10-19 ⏱ 2h',
        ]);
    });

    it('keeps the weeks of hours in all too: they are when it was worked on', async () => {
        const { app, store } = fakeApp('A.md', '- [ ] Arabic 🎯 100h');
        await new TaskWriter(app).addSpentInFile('A.md', 1, 60, 'Arabic', '2026-10-19');
        expect(store.text).toBe('- [ ] Arabic 🎯 100h ⏱ 1h\n    - 2026-10-19 ⏱ 1h');
    });

    it('keeps no weeks for a task that asks for nothing', async () => {
        const { app, store } = fakeApp('A.md', '- [ ] Arabic');
        await new TaskWriter(app).addSpentInFile('A.md', 1, 60, 'Arabic', '2026-10-19');
        expect(store.text).toBe('- [ ] Arabic ⏱ 1h');
    });

    it('refuses a line that is not the task any more', async () => {
        const { app, store } = fakeApp('A.md', '- [ ] Something else');
        expect(await new TaskWriter(app).addSpentInFile('A.md', 1, 60, 'Arabic')).toBe(false);
        expect(store.text).toBe('- [ ] Something else');
    });

    it('gives the timer’s stop the same week line', async () => {
        const { app, store } = fakeApp('A.md', '- [ ] Learn English 🎯 20h/w ⏱ 1h');
        // The timer writes the new total: an hour and a half more.
        await new TaskWriter(app).setSpentInFile('A.md', 1, 150, '2026-10-19');
        expect(store.text.split('\n')).toEqual([
            '- [ ] Learn English 🎯 20h/w ⏱ 2h30m',
            '    - 2026-10-19 ⏱ 1h30m',
        ]);
    });
});

describe('a subtask written with fields', () => {
    it('takes a day read out of the words', async () => {
        const { app, store } = fakeApp('G.md', ['- [ ] Goal', '\t- [ ] Stage'].join('\n'));
        await new TaskWriter(app).addSubtaskInFile('G.md', 2, 'Run 14 km', {
            dueDate: '2026-10-20',
        });
        expect(store.text.split('\n')[2]).toBe('\t\t- [ ] Run 14 km 📅 2026-10-20');
    });
});
