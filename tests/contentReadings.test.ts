import { describe, it, expect } from 'vitest';
import {
    finishedReadings,
    parseReading,
    parseReadingList,
    readingDurations,
    readingsForStatus,
    readingsOf,
    transitionFor,
} from '../src/modules/content/services/readings';
import { computeContentStats } from '../src/modules/content/services/contentStats';
import { normalizeContentItem } from '../src/modules/content/services/contentFormat';
import type { ContentItem } from '../src/store/contentSlice';

const TODAY = '2026-09-24';

describe('parsing readings', () => {
    it('reads closed, open and start-less intervals', () => {
        expect(parseReading('2019-03-01/2019-03-20')).toEqual({
            start: '2019-03-01',
            end: '2019-03-20',
        });
        expect(parseReading('2026-08-02/')).toEqual({ start: '2026-08-02', end: undefined });
        expect(parseReading('/2019-03-20')).toEqual({ start: undefined, end: '2019-03-20' });
    });

    it('drops what is not an interval', () => {
        expect(parseReading('2019-03-01')).toBeNull();
        expect(parseReading('/')).toBeNull();
        expect(parseReading('march/april')).toBeNull();
        expect(parseReadingList(['2019-03-01/2019-03-20', 'nonsense', 5])).toEqual([
            '2019-03-01/2019-03-20',
        ]);
        expect(parseReadingList('2019-03-01/2019-03-20')).toBeUndefined();
    });

    it('comes through the note parser', () => {
        const item = normalizeContentItem(
            { title: 'Dune', type: 'book', readings: ['2019-03-01/2019-03-20', '2026-08-02/'] },
            'Dune',
            'Dune.md',
            ''
        );
        expect(item?.readings).toEqual(['2019-03-01/2019-03-20', '2026-08-02/']);
    });
});

describe('readingsOf', () => {
    it('is the two dates, before there is a list', () => {
        expect(readingsOf({ started: '2019-03-01', finished: '2019-03-20' })).toEqual([
            { start: '2019-03-01', end: '2019-03-20' },
        ]);
        expect(readingsOf({})).toEqual([]);
    });
});

describe('readingsForStatus', () => {
    const finished = { started: '2019-03-01', finished: '2019-03-20' };

    it('starts a re-read of a finished item, keeping the first reading', () => {
        expect(readingsForStatus('in-progress', finished, TODAY)).toEqual([
            '2019-03-01/2019-03-20',
            `${TODAY}/`,
        ]);
    });

    it('writes no list for a first reading', () => {
        expect(readingsForStatus('in-progress', {}, TODAY)).toBeNull();
        expect(readingsForStatus('completed', { started: '2026-09-01' }, TODAY)).toBeNull();
    });

    it('closes the open reading when finished', () => {
        const rereading = {
            started: '2019-03-01',
            readings: ['2019-03-01/2019-03-20', '2026-09-01/'],
        };
        expect(readingsForStatus('completed', rereading, TODAY)).toEqual([
            '2019-03-01/2019-03-20',
            `2026-09-01/${TODAY}`,
        ]);
    });

    it('back to the backlog drops the reading that had begun, not the history', () => {
        const rereading = { readings: ['2019-03-01/2019-03-20', '2026-09-01/'] };
        expect(readingsForStatus('backlog', rereading, TODAY)).toEqual(['2019-03-01/2019-03-20']);
    });

    it('leaves a dropped reading as it is', () => {
        expect(readingsForStatus('dropped', { readings: ['2026-09-01/'] }, TODAY)).toBeNull();
    });
});

describe('transitionFor', () => {
    const finished = { started: '2019-03-01', finished: '2019-03-20' };

    it('writes the dates and the list together', () => {
        expect(transitionFor('in-progress', finished, TODAY, true)).toEqual({
            finished: undefined,
            readings: ['2019-03-01/2019-03-20', `${TODAY}/`],
        });
    });

    it('writes only the dates while re-reads are not kept', () => {
        expect(transitionFor('in-progress', finished, TODAY, false)).toEqual({
            finished: undefined,
        });
    });
});

describe('reading time — each reading on its own', () => {
    // The bug: a book read in 2019 and again in 2026 averaged seven years.
    const reread: ContentItem = {
        id: 'Dune.md',
        title: 'Dune',
        status: 'completed',
        rating: 0,
        tags: [],
        type: 'book',
        filePath: 'Dune.md',
        started: '2019-03-01',
        finished: '2026-08-20',
        readings: ['2019-03-01/2019-03-20', '2026-08-02/2026-08-20'],
    };

    it('measures every finished reading', () => {
        expect(readingDurations(reread)).toEqual([19, 18]);
        expect(finishedReadings(reread)).toBe(2);
    });

    it('averages readings, and counts the book as read more than once', () => {
        const stats = computeContentStats([reread], Date.parse(`${TODAY}T12:00:00`));
        expect(stats.avgDaysToFinish).toBe(18.5);
        expect(stats.reread).toBe(1);
    });

    it('still reads an item with only its two dates', () => {
        const once = { ...reread, readings: undefined, started: '2026-08-02' };
        expect(readingDurations(once)).toEqual([18]);
    });
});
