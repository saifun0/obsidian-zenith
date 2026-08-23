import { describe, it, expect } from 'vitest';
import { parseAniList } from '../src/modules/content/services/metadata/providers/anilist';
import { animangaProvider } from '../src/modules/content/services/metadata/providers/animanga';
import { parseSteamSearch, parseSteamDetails, gameProvider } from '../src/modules/content/services/metadata/providers/steam';
import { parseWikipedia, isNavigationPage } from '../src/modules/content/services/metadata/providers/wikipedia';
import { parseItunes, stripSeasonSuffix, itunesProvider } from '../src/modules/content/services/metadata/providers/itunes';
import { parseGoogleBooks } from '../src/modules/content/services/metadata/providers/books';
import { rankByRelevance, dedupeByTitle, cleanText } from '../src/modules/content/services/metadata/types';
import { normalizeProviderId } from '../src/core/contentTypes';

describe('parseAniList', () => {
    const payload = {
        data: {
            Page: {
                media: [
                    {
                        id: 269,
                        title: { romaji: 'BLEACH', english: 'Bleach', native: 'ブリーチ' },
                        coverImage: { extraLarge: 'https://img/bleach.jpg' },
                        startDate: { year: 2004 },
                        description: 'Ichigo <br>becomes a Soul Reaper.',
                        averageScore: 79,
                        genres: ['Action', 'Adventure'],
                        siteUrl: 'https://anilist.co/anime/269',
                        episodes: 366,
                        studios: { nodes: [{ name: 'Studio Pierrot' }] },
                    },
                ],
            },
        },
    };

    it('maps an anime hit and rescales the 0–100 score', () => {
        const r = parseAniList(payload, 'anime')[0];
        expect(r.title).toBe('Bleach');
        expect(r.year).toBe(2004);
        expect(r.rating).toBe(7.9);
        expect(r.creator).toBe('Studio Pierrot');
        expect(r.total).toBe(366);
        expect(r.sourceName).toBe('AniList');
        // HTML is stripped from the synopsis.
        expect(r.description).toBe('Ichigo becomes a Soul Reaper.');
    });

    it('keeps a genuinely different title as the subtitle', () => {
        // "BLEACH" only differs in case from the English title, so the native
        // one is what actually adds information.
        expect(parseAniList(payload, 'anime')[0].subtitle).toBe('ブリーチ');
    });

    it('uses staff and chapter count for manga', () => {
        const r = parseAniList(
            {
                data: {
                    Page: {
                        media: [
                            {
                                id: 30013,
                                title: { romaji: 'ONE PIECE' },
                                chapters: 1100,
                                staff: { nodes: [{ name: { full: 'Eiichiro Oda' } }] },
                            },
                        ],
                    },
                },
            },
            'manga'
        )[0];
        expect(r.creator).toBe('Eiichiro Oda');
        expect(r.total).toBe(1100);
    });

    it('ignores malformed payloads', () => {
        expect(parseAniList({}, 'anime')).toEqual([]);
        expect(parseAniList(null, 'manga')).toEqual([]);
    });
});

describe('animangaProvider', () => {
    it('falls back to Jikan when AniList fails', async () => {
        const provider = animangaProvider('anime');
        const fetchJson = async (url: string) => {
            if (url.includes('anilist')) throw new Error('down');
            return { data: [{ mal_id: 1, title: 'Cowboy Bebop', episodes: 26 }] };
        };
        const results = await provider.search('cowboy bebop', fetchJson);
        expect(results[0].title).toBe('Cowboy Bebop');
        expect(results[0].sourceName).toBe('MyAnimeList');
    });

    it('does not call Jikan for queries it would reject', async () => {
        const provider = animangaProvider('manga');
        const seen: string[] = [];
        const fetchJson = async (url: string) => {
            seen.push(url);
            if (url.includes('anilist')) throw new Error('down');
            return { data: [] };
        };
        await provider.search('ab', fetchJson);
        expect(seen.some((u) => u.includes('jikan'))).toBe(false);
    });

    it('merges both sources and drops duplicate titles', async () => {
        const provider = animangaProvider('anime');
        const fetchJson = async (url: string) => {
            if (url.includes('anilist')) {
                return { data: { Page: { media: [{ id: 1, title: { english: 'Bleach' } }] } } };
            }
            return { data: [{ mal_id: 2, title: 'Bleach' }, { mal_id: 3, title: 'Bleach: Thousand-Year Blood War' }] };
        };
        const results = await provider.search('bleach', fetchJson);
        expect(results.map((r) => r.title)).toEqual(['Bleach', 'Bleach: Thousand-Year Blood War']);
    });
});

describe('steam / game provider', () => {
    it('builds portrait cover URLs from search hits', () => {
        const r = parseSteamSearch([{ appid: '440', name: 'Team Fortress 2' }])[0];
        expect(r.title).toBe('Team Fortress 2');
        expect(r.coverUrl).toContain('/440/library_600x900.jpg');
        expect(r.enrichKey).toBe('440');
    });

    it('merges app details over the search hit and rescales Metacritic', () => {
        const base = parseSteamSearch([{ appid: '440', name: 'Team Fortress 2' }])[0];
        const full = parseSteamDetails(
            {
                '440': {
                    success: true,
                    data: {
                        name: 'Team Fortress 2',
                        short_description: 'Class-based shooter.',
                        developers: ['Valve'],
                        genres: [{ description: 'Action' }],
                        release_date: { date: '10 Oct, 2007' },
                        metacritic: { score: 92 },
                    },
                },
            },
            base
        );
        expect(full.creator).toBe('Valve');
        expect(full.genres).toEqual(['Action']);
        expect(full.year).toBe(2007);
        expect(full.rating).toBe(9.2);
    });

    it('returns the base hit when Steam reports failure', () => {
        const base = parseSteamSearch([{ appid: '1', name: 'X' }])[0];
        expect(parseSteamDetails({ '1': { success: false } }, base)).toEqual(base);
        expect(parseSteamDetails(null, base)).toEqual(base);
    });

    it('falls back to Wikipedia when Steam has nothing', async () => {
        const fetchJson = async (url: string) => {
            if (url.includes('steamcommunity')) return [];
            return {
                query: { pages: { '1': { pageid: 1, title: 'Chrono Trigger', index: 1, extract: 'A 1995 RPG.' } } },
            };
        };
        const results = await gameProvider.search('chrono trigger', fetchJson);
        expect(results[0].title).toBe('Chrono Trigger');
        expect(results[0].sourceName).toBe('Wikipedia');
    });
});

describe('wikipedia noise filtering', () => {
    it('recognises index and disambiguation pages', () => {
        expect(isNavigationPage('List of Bleach episodes', undefined)).toBe(true);
        expect(isNavigationPage('Bleach (disambiguation)', undefined)).toBe(true);
        expect(isNavigationPage('Bleach', 'Bleach may refer to: a chemical…')).toBe(true);
        expect(isNavigationPage('Bleach (TV series)', 'Bleach is a Japanese anime.')).toBe(false);
    });

    it('drops them from results and promotes the exact match', () => {
        const r = parseWikipedia(
            {
                query: {
                    pages: {
                        '1': { pageid: 1, title: 'List of Bleach episodes', index: 1, extract: 'Episodes.' },
                        '2': { pageid: 2, title: 'Bleach (disambiguation)', index: 2, extract: 'Pages.' },
                        '3': { pageid: 3, title: 'Bleach (TV series)', index: 3, extract: 'A 2004 anime.' },
                        '4': { pageid: 4, title: 'Bleach', index: 4, extract: 'A manga series.' },
                    },
                },
            },
            'bleach'
        );
        expect(r.map((x) => x.title)).toEqual(['Bleach', 'Bleach (TV series)']);
        expect(r[1].subtitle).toBe('TV series');
    });
});

describe('itunes show handling', () => {
    it('strips the season suffix', () => {
        expect(stripSeasonSuffix('Murder, She Wrote, Season 9')).toBe('Murder, She Wrote');
        expect(stripSeasonSuffix('Severance, Season 1')).toBe('Severance');
        expect(stripSeasonSuffix('Dune')).toBe('Dune');
    });

    it('collapses seasons of one show into a single hit', () => {
        const r = parseItunes(
            {
                results: [
                    { collectionName: 'Murder, She Wrote, Season 9', collectionId: 1, trackCount: 22 },
                    { collectionName: 'Murder, She Wrote, Season 10', collectionId: 2, trackCount: 21 },
                    { collectionName: 'Poirot, Series 3', collectionId: 3 },
                ],
            },
            'show'
        );
        expect(r.map((x) => x.title)).toEqual(['Murder, She Wrote', 'Poirot']);
        expect(r[0].total).toBe(22);
    });

    it('drops artistName when it just repeats the show title', () => {
        // Apple returns the show name as artistName for tvSeason entities,
        // which used to land in the item's "Network" field.
        const [show] = parseItunes(
            { results: [{ collectionName: 'Murder, She Wrote, Season 9', artistName: 'Murder, She Wrote' }] },
            'show'
        );
        expect(show.creator).toBeUndefined();

        const [movie] = parseItunes({ results: [{ trackName: 'Dune', artistName: 'Denis Villeneuve' }] }, 'movie');
        expect(movie.creator).toBe('Denis Villeneuve');
    });

    it('leaves movie titles untouched', () => {
        const r = parseItunes({ results: [{ trackName: 'Dune: Part Two', trackId: 7 }] }, 'movie');
        expect(r[0].title).toBe('Dune: Part Two');
        expect(r[0].total).toBeUndefined();
    });

    it('falls back to Wikipedia when Apple has no catalogue entry', async () => {
        const provider = itunesProvider('movie');
        const fetchJson = async (url: string) => {
            if (url.includes('itunes.apple.com')) return { results: [] };
            return { query: { pages: { '1': { pageid: 1, title: 'Stalker', index: 1, extract: 'A 1979 film.' } } } };
        };
        const results = await provider.search('stalker', fetchJson);
        expect(results[0].sourceName).toBe('Wikipedia');
    });
});

describe('books page counts', () => {
    it('carries pageCount through as the progress total', () => {
        const r = parseGoogleBooks({
            items: [{ id: 'a', volumeInfo: { title: 'Dune', pageCount: 412 } }],
        })[0];
        expect(r.total).toBe(412);
    });
});

describe('result helpers', () => {
    it('ranks exact matches above prefix and substring matches', () => {
        const ranked = rankByRelevance(
            [{ title: 'Bleach: Thousand-Year Blood War' }, { title: 'Unbleached cotton' }, { title: 'Bleach' }],
            'bleach'
        );
        expect(ranked.map((r) => r.title)).toEqual([
            'Bleach',
            'Bleach: Thousand-Year Blood War',
            'Unbleached cotton',
        ]);
    });

    it('dedupes case- and space-insensitively, keeping the first spelling', () => {
        const out = dedupeByTitle([
            { title: 'Dune' },
            { title: 'dune' },
            { title: 'Dune  Messiah' },
            { title: 'Dune Messiah' },
        ]);
        expect(out.map((r) => r.title)).toEqual(['Dune', 'Dune  Messiah']);
    });

    it('decodes entities and collapses whitespace', () => {
        expect(cleanText('A &amp; B<br>C   D')).toBe('A & B C D');
        expect(cleanText('   ')).toBeUndefined();
    });
});

describe('normalizeProviderId', () => {
    it('maps legacy ids to their current subject id', () => {
        expect(normalizeProviderId('jikan-anime')).toBe('anime');
        expect(normalizeProviderId('itunes-show')).toBe('show');
        expect(normalizeProviderId('books')).toBe('books');
        expect(normalizeProviderId(undefined)).toBe('none');
    });
});
