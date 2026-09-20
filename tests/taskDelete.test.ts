import { describe, it, expect } from 'vitest';
import { TFile } from 'obsidian';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import type { App } from 'obsidian';

/**
 * The most destructive thing this plugin does to somebody else's note.
 *
 * `deleteTaskInFile` removes a checkbox line and the whole indented block
 * under it, addressed by a line number — and a line number is a fact about the
 * file as it was when it was last parsed. If the note gained a line in the
 * meantime, that number points at a different task. There is no undo for it
 * beyond Obsidian's file history, and nothing on screen would say it happened.
 *
 * So the line has to still say what the user was shown. These cases are about
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
