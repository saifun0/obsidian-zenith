import { describe, it, expect } from 'vitest';
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
    const input = { title: 'Call the plumber again', priority: 'none' as const, tags: [] };

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
