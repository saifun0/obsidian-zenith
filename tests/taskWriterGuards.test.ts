import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import type { App } from 'obsidian';

/**
 * Writing into somebody else's note, by line number.
 *
 * Three methods address a line by number and then change it: delete removes it
 * and its indented block, update replaces it wholesale, set-status rewrites
 * its checkbox and stamps a date on it. A line number is only a fact about the
 * file as it was when it was last parsed — so if the note gained a line in the
 * meantime, all three reach for a different task, silently, in a file nobody
 * is looking at. There is no undo beyond Obsidian's file history.
 *
 * All three now require the title the caller was shown. These cases are about
 * that check: strict enough to refuse a moved line, loose enough not to refuse
 * a line that merely got a date stamped on it.
 */

/** A vault of exactly one file, with `process` applying the transform. */
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

const NOTE = [
    '# Day',
    '',
    '- [ ] Buy milk 📅 2026-09-20',
    '- [ ] Call the plumber',
    '\tRing after six, he never picks up before.',
    '- [ ] File the tax return',
    '',
].join('\n');

describe('deleting a task by line number', () => {
    it('removes the task and the lines that belong to it', async () => {
        const { app, store } = fakeApp('Day.md', NOTE);

        // Line 4 is "Call the plumber"; the indented line under it is its own.
        const ok = await new TaskWriter(app).deleteTaskInFile('Day.md', 4, 'Call the plumber');

        expect(ok).toBe(true);
        expect(store.text).not.toContain('Call the plumber');
        expect(store.text).not.toContain('Ring after six');
        expect(store.text).toContain('Buy milk');
        expect(store.text).toContain('File the tax return');
    });

    /**
     * The case this guard exists for: the note gained a line above, so the
     * number now points at the task below the one the user pressed.
     */
    it('refuses when the line has moved under it', async () => {
        const shifted = NOTE.replace('# Day', '# Day\n\nSomething typed in another pane.');
        const { app, store } = fakeApp('Day.md', shifted);
        const before = store.text;

        const ok = await new TaskWriter(app).deleteTaskInFile('Day.md', 4, 'Call the plumber');

        expect(ok).toBe(false);
        expect(store.text).toBe(before);
        expect(store.text).toContain('Call the plumber');
        // And, crucially, it did not take the neighbour instead.
        expect(store.text).toContain('Buy milk');
    });

    /**
     * And the case it must not break: a line whose METADATA changed is still
     * the same task. Refusing here would teach the user to ignore the refusal.
     */
    it('still deletes when only the metadata moved on', async () => {
        const stamped = NOTE.replace(
            '- [ ] Buy milk 📅 2026-09-20',
            '- [ ] Buy milk ⏫ 📅 2026-10-01'
        );
        const { app, store } = fakeApp('Day.md', stamped);

        const ok = await new TaskWriter(app).deleteTaskInFile('Day.md', 3, 'Buy milk');

        expect(ok).toBe(true);
        expect(store.text).not.toContain('Buy milk');
    });

    it('refuses a line that is no longer a task at all', async () => {
        const { app, store } = fakeApp('Day.md', NOTE);
        const before = store.text;

        // Line 1 is the heading.
        expect(await new TaskWriter(app).deleteTaskInFile('Day.md', 1, '# Day')).toBe(false);
        expect(store.text).toBe(before);
    });

    it('refuses a file it cannot find', async () => {
        const { app } = fakeApp('Day.md', NOTE);
        expect(await new TaskWriter(app).deleteTaskInFile('Gone.md', 3, 'Buy milk')).toBe(false);
    });
});

describe('marking a task done by line number', () => {
    it('stamps the completion date on the line it was told about', async () => {
        const { app, store } = fakeApp('Day.md', NOTE);

        const ok = await new TaskWriter(app).setStatusInFile(
            'Day.md',
            4,
            'done',
            'Call the plumber'
        );

        expect(ok).toBe(true);
        expect(store.text).toMatch(/- \[x\] Call the plumber ✅ \d{4}-\d{2}-\d{2}/);
        // And left the neighbour alone.
        expect(store.text).toContain('- [ ] Buy milk');
    });

    /**
     * The quiet version of the same accident as a wrong delete: a completion
     * date written into somebody's note for work they did not do. Worse for a
     * recurring line, where it also adds the next occurrence of a task that
     * was never theirs.
     */
    it('refuses when the line has moved under it', async () => {
        const shifted = NOTE.replace('# Day', '# Day\nSomething typed in another pane.');
        const { app, store } = fakeApp('Day.md', shifted);
        const before = store.text;

        const ok = await new TaskWriter(app).setStatusInFile(
            'Day.md',
            4,
            'done',
            'Call the plumber'
        );

        expect(ok).toBe(false);
        expect(store.text).toBe(before);
        expect(store.text).not.toContain('[x]');
    });

    it('still works when only the metadata moved on', async () => {
        const stamped = NOTE.replace(
            '- [ ] Buy milk 📅 2026-09-20',
            '- [ ] Buy milk ⏫ 📅 2026-10-01'
        );
        const { app, store } = fakeApp('Day.md', stamped);

        expect(await new TaskWriter(app).setStatusInFile('Day.md', 3, 'done', 'Buy milk')).toBe(
            true
        );
        expect(store.text).toContain('- [x] Buy milk');
    });
});

describe('rewriting a task by line number', () => {
    const input = { title: 'Call the plumber again' };

    it('replaces the line it was told about', async () => {
        const { app, store } = fakeApp('Day.md', NOTE);

        const ok = await new TaskWriter(app).updateTaskInFile(
            'Day.md',
            4,
            input,
            'Call the plumber'
        );

        expect(ok).toBe(true);
        expect(store.text).toContain('Call the plumber again');
        expect(store.text).toContain('- [ ] Buy milk');
    });

    /**
     * This is the one that destroys rather than corrupts: the neighbour's line
     * would be overwritten by the edited one, and nothing would be left of it.
     */
    it('refuses when the line has moved under it', async () => {
        const shifted = NOTE.replace('# Day', '# Day\nSomething typed in another pane.');
        const { app, store } = fakeApp('Day.md', shifted);
        const before = store.text;

        const ok = await new TaskWriter(app).updateTaskInFile(
            'Day.md',
            4,
            input,
            'Call the plumber'
        );

        expect(ok).toBe(false);
        expect(store.text).toBe(before);
        expect(store.text).toContain('- [ ] Buy milk 📅 2026-09-20');
    });

    /**
     * Renaming is the commonest edit there is, so the title checked has to be
     * the one the dialog opened with rather than the one being saved.
     */
    it('checks the title it opened with, not the one being written', async () => {
        const { app, store } = fakeApp('Day.md', NOTE);

        expect(
            await new TaskWriter(app).updateTaskInFile('Day.md', 4, input, 'Call the plumber')
        ).toBe(true);
        expect(store.text).not.toContain('- [ ] Call the plumber\n');
        expect(store.text).toContain('Call the plumber again');
    });
});

/**
 * What an edit leaves on the line.
 *
 * Every write used to rebuild the line from the fields this plugin reads, so
 * whatever it did not read went on the first save — `➕` from every task, and
 * from a drop into "Today" the hour, the time spent and the completion stamp.
 */
describe('editing keeps what the edit did not touch', () => {
    it('keeps ➕ and 🆔 through a rename', async () => {
        const { app, store } = fakeApp(
            'Day.md',
            '- [ ] Pay bills ➕ 2023-06-01 🆔 abc 📅 2023-06-10 #money'
        );

        const ok = await new TaskWriter(app).updateTaskInFile(
            'Day.md',
            1,
            { title: 'Pay all the bills' },
            'Pay bills'
        );

        expect(ok).toBe(true);
        expect(store.text).toBe('- [ ] Pay all the bills ➕ 2023-06-01 🆔 abc 📅 2023-06-10 #money');
    });

    it('moves only the date when a task is dropped into another bucket', async () => {
        const { app, store } = fakeApp(
            'Day.md',
            '- [x] Class 📅 2024-01-01 ⏰ 09:00-10:30 ⏱ 1h ✅ 2024-01-01'
        );

        await new TaskWriter(app).updateTaskInFile('Day.md', 1, { dueDate: null }, 'Class');

        expect(store.text).toBe('- [x] Class ⏰ 09:00-10:30 ⏱ 1h ✅ 2024-01-01');
    });

    it('keeps a 🔺 through an edit that did not change the priority', async () => {
        const { app, store } = fakeApp('Day.md', '- [ ] Water the plants 🔺 🔁 every day');

        await new TaskWriter(app).updateTaskInFile(
            'Day.md',
            1,
            { title: 'Water the plants', priority: 'urgent', dueDate: '2024-05-01' },
            'Water the plants'
        );

        expect(store.text).toBe('- [ ] Water the plants 🔺 🔁 every day 📅 2024-05-01');
    });

    it('writes the time spent without touching the rest', async () => {
        const { app, store } = fakeApp('Day.md', '- [ ] Write 🆔 w1 ⏱ 25m ^blk');

        await new TaskWriter(app).setSpentInFile('Day.md', 1, 50);

        expect(store.text).toBe('- [ ] Write 🆔 w1 ⏱ 50m ^blk');
    });
});

describe('finishing a recurring task', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 1, 15, 12, 0, 0));
    });
    afterEach(() => vi.useRealTimers());

    it('leaves behind what belonged to the finished occurrence', async () => {
        const { app, store } = fakeApp(
            'Chores.md',
            '- [ ] Pay rent 🆔 rent1 ⛔ bank ➕ 2024-01-01 🔁 every month 📅 2024-02-01 ⏱ 20m #home ^blk'
        );

        const ok = await new TaskWriter(app).setStatusInFile('Chores.md', 1, 'done', 'Pay rent');

        expect(ok).toBe(true);
        expect(store.text.split('\n')).toEqual([
            // Another 🆔 or block link like these would break whatever points
            // at them; ➕ is when this occurrence was made, which is today.
            '- [ ] Pay rent ➕ 2024-02-15 🔁 every month 📅 2024-03-01 #home',
            '- [x] Pay rent 🆔 rent1 ⛔ bank ➕ 2024-01-01 🔁 every month 📅 2024-02-01 ⏱ 20m ✅ 2024-02-15 #home ^blk',
        ]);
    });

    it('rolls a `🏁 delete` task over and removes the finished one', async () => {
        const { app, store } = fakeApp(
            'Chores.md',
            [
                '- [ ] Mow the lawn 🔁 every week 🏁 delete 📅 2024-02-15',
                '\tthe back garden too',
                '- [ ] Something else',
            ].join('\n')
        );

        await new TaskWriter(app).setStatusInFile('Chores.md', 1, 'done', 'Mow the lawn');

        // The rule used to swallow `🏁 delete`, and the task never repeated.
        // The description stays with the chore it describes.
        expect(store.text.split('\n')).toEqual([
            '- [ ] Mow the lawn 🔁 every week 🏁 delete 📅 2024-02-22',
            '\tthe back garden too',
            '- [ ] Something else',
        ]);
    });

    it('removes a finished `🏁 delete` task that does not repeat, with its lines', async () => {
        const { app, store } = fakeApp(
            'Chores.md',
            ['- [ ] Throw out the boxes 🏁 delete', '\tthe big ones', '- [ ] Next'].join('\n')
        );

        await new TaskWriter(app).setStatusInFile('Chores.md', 1, 'done', 'Throw out the boxes');

        expect(store.text).toBe('- [ ] Next');
    });

    it('keeps a `🏁 delete` task that was only cancelled', async () => {
        const { app, store } = fakeApp('Chores.md', '- [ ] Throw out the boxes 🏁 delete');

        await new TaskWriter(app).setStatusInFile(
            'Chores.md',
            1,
            'cancelled',
            'Throw out the boxes'
        );

        expect(store.text).toBe('- [-] Throw out the boxes 🏁 delete ❌ 2024-02-15');
    });
});

describe('taking back a task that was just added', () => {
    it('removes the last copy of exactly that line', async () => {
        const note = ['- [ ] Buy milk', '- [ ] Walk', '- [ ] Buy milk', ''].join('\n');
        const { app, store } = fakeApp('Inbox.md', note);

        const ok = await new TaskWriter(app).removeAddedTask({
            filePath: 'Inbox.md',
            line: '- [ ] Buy milk',
        });

        expect(ok).toBe(true);
        expect(store.text).toBe(['- [ ] Buy milk', '- [ ] Walk', ''].join('\n'));
    });

    it('leaves a line the user has touched since — undo never takes their work', async () => {
        const { app, store } = fakeApp('Inbox.md', '- [x] Buy milk ✅ 2026-09-24\n');

        const ok = await new TaskWriter(app).removeAddedTask({
            filePath: 'Inbox.md',
            line: '- [ ] Buy milk',
        });

        expect(ok).toBe(false);
        expect(store.text).toBe('- [x] Buy milk ✅ 2026-09-24\n');
    });
});
