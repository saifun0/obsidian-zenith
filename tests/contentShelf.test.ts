import { describe, it, expect } from 'vitest';
import { buildContentShelf, shelfRows } from '../src/modules/content/services/contentShelf';
import type { ContentItem } from '../src/store/contentSlice';
import type { ContentStatus } from '../src/core/constants';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

let seq = 0;

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
    id: `i${seq++}`,
    title: `Item ${seq}`,
    status: 'in-progress' as ContentStatus,
    rating: 0,
    tags: [],
    type: 'show',
    filePath: `Library/${seq}.md`,
    updatedAt: NOW,
    ...over,
});

describe('buildContentShelf', () => {
    // The shelf exists to answer "what do I finish next", and something at 90%
    // is one evening from leaving it. A shelf that never empties is a to-do list.
    it('leads with whatever is closest to done', () => {
        const nearly = item({ progressCurrent: 9, progressTotal: 10 });
        const barely = item({ progressCurrent: 1, progressTotal: 10 });
        const shelf = buildContentShelf([barely, nearly], NOW, { staleDays: 30 });

        expect(shelf.spotlight).toBe(nearly);
        expect(shelf.continuing).toEqual([barely]);
    });

    // "Not tracked" is not "not being read": an item with no total still belongs
    // on the shelf, behind the ones that can be measured.
    it('keeps untracked items, at the back', () => {
        const tracked = item({ progressCurrent: 2, progressTotal: 10 });
        const untracked = item({ progressCurrent: 40 });
        const shelf = buildContentShelf([untracked, tracked], NOW, { staleDays: 30 });

        expect(shelf.spotlight).toBe(tracked);
        expect(shelf.continuing).toEqual([untracked]);
    });

    // A spotlight on a backlog entry would be telling the user to start
    // something rather than reporting what they are doing.
    it('spotlights nothing when nothing is under way', () => {
        const shelf = buildContentShelf([item({ status: 'backlog', rating: 9 })], NOW, {
            staleDays: 30,
        });
        expect(shelf.spotlight).toBeNull();
        expect(shelf.upNext).toHaveLength(1);
    });

    it('offers the backlog best-rated first', () => {
        const good = item({ status: 'backlog', rating: 9 });
        const fine = item({ status: 'backlog', rating: 5 });
        const shelf = buildContentShelf([fine, good], NOW, { staleDays: 30 });
        expect(shelf.upNext).toEqual([good, fine]);
    });

    it('counts the library the way the hero reads it', () => {
        const shelf = buildContentShelf(
            [
                item({ status: 'completed', rating: 8 }),
                item({ status: 'completed', rating: 6 }),
                item({ status: 'in-progress' }),
                item({ status: 'backlog' }),
            ],
            NOW,
            { staleDays: 30 }
        );

        expect(shelf.counts.total).toBe(4);
        expect(shelf.counts.byStatus.completed).toBe(2);
        expect(shelf.counts.completionRate).toBe(50);
        // The mean of the ratings people actually gave — an unrated item is not
        // a zero, it is an absence, and averaging it in would punish the library
        // for having things in it nobody has scored yet.
        expect(shelf.counts.avgRating).toBe(7);
    });

    // mtime is the honest answer to "when did I last touch this" — which is
    // exactly the question here, unlike a finish date.
    it('counts what has gone quiet, and only what is in progress', () => {
        const shelf = buildContentShelf(
            [
                item({ updatedAt: NOW - 40 * DAY }),
                item({ updatedAt: NOW - 2 * DAY }),
                item({ status: 'backlog', updatedAt: NOW - 400 * DAY }),
                item({ updatedAt: undefined }),
            ],
            NOW,
            { staleDays: 30 }
        );
        expect(shelf.counts.stalled).toBe(1);
    });

    it('has an answer for an empty library', () => {
        const shelf = buildContentShelf([], NOW, { staleDays: 30 });
        expect(shelf.spotlight).toBeNull();
        expect(shelf.counts.completionRate).toBe(0);
        expect(shelf.counts.avgRating).toBe(0);
    });
});

describe('shelfRows', () => {
    const shelf = buildContentShelf(
        [
            item({ progressCurrent: 9, progressTotal: 10 }),
            item({ progressCurrent: 5, progressTotal: 10 }),
            item({ progressCurrent: 1, progressTotal: 10 }),
            item({ status: 'backlog', rating: 9 }),
        ],
        NOW,
        { staleDays: 30 }
    );

    it('fills the leftover room from the backlog', () => {
        const rows = shelfRows(shelf, 3);
        expect(rows.continuing).toHaveLength(2);
        expect(rows.upNext).toHaveLength(1);
        expect(rows.hidden).toBe(0);
    });

    // A suggestion must never push something already under way off the card.
    it('never spends a row on a suggestion while something is in progress', () => {
        const rows = shelfRows(shelf, 1);
        expect(rows.continuing).toHaveLength(1);
        expect(rows.upNext).toHaveLength(0);
        expect(rows.hidden).toBe(1);
    });

    it('survives a card with no room at all', () => {
        const rows = shelfRows(shelf, 0);
        expect(rows.continuing).toEqual([]);
        expect(rows.upNext).toEqual([]);
        expect(rows.hidden).toBe(2);
    });
});
