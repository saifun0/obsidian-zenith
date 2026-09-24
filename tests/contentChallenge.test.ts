import { describe, it, expect } from 'vitest';
import {
    challengeProgress,
    countFinished,
    goalsFor,
    withGoal,
} from '../src/modules/content/services/challenge';
import type { ContentItem } from '../src/store/contentSlice';

function book(over: Partial<ContentItem>): ContentItem {
    return {
        id: over.title ?? 'b',
        title: 'b',
        status: 'completed',
        rating: 0,
        tags: [],
        type: 'book',
        filePath: `${over.title ?? 'b'}.md`,
        ...over,
    };
}

const ITEMS: ContentItem[] = [
    book({ title: 'new this year', started: '2026-01-10', finished: '2026-02-01' }),
    book({ title: 'last year', finished: '2025-11-01' }),
    // First read in 2019, read again this year.
    book({ title: 'reread', readings: ['2019-03-01/2019-03-20', '2026-05-01/2026-05-20'] }),
    // Read twice this year.
    book({ title: 'twice', readings: ['2026-03-01/2026-03-10', '2026-07-01/2026-07-10'] }),
    book({ title: 'reading now', status: 'in-progress', started: '2026-09-01' }),
    book({ title: 'a film', type: 'movie', finished: '2026-04-01' }),
];

describe('countFinished', () => {
    it('counts every reading finished this year, re-reads included', () => {
        expect(countFinished(ITEMS, 'book', 2026, true)).toBe(4);
    });

    it('counts only first reads when re-reads are left out', () => {
        // "new this year" and "twice" (its first finish is this year); not "reread".
        expect(countFinished(ITEMS, 'book', 2026, false)).toBe(2);
    });

    it('keeps to its type and its year', () => {
        expect(countFinished(ITEMS, 'movie', 2026, true)).toBe(1);
        expect(countFinished(ITEMS, 'book', 2025, true)).toBe(1);
    });
});

describe('challengeProgress', () => {
    it('reports each goal with its pace', () => {
        const goals = { '2026': { book: 24 } };
        const [p] = challengeProgress(ITEMS, goals, '2026-07-01', true);
        expect(p).toMatchObject({ typeId: 'book', year: 2026, target: 24, done: 4 });
        // Half the year gone, 12 expected, 4 done.
        expect(p.pace.status).toBe('behind');
    });

    it('has nothing to report for a year with no goals', () => {
        expect(challengeProgress(ITEMS, { '2025': { book: 10 } }, '2026-07-01', true)).toEqual([]);
    });
});

describe('goals', () => {
    it('keeps each year’s goals with that year', () => {
        const goals = withGoal(withGoal({}, 2025, 'book', 10), 2026, 'book', 24);
        expect(goalsFor(goals, 2025)).toEqual({ book: 10 });
        expect(goalsFor(goals, 2026)).toEqual({ book: 24 });
    });

    it('clears a goal set to zero, and drops an empty year', () => {
        expect(withGoal({ '2026': { book: 24 } }, 2026, 'book', 0)).toEqual({});
    });

    it('ignores nonsense a hand edit left', () => {
        expect(goalsFor({ '2026': { book: -3, movie: Number.NaN, show: 5 } }, 2026)).toEqual({
            show: 5,
        });
    });
});
