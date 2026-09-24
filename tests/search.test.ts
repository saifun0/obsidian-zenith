import { describe, expect, it } from 'vitest';
import { otherLayout, scoreText, scoreTexts } from '../src/modules/search/match';
import { pickBoost, recentIds, recordPick, RECENTS_KEPT } from '../src/modules/search/recents';
import { flatRows, rankResults, type ReadSource, type ResultRow } from '../src/modules/search/rank';
import type { SearchCreator, SearchItem } from '../src/modules/search/searchSources';
import { parseJournalQuery } from '../src/modules/journal/services/journalQuery';

describe('matching a query', () => {
    it('ranks the start of the text over a word’s start over the middle', () => {
        const start = scoreText('sync', 'Sync now');
        const word = scoreText('now', 'Sync now');
        const middle = scoreText('ync', 'Sync now');
        expect(start).toBeGreaterThan(word);
        expect(word).toBeGreaterThan(middle);
        expect(middle).toBeGreaterThan(0);
    });

    it('needs every word of the query, in any order', () => {
        expect(scoreText('хлеб куп', 'Купить хлеб')).toBeGreaterThan(0.8);
        expect(scoreText('хлеб молоко', 'Купить хлеб')).toBe(0);
    });

    it('finds the initials of the words', () => {
        expect(scoreText('tc', 'Tasks Calendar')).toBeGreaterThan(0);
    });

    it('finds letters in order, but only from three', () => {
        expect(scoreText('snw', 'Sync now')).toBeGreaterThan(0);
        expect(scoreText('sw', 'Sync now')).toBe(0);
    });

    it('prefers the whole text to a part of it', () => {
        expect(scoreText('tasks', 'Tasks')).toBeGreaterThan(scoreText('tasks', 'Tasks Calendar'));
    });

    it('ignores case and treats ё as е', () => {
        expect(scoreText('ЕЛКА', 'Ёлка')).toBeGreaterThan(1);
    });

    it('misses what is not there', () => {
        expect(scoreText('xyz', 'Sync now')).toBe(0);
        expect(scoreText('', 'Sync now')).toBe(0);
    });
});

describe('the other keyboard layout', () => {
    it('reads Russian keys as English and back', () => {
        expect(otherLayout('ынтс')).toBe('sync');
        expect(otherLayout('nfcr')).toBe('таск');
    });

    it('leaves a query with both alphabets, or none, alone', () => {
        expect(otherLayout('sync синх')).toBeNull();
        expect(otherLayout('12.09')).toBeNull();
    });

    it('finds with the wrong layout, a little lower than with the right one', () => {
        const wrong = scoreTexts('ынтс', ['Sync now']);
        const right = scoreTexts('sync', ['Sync now']);
        expect(wrong).toBeGreaterThan(0);
        expect(wrong).toBeLessThan(right);
    });

    it('takes the best of several names', () => {
        expect(scoreTexts('синх', ['Sync now', 'Синхронизировать'])).toBe(1);
    });
});

describe('recent picks', () => {
    it('counts picks and remembers the last', () => {
        let r = recordPick({}, 'a', 1);
        r = recordPick(r, 'a', 5);
        expect(r.a).toEqual({ n: 2, at: 5 });
    });

    it('lists the latest first', () => {
        const r = recordPick(recordPick(recordPick({}, 'a', 1), 'b', 2), 'a', 3);
        expect(recentIds(r)).toEqual(['a', 'b']);
    });

    it('forgets the oldest past the limit', () => {
        let r = {};
        for (let i = 0; i < RECENTS_KEPT + 3; i++) r = recordPick(r, `id${i}`, i);
        expect(Object.keys(r)).toHaveLength(RECENTS_KEPT);
        expect(r).not.toHaveProperty('id0');
        expect(r).toHaveProperty(`id${RECENTS_KEPT + 2}`);
    });

    it('lifts a pick less than one step of match quality', () => {
        const now = 1_000_000_000;
        const most = pickBoost({ n: 100, at: now }, now);
        expect(most).toBeGreaterThan(0);
        // The step from a word's start to the text's.
        expect(most).toBeLessThan(scoreText('sync', 'Sync now') - scoreText('now', 'Sync now'));
        expect(pickBoost(undefined, now)).toBe(0);
    });
});

// ── Ranking ──────────────────────────────────────────────────────────────

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
const projectCreator: SearchCreator = {
    keywords: ['проект', 'project'],
    row: (text) => ({ title: text, label: 'Project', run: () => undefined }),
};

const SOURCES: ReadSource[] = [
    source('views', [item('v:tasks', 'Tasks'), item('v:cal', 'Tasks Calendar')]),
    source('actions', [item('a:sync', 'Sync now', { aliases: ['Синхронизировать'] })]),
    source(
        'tasks',
        [
            item('t:bread', 'Купить хлеб', { tags: ['дом'] }),
            item('t:report', 'Отчёт по работе', { tags: ['работа'] }),
        ],
        { creators: [taskCreator] }
    ),
    source('projects', [item('p:repair', 'Ремонт кухни')], { creators: [projectCreator] }),
];

function titles(rows: ResultRow[]): string[] {
    return rows.map((r) => (r.kind === 'item' ? r.item.title : `+ ${r.row.label}: ${r.row.title}`));
}

function rank(query: string, extra: Partial<Parameters<typeof rankResults>[0]> = {}) {
    return rankResults({
        query,
        sources: SOURCES,
        recents: {},
        now: NOW,
        recentLabel: 'Recent',
        ...extra,
    });
}

describe('ranking results', () => {
    it('shows recent picks for an empty query, the latest first', () => {
        const recents = recordPick(recordPick({}, 't:bread', NOW - 10), 'v:cal', NOW - 5);
        const groups = rank('', { recents });
        expect(groups.map((g) => g.id)).toEqual(['recent']);
        expect(titles(groups[0].rows)).toEqual(['Tasks Calendar', 'Купить хлеб']);
    });

    it('drops recent picks that no longer exist', () => {
        const recents = recordPick({}, 't:gone', NOW);
        expect(rank('', { recents })).toEqual([]);
    });

    it('puts the group with the best match first', () => {
        const groups = rank('sync');
        expect(groups[0].id).toBe('actions');
    });

    it('offers the task last when something matched well', () => {
        const rows = flatRows(rank('хлеб'));
        expect(titles(rows)[0]).toBe('Купить хлеб');
        expect(titles(rows).at(-1)).toBe('+ Task: хлеб');
    });

    it('offers the task first when nothing did', () => {
        const rows = flatRows(rank('купить молоко завтра'));
        expect(titles(rows)).toEqual(['+ Task: купить молоко завтра']);
    });

    it('creates by keyword first and searches that source for the rest', () => {
        const rows = flatRows(rank('проект Ремонт'));
        expect(titles(rows)).toEqual(['+ Project: Ремонт', 'Ремонт кухни']);
    });

    it('opens rather than duplicates what the keyword names exactly', () => {
        const rows = flatRows(rank('проект ремонт кухни'));
        expect(titles(rows)).toEqual(['Ремонт кухни', '+ Project: ремонт кухни']);
    });

    it('takes a keyword alone as an ordinary query', () => {
        const rows = flatRows(rank('проект'));
        expect(titles(rows)).toEqual(['+ Task: проект']);
    });

    it('narrows to a tag with #', () => {
        expect(titles(flatRows(rank('#раб'))).slice(0, 1)).toEqual(['Отчёт по работе']);
        expect(titles(flatRows(rank('#дом хлеб'))).slice(0, 1)).toEqual(['Купить хлеб']);
        expect(titles(flatRows(rank('#дом отчёт'))).filter((t) => !t.startsWith('+'))).toEqual([]);
    });

    it('finds by another name and by the other layout', () => {
        expect(titles(flatRows(rank('синх')))[0]).toBe('Sync now');
        expect(titles(flatRows(rank('ынтс')))[0]).toBe('Sync now');
    });

    it('keeps at most five in a group', () => {
        const many = source(
            'many',
            Array.from({ length: 9 }, (_, i) => item(`m:${i}`, `Note ${i}`))
        );
        const groups = rankResults({
            query: 'note',
            sources: [many],
            recents: {},
            now: NOW,
            recentLabel: 'Recent',
        });
        expect(groups[0].rows).toHaveLength(5);
    });

    it('puts often-picked rows first among equal matches', () => {
        const recents = recordPick(recordPick({}, 'v:cal', NOW), 'v:cal', NOW);
        const rows = flatRows(rank('tasks', { recents }));
        // "Tasks" is an exact match and stays first; the calendar comes next.
        expect(titles(rows).slice(0, 2)).toEqual(['Tasks', 'Tasks Calendar']);
        const cal = flatRows(rank('tas', { recents }));
        expect(titles(cal)[0]).toBe('Tasks Calendar');
    });

    it('puts a suggested row at the top of its group', () => {
        const withDate = [
            ...SOURCES,
            source('journal', [], { suggested: [item('j:day', '24 September')] }),
        ];
        const groups = rankResults({
            query: 'вчера',
            sources: withDate,
            recents: {},
            now: NOW,
            recentLabel: 'Recent',
        });
        expect(groups[0].id).toBe('journal');
        expect(titles(flatRows(groups)).at(-1)).toBe('+ Task: вчера');
    });
});

describe('a date typed into Search', () => {
    // A Thursday.
    const TODAY = '2026-09-24';
    const day = (q: string) => parseJournalQuery(q, TODAY);

    it('reads days relative to today', () => {
        expect(day('сегодня')).toBe('2026-09-24');
        expect(day('вчера')).toBe('2026-09-23');
        expect(day('Yesterday')).toBe('2026-09-23');
        expect(day('позавчера')).toBe('2026-09-22');
        expect(day('завтра')).toBe('2026-09-25');
    });

    it('reads a weekday as the last one, today included', () => {
        expect(day('пн')).toBe('2026-09-21');
        expect(day('в пятницу')).toBe('2026-09-18');
        expect(day('thu')).toBe('2026-09-24');
    });

    it('reads a day and a month, in either order and by the month’s start', () => {
        expect(day('12 сентября')).toBe('2026-09-12');
        expect(day('12 сен')).toBe('2026-09-12');
        expect(day('sep 12')).toBe('2026-09-12');
        expect(day('1 мая 2025')).toBe('2025-05-01');
        expect(day('12.09')).toBe('2026-09-12');
        expect(day('12.09.2025')).toBe('2025-09-12');
        expect(day('2026-09-12')).toBe('2026-09-12');
    });

    it('takes the year nearest today', () => {
        expect(parseJournalQuery('31 дек', '2027-01-05')).toBe('2026-12-31');
        expect(day('25 декабря')).toBe('2026-12-25');
    });

    it('is nothing unless the whole query is a date', () => {
        expect(day('12')).toBeNull();
        expect(day('купить хлеб завтра')).toBeNull();
        expect(day('12 ма')).toBeNull();
        expect(day('31 сентября')).toBeNull();
        expect(day('sync')).toBeNull();
    });
});
