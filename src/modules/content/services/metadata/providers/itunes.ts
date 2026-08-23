import type { JsonFetcher, MetadataProvider, MetadataResult } from '../types';
import { cleanText, dedupeByTitle, positiveInt, rankByRelevance, yearFrom } from '../types';
import { searchWikipedia } from './wikipedia';
import type { MetadataProviderId } from '../../../../../core/contentTypes';

/**
 * iTunes Search API — keyless, covers movies, TV and music.
 * Docs: https://performance-partners.apple.com/search-api
 *
 * TV searches hit the `tvSeason` entity, whose names carry a ", Season N"
 * suffix — the library tracks shows, not seasons, so the suffix is stripped and
 * the seasons collapse into one hit per series (with the season count kept as
 * the progress total). Wikipedia backs the whole thing up, since Apple's
 * catalogue is regional and misses plenty of older or non-US titles.
 */

interface ItunesEntry {
    trackName?: string;
    collectionName?: string;
    artistName?: string;
    artworkUrl100?: string;
    artworkUrl60?: string;
    releaseDate?: string;
    longDescription?: string;
    shortDescription?: string;
    primaryGenreName?: string;
    trackCount?: number;
    trackViewUrl?: string;
    collectionViewUrl?: string;
    trackId?: number;
    collectionId?: number;
}

interface ItunesResponse {
    results?: ItunesEntry[];
}

/** Swap iTunes' 100×100 thumbnail for a poster-sized one. */
function upscaleArtwork(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return url.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1');
}

/** "Murder, She Wrote, Season 9" → "Murder, She Wrote". */
export function stripSeasonSuffix(title: string): string {
    return title.replace(/,?\s*(season|series|сезон)\s+\d+\s*$/i, '').trim() || title;
}

export function parseItunes(json: unknown, kind: 'movie' | 'show' | 'music' = 'movie'): MetadataResult[] {
    const results = (json as ItunesResponse)?.results;
    if (!Array.isArray(results)) return [];
    const mapped = results
        .map((e): MetadataResult | null => {
            const raw = e.trackName || e.collectionName;
            if (!raw) return null;
            const title = kind === 'show' ? stripSeasonSuffix(raw) : raw;

            // For TV seasons Apple puts the *show* name in artistName, which
            // made every show its own "Network". Only keep it when it says
            // something the title doesn't.
            const artist = e.artistName?.trim();
            const creator =
                artist && artist.toLowerCase() !== title.toLowerCase() ? artist : undefined;

            return {
                title,
                subtitle: kind === 'music' ? artist : undefined,
                year: yearFrom(e.releaseDate),
                coverUrl: upscaleArtwork(e.artworkUrl100 || e.artworkUrl60),
                description: cleanText(e.longDescription || e.shortDescription),
                creator,
                genres: e.primaryGenreName ? [e.primaryGenreName] : undefined,
                // Episodes in the season / tracks on the album.
                total: kind === 'movie' ? undefined : positiveInt(e.trackCount),
                source: e.trackViewUrl || e.collectionViewUrl,
                sourceId:
                    e.trackId != null ? String(e.trackId) : e.collectionId != null ? String(e.collectionId) : undefined,
                sourceName: 'iTunes',
            };
        })
        .filter((r): r is MetadataResult => r !== null);

    // Seasons of one show collapse to a single entry (the first, i.e. the most
    // relevant per Apple's ordering).
    return kind === 'show' ? dedupeByTitle(mapped) : mapped;
}

/** media/entity pairs per iTunes content kind. */
const KIND: Record<'movie' | 'show' | 'music', { media: string; entity: string; label: string }> = {
    movie: { media: 'movie', entity: 'movie', label: 'Movies (iTunes + Wikipedia)' },
    show: { media: 'tvShow', entity: 'tvSeason', label: 'TV shows (iTunes + Wikipedia)' },
    music: { media: 'music', entity: 'album', label: 'Music (iTunes)' },
};

export function itunesProvider(kind: 'movie' | 'show' | 'music'): MetadataProvider {
    const { media, entity, label } = KIND[kind];
    return {
        id: kind as MetadataProviderId,
        label,
        minQueryLength: 2,
        async search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
            let hits: MetadataResult[] = [];
            try {
                const url =
                    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}` +
                    `&media=${media}&entity=${entity}&limit=20`;
                hits = parseItunes(await fetchJson(url), kind);
            } catch {
                /* fall through */
            }

            // Apple's catalogue is regional; Wikipedia catches what it misses.
            if (hits.length === 0 && kind !== 'music') {
                try {
                    hits = await searchWikipedia(query, fetchJson);
                } catch {
                    return [];
                }
            }
            return rankByRelevance(hits, query).slice(0, 12);
        },
    };
}
