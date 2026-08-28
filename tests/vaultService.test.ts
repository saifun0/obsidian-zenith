import { describe, it, expect, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { toStringArray, toIsoDate, VaultService } from '../src/services/vaultService';

describe('toStringArray', () => {
    it('passes through arrays, trimming and dropping empties', () => {
        expect(toStringArray(['work', ' urgent ', ''])).toEqual(['work', 'urgent']);
    });
    it('splits a bare/comma string', () => {
        expect(toStringArray('work urgent')).toEqual(['work', 'urgent']);
        expect(toStringArray('work, urgent')).toEqual(['work', 'urgent']);
    });
    it('coerces numbers', () => {
        expect(toStringArray([1, 2])).toEqual(['1', '2']);
        expect(toStringArray(3)).toEqual(['3']);
    });
    it('returns [] for null/undefined', () => {
        expect(toStringArray(null)).toEqual([]);
        expect(toStringArray(undefined)).toEqual([]);
    });
});

describe('toIsoDate', () => {
    it('keeps ISO strings (date part only)', () => {
        expect(toIsoDate('2025-01-15')).toBe('2025-01-15');
        expect(toIsoDate('2025-01-15T10:00:00')).toBe('2025-01-15');
    });
    it('recovers the calendar day from a UTC Date (YAML dates)', () => {
        // js-yaml parses `2025-01-15` as UTC midnight.
        expect(toIsoDate(new Date(Date.UTC(2025, 0, 15)))).toBe('2025-01-15');
    });
    it('returns undefined for empty / non-date values', () => {
        expect(toIsoDate('')).toBeUndefined();
        expect(toIsoDate(null)).toBeUndefined();
        expect(toIsoDate('not a date')).toBeUndefined();
    });
});

describe('VaultService.parseCheckboxes', () => {
    const svc = new VaultService({} as never);

    it('parses -/* checkboxes with the status char and indentation', () => {
        const md = ['- [ ] first', '* [x] second', '  - [/] in prog', 'not a task'].join('\n');
        const boxes = svc.parseCheckboxes(md);
        expect(boxes).toEqual([
            { text: 'first', statusChar: ' ', indent: 0, lineNumber: 1 },
            { text: 'second', statusChar: 'x', indent: 0, lineNumber: 2 },
            { text: 'in prog', statusChar: '/', indent: 2, lineNumber: 3 },
        ]);
    });
});

describe('VaultService.parseTags', () => {
    const svc = new VaultService({} as never);
    it('extracts inline tags', () => {
        expect(svc.parseTags('a #x and #y-2')).toEqual(['x', 'y-2']);
    });
});

describe('reading a folder that may not be there', () => {
    /** Just enough vault to answer one question. */
    function serviceOver(folders: Record<string, TFile[]>) {
        const app = {
            vault: {
                getAbstractFileByPath: (path: string) => {
                    if (!(path in folders)) return null;
                    const folder = new TFolder();
                    folder.path = path;
                    folder.children = folders[path];
                    return folder;
                },
            },
        };
        return new VaultService(app as unknown as ConstructorParameters<typeof VaultService>[0]);
    }

    const note = (name: string) => {
        const file = new TFile();
        file.path = name;
        file.extension = 'md';
        return file;
    };

    it('reads the notes in a folder that exists', () => {
        const service = serviceOver({ notes: [note('notes/a.md')] });
        expect(service.getMarkdownFiles('notes')).toHaveLength(1);
    });

    it('says nothing at all about a folder nobody configured', () => {
        // The setting is empty, which is not a problem — it is the default.
        // Warning here claimed a folder named nothing had gone missing.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const service = serviceOver({});

        expect(service.getMarkdownFiles('')).toEqual([]);
        expect(service.getMarkdownFiles('   ')).toEqual([]);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('complains once about a folder that was configured and is missing', () => {
        // This read runs again on every setting change, every write and every
        // reload. Said each time, it buries everything else in the console.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const service = serviceOver({});

        for (let i = 0; i < 5; i++) service.getMarkdownFiles('tasks');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('tasks');
        // Named as a setting, because that is the thing the user can change.
        expect(warn.mock.calls[0][0]).toMatch(/settings/);
        warn.mockRestore();
    });

    it('complains separately about each missing folder', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const service = serviceOver({});

        service.getMarkdownFiles('tasks');
        service.getMarkdownFiles('journal');

        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('will complain again if the folder appears and then goes', () => {
        // Otherwise the first disappearance is the only one anyone hears about,
        // however long the plugin has been running since.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const folders: Record<string, TFile[]> = {};
        const service = serviceOver(folders);

        service.getMarkdownFiles('tasks');
        folders.tasks = [note('tasks/a.md')];
        expect(service.getMarkdownFiles('tasks')).toHaveLength(1);
        delete folders.tasks;
        service.getMarkdownFiles('tasks');

        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

describe('a note with frontmatter that will not parse', () => {
    const service = () => new VaultService({} as never);
    const broken = ['---', 'tags: [unclosed', 'due: "', '---', '', 'body'].join('\n');

    it('reads the note anyway, and returns no properties', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(service().parseFrontmatter(broken, 'a.md')).toEqual({});
        warn.mockRestore();
    });

    it('names the note, and says the note itself survived', () => {
        // The old message said neither, so there was no way to find the file
        // and no way to tell how much had been lost.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        service().parseFrontmatter(broken, 'notes/broken.md');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('notes/broken.md');
        expect(warn.mock.calls[0][0]).toMatch(/note itself was read/);
        warn.mockRestore();
    });

    it('says it once per note, however often the note is re-read', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const one = service();

        for (let i = 0; i < 5; i++) one.parseFrontmatter(broken, 'notes/broken.md');
        one.parseFrontmatter(broken, 'notes/other.md');

        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('leaves a note with no frontmatter alone entirely', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(service().parseFrontmatter('# just a heading', 'a.md')).toEqual({});
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
