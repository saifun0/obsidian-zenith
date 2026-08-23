import type { JsonFetcher, MetadataResult } from '../types';
import { cleanText, positiveInt } from '../types';

/**
 * Jikan v4 — the keyless MyAnimeList API, used as the fallback behind AniList
 * (see `anilist.ts`). Rate-limited to ~3 req/s and it rejects queries shorter
 * than 3 characters, so the caller debounces and gates on length.
 */

interface JikanEntry {
    mal_id?: number;
    title?: string;
    title_english?: string;
    title_japanese?: string;
    images?: { jpg?: { large_image_url?: string; image_url?: string } };
    year?: number;
    episodes?: number;
    chapters?: number;
    aired?: { prop?: { from?: { year?: number } } };
    published?: { prop?: { from?: { year?: number } } };
    synopsis?: string;
    score?: number; // already 0–10
    genres?: Array<{ name?: string }>;
    studios?: Array<{ name?: string }>;
    authors?: Array<{ name?: string }>;
    url?: string;
}

interface JikanResponse {
    data?: JikanEntry[];
}

export function parseJikan(json: unknown, kind: 'anime' | 'manga'): MetadataResult[] {
    const data = (json as JikanResponse)?.data;
    if (!Array.isArray(data)) return [];
    return data
        .map((e): MetadataResult | null => {
            const title = e.title_english || e.title;
            if (!title) return null;
            const alt = [e.title, e.title_japanese].find((t) => t && t.toLowerCase() !== title.toLowerCase());
            const year = e.year ?? e.aired?.prop?.from?.year ?? e.published?.prop?.from?.year;
            const creators = kind === 'anime' ? e.studios : e.authors;
            return {
                title,
                subtitle: alt ?? undefined,
                year: typeof year === 'number' && year > 0 ? year : undefined,
                coverUrl: e.images?.jpg?.large_image_url || e.images?.jpg?.image_url,
                description: cleanText(e.synopsis),
                rating: typeof e.score === 'number' && e.score > 0 ? e.score : undefined,
                creator: creators?.map((c) => c.name).filter(Boolean).join(', ') || undefined,
                genres: e.genres?.map((g) => g.name).filter((n): n is string => !!n),
                total: positiveInt(kind === 'anime' ? e.episodes : e.chapters),
                source: e.url,
                sourceId: e.mal_id != null ? String(e.mal_id) : undefined,
                sourceName: 'MyAnimeList',
            };
        })
        .filter((r): r is MetadataResult => r !== null);
}

/** Run one Jikan search. Throws on transport failure so callers can fall back. */
export async function searchJikan(
    query: string,
    kind: 'anime' | 'manga',
    fetchJson: JsonFetcher
): Promise<MetadataResult[]> {
    // `sfw` is deliberately not set: it also hides plenty of ordinary titles.
    const url = `https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&limit=12&order_by=members&sort=desc`;
    return parseJikan(await fetchJson(url), kind);
}
