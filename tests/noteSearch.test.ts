import { describe, expect, it } from 'vitest';
import {
    lineOf,
    locate,
    parseTextQuery,
    pathFilter,
    prepareText,
    type TextQuery,
} from '../src/modules/search/noteText';
import { flatRows, rankResults, type ReadSource, type ResultRow } from '../src/modules/search/rank';
import type { SearchCreator, SearchItem } from '../src/modules/search/searchSources';

const q = (text: string): TextQuery => {
    const query = parseTextQuery(text);
    if (!query) throw new Error(`no query from "${text}"`);
    return query;
};

const marked = (line: string, text: string): string[] => {
    const { snippet } = lineOf(line, q(text));
    return snippet.marks.map(([a, b]) => snippet.text.slice(a, b));
};

describe('what counts as found in a note', () => {
    it('needs three letters before it searches at all', () => {
        expect(parseTextQuery('ab')).toBeNull();
        expect(parseTextQuery('  "a" ')).toBeNull();
        expect(parseTextQuery('abc')).not.toBeNull();
    });

    it('finds each word at the start of a word, anywhere in the note', () => {
        const text = 'Первая строка про ремонт\n\nДругая про плитку и заметки';
        expect(locate(text, q('замет ремонт'))).not.toBeNull();
        expect(locate(text, q('мет'))).toBeNull();
        expect(locate(text, q('ремонт обои'))).toBeNull();
    });

    it('ignores case and treats ё as е, both ways', () => {
        expect(locate('Ёлка во дворе', q('елка'))).not.toBeNull();
        expect(locate('Елка во дворе', q('ёлка'))).not.toBeNull();
        expect(locate('SYNC now', q('sync'))).not.toBeNull();
    });

    it('finds words in quotes together, on one line', () => {
        expect(locate('купить молоко завтра', q('"купить молоко"'))).not.toBeNull();
        expect(locate('молоко купить', q('"купить молоко"'))).toBeNull();
        expect(locate('купить\nмолоко', q('"купить молоко"'))).toBeNull();
    });

    it('does not guess the other keyboard layout', () => {
        expect(locate('Sync now', q('ынтс'))).toBeNull();
    });

    it('picks the line saying the most, a heading over the text', () => {
        const text = 'про ремонт\nремонт кухни\n## Кухня: ремонт\nещё ремонт кухни';
        expect(locate(text, q('ремонт кухн'))).toEqual({ line: 2, heading: true });
        expect(locate('ремонт\nремонт кухни', q('ремонт кухн'))).toEqual({
            line: 1,
            heading: false,
        });
    });
});

describe('what of a note is searched', () => {
    it('leaves out the properties and keeps the lines where they were', () => {
        const text = prepareText('---\ntitle: Дюна\ntags: [книга]\n---\nО книге');
        expect(text.split('\n')).toEqual(['', '', '', '', 'О книге']);
        expect(locate(text, q('дюна'))).toBeNull();
    });

    it('leaves out tasks and the lines under them', () => {
        const text = prepareText(
            [
                'Купить в магазине',
                '- [ ] Купить молоко',
                '    - 2026-10-14 ⏱ 2h',
                '    заметка к задаче',
                '- обычный пункт про молоко',
            ].join('\n')
        );
        expect(text.split('\n')).toEqual([
            'Купить в магазине',
            '',
            '',
            '',
            '- обычный пункт про молоко',
        ]);
        expect(locate(text, q('задач'))).toBeNull();
        expect(locate(text, q('молоко'))).toEqual({ line: 4, heading: false });
    });

    it('keeps a note whose properties never close', () => {
        expect(prepareText('---\nне свойства')).toBe('---\nне свойства');
    });
});

describe('the found line', () => {
    it('reads without the list marker, heading hashes or link brackets', () => {
        expect(lineOf('## Про [[Ремонт|ремонт]] **кухни**', q('кухн')).snippet.text).toBe(
            'Про ремонт кухни'
        );
        expect(lineOf('- [ссылка](http://x) и текст', q('текст')).snippet.text).toBe(
            'ссылка и текст'
        );
    });

    it('marks every word found', () => {
        expect(marked('Ремонт кухни и ремонт ванной', 'ремонт ванн')).toEqual([
            'Ремонт',
            'ремонт',
            'ванн',
        ]);
    });

    it('cuts a long line around the first word found', () => {
        const line = `${'слово '.repeat(30)}ремонт ${'хвост '.repeat(30)}`;
        const { snippet } = lineOf(line, q('ремонт'));
        expect(snippet.text.startsWith('…')).toBe(true);
        expect(snippet.text.endsWith('…')).toBe(true);
        expect(snippet.text.length).toBeLessThanOrEqual(92);
        expect(snippet.marks.map(([a, b]) => snippet.text.slice(a, b))).toEqual(['ремонт']);
    });

    it('says where on the line as written to select', () => {
        const at = lineOf('- [[Ремонт]] кухни', q('кухн'));
        expect('- [[Ремонт]] кухни'.slice(at.ch, at.ch + at.length)).toBe('кухн');
    });
});

describe('what Obsidian leaves out', () => {
    it('reads folders, files and patterns, and the templates folder', () => {
        const skip = pathFilter(['Archive/', '/\\.excalidraw\\.md$/', 'Private.md'], 'Templates');
        expect(skip('Archive/old.md')).toBe(true);
        expect(skip('Drawing.excalidraw.md')).toBe(true);
        expect(skip('Private.md')).toBe(true);
        expect(skip('Templates/Day.md')).toBe(true);
        expect(skip('Templates.md')).toBe(false);
        expect(skip('Notes/today.md')).toBe(false);
    });

    it('lets a pattern Obsidian could not read pass', () => {
        expect(pathFilter(['/[/'], '')('a.md')).toBe(false);
    });
});

// ── The notes group among the others ───────────────────

const NOW = Date.UTC(2026, 8, 24, 12);

function item(id: string, title: string, extra: Partial<SearchItem> = {}): SearchItem {
    return { id, title, run: () => undefined, ...extra };
}

function source(id: string, items: SearchItem[], extra: Partial<ReadSource> = {}): ReadSource {
    return { id, label: id, items, suggested: [], creators: [], ...extra };
}

const taskCreator: SearchCreator = {
    row: (text) => ({ title: text, label: 'Task', run: () => undefined }),
};

function notes(names: string[], found: SearchItem[] = []): ReadSource {
    return source(
        'notes',
        names.map((name) => item(`notes:${name}.md`, name, { note: `${name}.md` })),
        { trailing: true, found }
    );
}

const hit = (name: string): SearchItem =>
    item(`notes:${name}.md`, name, { note: `${name}.md`, snippet: { text: '…', marks: [] } });

function ranked(query: string, sources: ReadSource[]) {
    return rankResults({ query, sources, recents: {}, now: NOW, recentLabel: 'Recent' });
}

function titles(rows: ResultRow[]): string[] {
    return rows.map((r) => (r.kind === 'item' ? r.item.title : `+ ${r.row.label}`));
}

describe('the notes group', () => {
    const tasks = source('tasks', [item('t:milk', 'Купить молоко')], { creators: [taskCreator] });

    it('goes below everything else, a strong match by name or not', () => {
        const groups = ranked('молок', [notes(['Молоко и сыр']), tasks]);
        expect(groups.map((g) => g.id)).toEqual(['tasks', 'notes', 'create']);
    });

    it('never moves "+ Task" down for what it finds in the text', () => {
        const groups = ranked('купить хлеб', [notes([], [hit('Список')]), tasks]);
        expect(groups.map((g) => g.id)).toEqual(['create', 'notes']);
    });

    it('does not move "+ Task" down for a near match by name either', () => {
        const groups = ranked('ремонт', [notes(['Ремонт кухни']), tasks]);
        expect(groups.map((g) => g.id)).toEqual(['create', 'notes']);
    });

    it('comes first, and moves "+ Task" down, with a note of exactly that name', () => {
        const groups = ranked('ремонт', [notes(['Ремонт']), tasks]);
        expect(groups.map((g) => g.id)).toEqual(['notes', 'create']);
    });

    it('waits for three letters', () => {
        expect(ranked('ре', [notes(['Ремонт']), tasks]).map((g) => g.id)).toEqual(['create']);
    });

    it('lists names first, then the text, each note once', () => {
        const groups = ranked('ремонт', [
            notes(['Ремонт кухни'], [hit('Ремонт кухни'), hit('Дача')]),
        ]);
        expect(titles(flatRows(groups.filter((g) => g.id === 'notes')))).toEqual([
            'Ремонт кухни',
            'Дача',
        ]);
    });

    it('leaves out a note another group already shows', () => {
        const library = source('content', [item('c:dune', 'Дюна', { note: 'Дюна.md' })]);
        const groups = ranked('дюна', [notes(['Дюна'], [hit('Дюна'), hit('Книги')]), library]);
        expect(groups.map((g) => g.id)).toEqual(['content', 'notes']);
        expect(titles(groups[1].rows)).toEqual(['Книги']);
    });

    it('answers #tag by tags alone', () => {
        const tagged = source(
            'notes',
            [item('notes:a.md', 'Дача', { tags: ['дом'] }), item('notes:b.md', 'Работа')],
            { trailing: true, found: [hit('Про дом')] }
        );
        expect(titles(flatRows(ranked('#дом', [tagged])))).toEqual(['Дача']);
    });

    it('keeps to five rows', () => {
        const found = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(hit);
        const groups = ranked('слово', [notes(['Слово'], found)]);
        expect(groups[0].rows).toHaveLength(5);
    });
});
