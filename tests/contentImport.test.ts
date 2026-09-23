import { describe, it, expect } from 'vitest';
import { parseCsv, parseImport, type ImportTypeMap } from '../src/modules/content/services/contentImport';

const TYPES: ImportTypeMap = { anime: 'anime', manga: 'manga', book: 'book', movie: 'movie' };

describe('parseCsv', () => {
    it('keeps commas inside quoted fields', () => {
        expect(parseCsv('a,b\n"one, two",three')).toEqual([
            ['a', 'b'],
            ['one, two', 'three'],
        ]);
    });

    it('unescapes doubled quotes', () => {
        expect(parseCsv('t\n"He said ""hi"""')).toEqual([['t'], ['He said "hi"']]);
    });

    it('keeps newlines inside quoted fields', () => {
        expect(parseCsv('t\n"line one\nline two"')).toEqual([['t'], ['line one\nline two']]);
    });

    it('handles CRLF and a trailing newline', () => {
        expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('drops blank lines', () => {
        expect(parseCsv('a\n\n1\n')).toEqual([['a'], ['1']]);
    });
});

describe('parseImport — MyAnimeList', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_name>someone</user_name></myinfo>
  <anime>
    <series_animedb_id>269</series_animedb_id>
    <series_title><![CDATA[Bleach]]></series_title>
    <series_episodes>366</series_episodes>
    <my_watched_episodes>21</my_watched_episodes>
    <my_start_date>2026-01-04</my_start_date>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>8</my_score>
    <my_status>Watching</my_status>
  </anime>
  <anime>
    <series_animedb_id>5114</series_animedb_id>
    <series_title><![CDATA[Fullmetal Alchemist: Brotherhood]]></series_title>
    <series_episodes>64</series_episodes>
    <my_watched_episodes>64</my_watched_episodes>
    <my_start_date>2025-02-01</my_start_date>
    <my_finish_date>2025-03-03</my_finish_date>
    <my_score>10</my_score>
    <my_status>Completed</my_status>
  </anime>
  <anime>
    <series_title><![CDATA[]]></series_title>
    <my_status>Plan to Watch</my_status>
  </anime>
  <manga>
    <manga_mangadb_id>13</manga_mangadb_id>
    <manga_title><![CDATA[One Piece]]></manga_title>
    <manga_chapters>1100</manga_chapters>
    <my_read_chapters>400</my_read_chapters>
    <my_score>9</my_score>
    <my_status>On-Hold</my_status>
  </manga>
</myanimelist>`;

    const result = parseImport(xml, TYPES);

    it('recognises the format', () => {
        expect(result?.format).toBe('mal');
    });

    it('reads an in-progress anime with its dates and progress', () => {
        expect(result?.items[0]).toMatchObject({
            title: 'Bleach',
            type: 'anime',
            status: 'in-progress',
            rating: 8,
            progress: 21,
            progressTotal: 366,
            started: '2026-01-04',
        });
    });

    it("treats MAL's 0000-00-00 as no date", () => {
        expect(result?.items[0].finished).toBeUndefined();
    });

    it('carries both dates across for a completed entry', () => {
        expect(result?.items[1]).toMatchObject({
            status: 'completed',
            rating: 10,
            started: '2025-02-01',
            finished: '2025-03-03',
        });
    });

    it('maps On-Hold to in progress rather than dropped', () => {
        const manga = result?.items.find((i) => i.type === 'manga');
        expect(manga).toMatchObject({ title: 'One Piece', status: 'in-progress', progress: 400 });
    });

    it('skips entries without a title', () => {
        expect(result?.skipped).toBe(1);
        expect(result?.items).toHaveLength(3);
    });

    it('brings nothing across that points back at the service', () => {
        expect(result?.items[0]).not.toHaveProperty('source');
        expect(result?.items[0]).not.toHaveProperty('sourceId');
    });
});

describe('parseImport — Goodreads', () => {
    const csv = [
        'Book Id,Title,Author,My Rating,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Exclusive Shelf',
        '4671,"The Great Gatsby",F. Scott Fitzgerald,4,218,2004,1925,2025/06/12,2025/01/01,read',
        '5107,"On the Road, Part One",Jack Kerouac,0,320,1976,1957,,2026/02/02,currently-reading',
        '999,"Some Wishlist Book",Nobody,0,,2020,,,2026/03/03,to-read',
        ',,,0,,,,,,read',
    ].join('\n');

    const result = parseImport(csv, TYPES);

    it('recognises the format', () => {
        expect(result?.format).toBe('goodreads');
    });

    it('doubles the 5-star scale onto our 10-point one', () => {
        expect(result?.items[0].rating).toBe(8);
    });

    it('prefers the original publication year', () => {
        expect(result?.items[0].year).toBe(1925);
    });

    it('normalises slash-separated dates', () => {
        expect(result?.items[0].finished).toBe('2025-06-12');
    });

    it('marks a read book as fully read when the length is known', () => {
        expect(result?.items[0]).toMatchObject({ status: 'completed', progress: 218, progressTotal: 218 });
    });

    it('keeps a comma inside a quoted title', () => {
        expect(result?.items[1].title).toBe('On the Road, Part One');
    });

    it('leaves an in-progress book at zero rather than inventing progress', () => {
        expect(result?.items[1]).toMatchObject({ status: 'in-progress', progressTotal: 320 });
        expect(result?.items[1].progress).toBeUndefined();
    });

    it('maps the to-read shelf to the backlog', () => {
        expect(result?.items[2].status).toBe('backlog');
    });

    it('skips a row with no title', () => {
        expect(result?.skipped).toBe(1);
        expect(result?.items).toHaveLength(3);
    });
});

describe('parseImport — Letterboxd', () => {
    it('reads a ratings export as watched films', () => {
        const csv = [
            'Date,Name,Year,Letterboxd URI,Rating',
            '2026-05-01,Stalker,1979,https://boxd.it/aaa,4.5',
        ].join('\n');
        const result = parseImport(csv, TYPES);

        expect(result?.format).toBe('letterboxd');
        expect(result?.items[0]).toMatchObject({
            title: 'Stalker',
            type: 'movie',
            status: 'completed',
            year: 1979,
            rating: 9,
            finished: '2026-05-01',
        });
    });

    it('prefers the diary watched date over the logging date', () => {
        const csv = [
            'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Watched Date',
            '2026-05-10,Solaris,1972,https://boxd.it/bbb,5,No,2026-04-02',
        ].join('\n');
        expect(parseImport(csv, TYPES)?.items[0].finished).toBe('2026-04-02');
    });

    it('treats a watchlist export as a backlog', () => {
        const csv = ['Name,Year,Letterboxd URI', 'Andrei Rublev,1966,https://boxd.it/ccc'].join('\n');
        const result = parseImport(csv, TYPES);
        expect(result?.items[0]).toMatchObject({ status: 'backlog', rating: 0 });
    });
});

describe('parseImport — rejection', () => {
    it('returns null for an unrelated CSV', () => {
        expect(parseImport('name,age\nAda,36', TYPES)).toBeNull();
    });

    it('returns null for prose', () => {
        expect(parseImport('just some notes', TYPES)).toBeNull();
    });

    it('returns null for an empty file', () => {
        expect(parseImport('', TYPES)).toBeNull();
    });
});
