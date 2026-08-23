import { describe, it, expect } from 'vitest';
import { parseItunes } from '../src/modules/content/services/metadata/providers/itunes';
import { parseGoogleBooks, parseOpenLibrary } from '../src/modules/content/services/metadata/providers/books';
import { parseJikan } from '../src/modules/content/services/metadata/providers/jikan';
import { parseWikipedia } from '../src/modules/content/services/metadata/providers/wikipedia';
import { searchMetadata, providerLabel, providerSearchable } from '../src/modules/content/services/metadata';

describe('parseItunes', () => {
    it('maps a result and upscales the artwork', () => {
        const r = parseItunes({
            results: [
                {
                    trackName: 'Dune',
                    artworkUrl100: 'https://is1.mzstatic.com/image/100x100bb.jpg',
                    releaseDate: '2021-10-22T07:00:00Z',
                    longDescription: 'Paul Atreides…',
                    primaryGenreName: 'Sci-Fi',
                    artistName: 'Denis Villeneuve',
                    trackViewUrl: 'https://itunes.apple.com/dune',
                    trackId: 123,
                },
            ],
        })[0];
        expect(r.title).toBe('Dune');
        expect(r.year).toBe(2021);
        expect(r.coverUrl).toBe('https://is1.mzstatic.com/image/600x600bb.jpg');
        expect(r.genres).toEqual(['Sci-Fi']);
        expect(r.creator).toBe('Denis Villeneuve');
        expect(r.sourceId).toBe('123');
    });

    it('falls back to collectionName and ignores non-arrays', () => {
        expect(parseItunes({ results: [{ collectionName: 'Album', collectionId: 9 }] })[0].title).toBe('Album');
        expect(parseItunes({})).toEqual([]);
        expect(parseItunes(null)).toEqual([]);
    });
});

describe('parseGoogleBooks', () => {
    it('doubles the 0–5 rating and cleans the cover URL', () => {
        const r = parseGoogleBooks({
            items: [
                {
                    id: 'abc',
                    volumeInfo: {
                        title: 'The Great Gatsby',
                        authors: ['F. Scott Fitzgerald'],
                        publishedDate: '1925',
                        description: 'A Jazz Age novel.',
                        categories: ['Fiction'],
                        averageRating: 4,
                        imageLinks: { thumbnail: 'http://books.google.com/x?zoom=1&edge=curl' },
                        canonicalVolumeLink: 'https://books.google.com/gatsby',
                    },
                },
            ],
        })[0];
        expect(r.rating).toBe(8);
        expect(r.year).toBe(1925);
        expect(r.coverUrl).toBe('https://books.google.com/x?zoom=1');
        expect(r.creator).toBe('F. Scott Fitzgerald');
        expect(r.sourceId).toBe('abc');
    });
});

describe('parseOpenLibrary', () => {
    it('builds a cover URL and trims subjects', () => {
        const r = parseOpenLibrary({
            docs: [
                {
                    title: 'Dune',
                    author_name: ['Frank Herbert'],
                    first_publish_year: 1965,
                    cover_i: 8100,
                    subject: ['sci-fi', 'a', 'b', 'c', 'd'],
                    key: '/works/OL1W',
                },
            ],
        })[0];
        expect(r.coverUrl).toBe('https://covers.openlibrary.org/b/id/8100-L.jpg');
        expect(r.year).toBe(1965);
        expect(r.genres).toEqual(['sci-fi', 'a', 'b', 'c']);
        expect(r.source).toBe('https://openlibrary.org/works/OL1W');
    });
});

describe('parseJikan', () => {
    it('prefers the English title and maps studios for anime', () => {
        const r = parseJikan(
            {
                data: [
                    {
                        mal_id: 269,
                        title: 'BLEACH',
                        title_english: 'Bleach',
                        images: { jpg: { large_image_url: 'https://cdn/bleach.jpg' } },
                        year: 2004,
                        synopsis: 'Ichigo…',
                        score: 7.9,
                        genres: [{ name: 'Action' }, { name: 'Adventure' }],
                        studios: [{ name: 'Studio Pierrot' }],
                        url: 'https://myanimelist.net/anime/269',
                    },
                ],
            },
            'anime'
        )[0];
        expect(r.title).toBe('Bleach');
        expect(r.year).toBe(2004);
        expect(r.rating).toBe(7.9);
        expect(r.creator).toBe('Studio Pierrot');
        expect(r.genres).toEqual(['Action', 'Adventure']);
        expect(r.sourceId).toBe('269');
    });

    it('maps authors and published year for manga', () => {
        const r = parseJikan(
            {
                data: [
                    {
                        mal_id: 13,
                        title: 'One Piece',
                        images: { jpg: { image_url: 'https://cdn/op.jpg' } },
                        published: { prop: { from: { year: 1997 } } },
                        authors: [{ name: 'Eiichiro Oda' }],
                    },
                ],
            },
            'manga'
        )[0];
        expect(r.year).toBe(1997);
        expect(r.creator).toBe('Eiichiro Oda');
        expect(r.coverUrl).toBe('https://cdn/op.jpg');
    });
});

describe('parseWikipedia', () => {
    it('orders by search index and pulls a year from the extract', () => {
        const r = parseWikipedia({
            query: {
                pages: {
                    '10': { pageid: 10, title: 'Second', index: 2, extract: 'B', thumbnail: { source: 'https://t2.jpg' }, fullurl: 'https://en.wikipedia.org/2' },
                    '5': { pageid: 5, title: 'First', index: 1, extract: 'A game released in 2013.', thumbnail: { source: 'https://t1.jpg' }, fullurl: 'https://en.wikipedia.org/1' },
                },
            },
        });
        expect(r.map((x) => x.title)).toEqual(['First', 'Second']);
        expect(r[0].coverUrl).toBe('https://t1.jpg');
        expect(r[0].year).toBe(2013);
    });
});

describe('searchMetadata', () => {
    const noop = async () => ({});

    it('returns [] for the none provider and empty queries', async () => {
        expect(await searchMetadata('none', 'anything', noop)).toEqual([]);
        expect(await searchMetadata('wikipedia', '   ', noop)).toEqual([]);
    });

    it('maps provider results and caches them', async () => {
        let calls = 0;
        const fetch = async () => {
            calls++;
            return { results: [{ trackName: 'Dune', releaseDate: '2021', artworkUrl100: 'https://x/100x100bb.jpg' }] };
        };
        const a = await searchMetadata('itunes-movie', 'dune caching-test', fetch);
        expect(a[0].title).toBe('Dune');
        const b = await searchMetadata('itunes-movie', 'dune caching-test', fetch);
        expect(b[0].title).toBe('Dune');
        expect(calls).toBe(1); // second call served from cache
    });
});

describe('provider metadata helpers', () => {
    it('flags searchability and labels providers', () => {
        expect(providerSearchable('none')).toBe(false);
        expect(providerSearchable('books')).toBe(true);
        expect(providerLabel('jikan-anime')).toContain('MyAnimeList');
    });
});
