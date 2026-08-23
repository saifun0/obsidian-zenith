import { describe, it, expect } from 'vitest';
import { TaskParser } from '../src/modules/tasks/services/taskParser';
import { TFile } from '../src/../tests/mocks/obsidian';

/**
 * Regression cover for the stale-metadata-cache race.
 *
 * The parser reads a file's text with `cachedRead` and its list structure from
 * `metadataCache`. Those are two different sources, and right after a write
 * they disagree for a moment: `vault.on('modify')` fires before Obsidian
 * re-indexes. Following the cache blindly used to invent a task for every line
 * that no longer existed (an empty row in the list) and miss every line that
 * had just been added.
 */

interface CacheItem {
    line: number;
    task: string;
    parent: number;
}

/** An App stub with independently controllable text and list-item cache. */
function makeApp(content: string, cacheLines: CacheItem[] | null) {
    const listItems = cacheLines?.map((item) => ({
        task: item.task,
        parent: item.parent,
        position: { start: { line: item.line, col: 0, offset: 0 }, end: { line: item.line, col: 0, offset: 0 } },
    }));

    return {
        vault: { cachedRead: async () => content },
        metadataCache: {
            getFileCache: () => (listItems ? { listItems } : null),
        },
    } as never;
}

function file(): TFile {
    const f = new TFile();
    f.path = '11 Journal/Daily note/2026-07-28.md';
    f.basename = '2026-07-28';
    f.stat = { ctime: 0, mtime: 0, size: 0 };
    return f;
}

describe('TaskParser and the metadata cache', () => {
    it('uses the cache when it agrees with the file', async () => {
        const content = ['- [ ] alpha', '\t- [x] child', '- [/] beta'].join('\n');
        const parser = new TaskParser(
            makeApp(content, [
                { line: 0, task: ' ', parent: -1 },
                { line: 1, task: 'x', parent: 0 },
                { line: 2, task: '/', parent: -1 },
            ])
        );

        const tasks = await parser.parseFile(file());
        expect(tasks.map((t) => t.title)).toEqual(['alpha', 'beta']);
        // The cache is preferred precisely because it knows the nesting.
        expect(tasks[0].subtasks.map((s) => s.title)).toEqual(['child']);
        expect(tasks[1].status).toBe('in-progress');
    });

    it('does not invent an empty task when the cache still lists a deleted line', async () => {
        // The file lost its second task; the cache has not caught up.
        const content = '- [ ] alpha';
        const parser = new TaskParser(
            makeApp(content, [
                { line: 0, task: ' ', parent: -1 },
                { line: 1, task: ' ', parent: -1 }, // gone from the file
            ])
        );

        const tasks = await parser.parseFile(file());
        expect(tasks).toHaveLength(1);
        expect(tasks[0].title).toBe('alpha');
        expect(tasks.some((t) => t.title === '')).toBe(false);
    });

    it('sees a task the cache has not indexed yet', async () => {
        const content = ['- [ ] alpha', '- [ ] just added'].join('\n');
        const parser = new TaskParser(makeApp(content, [{ line: 0, task: ' ', parent: -1 }]));

        const tasks = await parser.parseFile(file());
        expect(tasks.map((t) => t.title)).toEqual(['alpha', 'just added']);
    });

    it('falls back to the text when there is no cache at all', async () => {
        const content = ['- [ ] alpha', '    - [ ] child'].join('\n');
        const parser = new TaskParser(makeApp(content, null));

        const tasks = await parser.parseFile(file());
        expect(tasks).toHaveLength(1);
        expect(tasks[0].subtasks.map((s) => s.title)).toEqual(['child']);
    });

    it('ignores a checkbox with no text instead of listing an untitled task', async () => {
        const content = ['- [ ] alpha', '- [ ] ', '- [ ] beta'].join('\n');
        const parser = new TaskParser(
            makeApp(content, [
                { line: 0, task: ' ', parent: -1 },
                { line: 1, task: ' ', parent: -1 },
                { line: 2, task: ' ', parent: -1 },
            ])
        );

        const tasks = await parser.parseFile(file());
        expect(tasks.map((t) => t.title)).toEqual(['alpha', 'beta']);
    });

    it('finds nothing in a note that has no checkboxes', async () => {
        const parser = new TaskParser(makeApp('## Notes\n\nsome prose\n', []));
        expect(await parser.parseFile(file())).toEqual([]);
    });
});
