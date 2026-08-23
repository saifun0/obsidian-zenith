import { describe, it, expect } from 'vitest';
import { normalizeContentItem } from '../src/modules/content/services/contentFormat';

describe('normalizeContentItem', () => {
    it('returns null without title or type', () => {
        expect(normalizeContentItem({}, 'Note', 'content/Note.md', '')).toBeNull();
    });

    it('maps a full frontmatter block', () => {
        const item = normalizeContentItem(
            { title: 'The Great Gatsby', type: 'book', status: 'completed', rating: 8, cover: 'covers/g.jpg', tags: ['fiction', 'classic'] },
            'gatsby',
            'content/gatsby.md',
            'A great American novel about the Jazz Age.'
        );
        expect(item).toMatchObject({
            id: 'content/gatsby.md',
            title: 'The Great Gatsby',
            type: 'book',
            status: 'completed',
            rating: 8,
            coverImage: 'covers/g.jpg',
            tags: ['fiction', 'classic'],
            filePath: 'content/gatsby.md',
        });
        expect(item?.description).toContain('Jazz Age');
    });

    it('falls back to backlog for an unknown status', () => {
        const item = normalizeContentItem({ title: 'X', status: 'weird' }, 'X', 'X.md', '');
        expect(item?.status).toBe('backlog');
    });

    it('clamps rating to 0..10', () => {
        expect(normalizeContentItem({ title: 'A', rating: 42 }, 'A', 'A.md', '')?.rating).toBe(10);
        expect(normalizeContentItem({ title: 'B', rating: -5 }, 'B', 'B.md', '')?.rating).toBe(0);
        expect(normalizeContentItem({ title: 'C', rating: 'nope' }, 'C', 'C.md', '')?.rating).toBe(0);
    });

    it('uses basename when title is missing but type present', () => {
        const item = normalizeContentItem({ type: 'movie' }, 'Inception', 'm/Inception.md', '');
        expect(item?.title).toBe('Inception');
        expect(item?.type).toBe('movie');
    });

    it('normalizes a string tags field', () => {
        const item = normalizeContentItem({ title: 'A', tags: 'fiction classic' }, 'A', 'A.md', '');
        expect(item?.tags).toEqual(['fiction', 'classic']);
    });

    it('reads the curated metadata fields', () => {
        const item = normalizeContentItem(
            {
                title: 'Bleach',
                type: 'anime',
                status: 'in-progress',
                year: 2004,
                creator: 'Studio Pierrot',
                genres: ['action', 'adventure'],
                progress: 'Ep 120/366',
                source: 'https://myanimelist.net/anime/269',
                sourceId: 269,
            },
            'Bleach',
            'content/Bleach.md',
            'Synopsis body.'
        );
        expect(item).toMatchObject({
            year: 2004,
            creator: 'Studio Pierrot',
            genres: ['action', 'adventure'],
            progress: 'Ep 120/366',
            source: 'https://myanimelist.net/anime/269',
            sourceId: '269',
        });
    });

    it('keeps the full body as description, letting frontmatter override it', () => {
        expect(normalizeContentItem({ title: 'A' }, 'A', 'A.md', '  Long synopsis.  ')?.description).toBe(
            'Long synopsis.'
        );
        expect(
            normalizeContentItem({ title: 'A', description: 'Override' }, 'A', 'A.md', 'Body')?.description
        ).toBe('Override');
    });

    it('reads numeric progress and its total', () => {
        const item = normalizeContentItem(
            { title: 'Dune', type: 'book', progress: 88, progressTotal: 412 },
            'Dune',
            'content/Dune.md',
            ''
        );
        expect(item?.progressCurrent).toBe(88);
        expect(item?.progressTotal).toBe(412);
    });

    it('upgrades legacy free-text progress', () => {
        const item = normalizeContentItem(
            { title: 'Bleach', type: 'anime', progress: 'Ep 120/366' },
            'Bleach',
            'content/Bleach.md',
            ''
        );
        expect(item?.progressCurrent).toBe(120);
        expect(item?.progressTotal).toBe(366);
        // The raw string is preserved so nothing is lost before a rewrite.
        expect(item?.progress).toBe('Ep 120/366');
    });

    it('carries the file timestamps used by the "recently added" sort', () => {
        const item = normalizeContentItem({ title: 'A', type: 'book' }, 'A', 'A.md', '', {
            ctime: 1700000000000,
            mtime: 1700000900000,
        });
        expect(item?.createdAt).toBe(1700000000000);
        expect(item?.updatedAt).toBe(1700000900000);
    });

    it('tolerates a missing stat block', () => {
        const item = normalizeContentItem({ title: 'A', type: 'book' }, 'A', 'A.md', '');
        expect(item?.createdAt).toBeUndefined();
        expect(item?.updatedAt).toBeUndefined();
    });

    it('leaves progress undefined when the note tracks none', () => {
        const item = normalizeContentItem({ title: 'A', type: 'movie' }, 'A', 'A.md', '');
        expect(item?.progressCurrent).toBeUndefined();
        expect(item?.progressTotal).toBeUndefined();
    });

    it('drops an invalid or non-positive year', () => {
        expect(normalizeContentItem({ title: 'A', year: 'nope' }, 'A', 'A.md', '')?.year).toBeUndefined();
        expect(normalizeContentItem({ title: 'A', year: 0 }, 'A', 'A.md', '')?.year).toBeUndefined();
    });

    describe('status reconciliation', () => {
        it('reads a backlog note with progress as in progress', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', status: 'backlog', progress: 5, progressTotal: 12 },
                'A',
                'A.md',
                ''
            );
            expect(item?.status).toBe('in-progress');
        });

        it('reads a note whose progress reached the total as completed', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', status: 'in-progress', progress: 12, progressTotal: 12 },
                'A',
                'A.md',
                ''
            );
            expect(item?.status).toBe('completed');
        });

        it('leaves an untouched backlog item alone', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', status: 'backlog', progressTotal: 13 },
                'A',
                'A.md',
                ''
            );
            expect(item?.status).toBe('backlog');
        });

        it('never revives a dropped item', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', status: 'dropped', progress: 12, progressTotal: 12 },
                'A',
                'A.md',
                ''
            );
            expect(item?.status).toBe('dropped');
        });
    });

    describe('dates and external rating', () => {
        it('reads started and finished dates', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', started: '2026-01-01', finished: '2026-02-02' },
                'A',
                'A.md',
                ''
            );
            expect(item).toMatchObject({ started: '2026-01-01', finished: '2026-02-02' });
        });

        it('accepts a YAML date object without shifting the day', () => {
            // js-yaml turns a bare `finished: 2026-02-02` into a UTC-midnight Date.
            const item = normalizeContentItem(
                { title: 'A', type: 'book', finished: new Date('2026-02-02T00:00:00Z') },
                'A',
                'A.md',
                ''
            );
            expect(item?.finished).toBe('2026-02-02');
        });

        it('keeps the provider score separate from the personal one', () => {
            const item = normalizeContentItem(
                { title: 'A', type: 'book', rating: 10, externalRating: 7.8 },
                'A',
                'A.md',
                ''
            );
            expect(item).toMatchObject({ rating: 10, externalRating: 7.8 });
        });

        it('drops an unusable external rating', () => {
            expect(
                normalizeContentItem({ title: 'A', externalRating: 'n/a' }, 'A', 'A.md', '')?.externalRating
            ).toBeUndefined();
        });
    });
});
