import { describe, it, expect } from 'vitest';
import { computeContentStats, STALE_DAYS } from '../src/modules/content/services/contentStats';
import type { ContentItem } from '../src/store/contentSlice';

const NOW = Date.UTC(2026, 6, 26);
const DAY = 86_400_000;

function item(over: Partial<ContentItem> = {}): ContentItem {
    return {
        id: over.filePath ?? 'a.md',
        title: 'A',
        status: 'backlog',
        rating: 0,
        tags: [],
        type: 'book',
        filePath: over.filePath ?? 'a.md',
        ...over,
    };
}

describe('computeContentStats', () => {
    it('handles an empty library without dividing by zero', () => {
        const s = computeContentStats([], NOW);
        expect(s).toMatchObject({ total: 0, avgRating: 0, completionRate: 0, averageProgress: null });
        expect(s.stalled).toEqual([]);
    });

    it('averages only the rated items', () => {
        const s = computeContentStats([item({ rating: 8 }), item({ rating: 0 })], NOW);
        expect(s.avgRating).toBe(8);
    });

    it('counts completion as a percentage of everything', () => {
        const s = computeContentStats(
            [item({ status: 'completed' }), item({ status: 'backlog' }), item({ status: 'dropped' })],
            NOW
        );
        expect(s.completionRate).toBe(33);
    });

    it('flags in-progress items untouched past the threshold', () => {
        const fresh = item({ filePath: 'fresh.md', status: 'in-progress', updatedAt: NOW - 3 * DAY });
        const old = item({ filePath: 'old.md', status: 'in-progress', updatedAt: NOW - 90 * DAY });
        const s = computeContentStats([fresh, old], NOW);
        expect(s.stalled.map((i) => i.filePath)).toEqual(['old.md']);
    });

    it('sorts the stalled list most-neglected first', () => {
        const a = item({ filePath: 'a.md', status: 'in-progress', updatedAt: NOW - 40 * DAY });
        const b = item({ filePath: 'b.md', status: 'in-progress', updatedAt: NOW - 200 * DAY });
        expect(computeContentStats([a, b], NOW).stalled.map((i) => i.filePath)).toEqual([
            'b.md',
            'a.md',
        ]);
    });

    it('never calls a backlog item stalled — it was never started', () => {
        const s = computeContentStats([item({ status: 'backlog', updatedAt: NOW - 400 * DAY })], NOW);
        expect(s.stalled).toEqual([]);
    });

    it('counts what was finished inside the window', () => {
        const s = computeContentStats(
            [
                item({ filePath: 'x.md', status: 'completed', updatedAt: NOW - 5 * DAY }),
                item({ filePath: 'y.md', status: 'completed', updatedAt: NOW - 300 * DAY }),
            ],
            NOW
        );
        expect(s.finishedRecently).toBe(1);
    });

    it('averages progress only where a total is known', () => {
        const s = computeContentStats(
            [
                item({ filePath: 'a.md', status: 'in-progress', progressCurrent: 5, progressTotal: 10 }),
                item({ filePath: 'b.md', status: 'in-progress', progressCurrent: 30 }), // no total
                item({ filePath: 'c.md', status: 'in-progress', progressCurrent: 1, progressTotal: 4 }),
            ],
            NOW
        );
        expect(s.averageProgress).toBe(37.5);
    });

    it('ranks genres by frequency, then alphabetically', () => {
        const s = computeContentStats(
            [
                item({ filePath: 'a.md', genres: ['drama', 'action'] }),
                item({ filePath: 'b.md', genres: ['drama'] }),
                item({ filePath: 'c.md', genres: ['comedy'] }),
            ],
            NOW
        );
        expect(s.topGenres).toEqual([
            { genre: 'drama', count: 2 },
            { genre: 'action', count: 1 },
            { genre: 'comedy', count: 1 },
        ]);
    });

    it('buckets additions by month, oldest first', () => {
        const s = computeContentStats(
            [
                item({ filePath: 'a.md', createdAt: Date.UTC(2026, 4, 3) }),
                item({ filePath: 'b.md', createdAt: Date.UTC(2026, 6, 1) }),
                item({ filePath: 'c.md', createdAt: Date.UTC(2026, 6, 20) }),
            ],
            NOW
        );
        expect(s.addedByMonth).toEqual([
            { month: '2026-05', count: 1 },
            { month: '2026-07', count: 2 },
        ]);
    });

    it('takes the stale threshold as a parameter', () => {
        const i = item({ status: 'in-progress', updatedAt: NOW - 10 * DAY });
        expect(computeContentStats([i], NOW, STALE_DAYS).stalled).toHaveLength(0);
        expect(computeContentStats([i], NOW, 7).stalled).toHaveLength(1);
    });

    describe('finish dates', () => {
        it('counts a recent finish date', () => {
            const s = computeContentStats([item({ status: 'completed', finished: '2026-07-20' })], NOW);
            expect(s.finishedRecently).toBe(1);
        });

        it('ignores mtime once a finish date exists', () => {
            // The whole point: re-tagging a book read two years ago must not
            // report it as finished this month.
            const s = computeContentStats(
                [item({ status: 'completed', finished: '2024-01-05', updatedAt: NOW })],
                NOW
            );
            expect(s.finishedRecently).toBe(0);
        });

        it('falls back to mtime for items with no finish date', () => {
            const s = computeContentStats([item({ status: 'completed', updatedAt: NOW - 3 * DAY })], NOW);
            expect(s.finishedRecently).toBe(1);
        });

        it('averages how long tracked items took', () => {
            const s = computeContentStats(
                [
                    item({ filePath: 'a.md', status: 'completed', started: '2026-01-01', finished: '2026-01-11' }),
                    item({ filePath: 'b.md', status: 'completed', started: '2026-02-01', finished: '2026-02-21' }),
                ],
                NOW
            );
            expect(s.avgDaysToFinish).toBe(15);
        });

        it('skips items missing either end of the span', () => {
            const s = computeContentStats(
                [
                    item({ filePath: 'a.md', status: 'completed', finished: '2026-01-11' }),
                    item({ filePath: 'b.md', status: 'completed', started: '2026-02-01' }),
                    item({ filePath: 'c.md', status: 'in-progress', started: '2026-01-01', finished: '2026-01-05' }),
                ],
                NOW
            );
            expect(s.avgDaysToFinish).toBeNull();
        });
    });
});
