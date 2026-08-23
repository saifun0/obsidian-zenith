import type { JsonFetcher, MetadataResult } from '../types';
import { cleanText, positiveInt } from '../types';

/**
 * AniList — keyless GraphQL API for anime and manga.
 *
 * Preferred over Jikan/MyAnimeList because it matches romaji, English *and*
 * native titles (so "Блич", "bleach" and "ブリーチ" all land on the same show),
 * has no 3-request-per-second throttle, and returns the episode/chapter counts
 * that seed the progress tracker.
 */

const ENDPOINT = 'https://graphql.anilist.co';

const QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 12) {
    media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false) {
      id
      title { romaji english native }
      coverImage { extraLarge large }
      startDate { year }
      description
      averageScore
      genres
      siteUrl
      episodes
      chapters
      format
      studios(isMain: true) { nodes { name } }
      staff(perPage: 2) { nodes { name { full } } }
    }
  }
}`;

interface AniListMedia {
    id?: number;
    title?: { romaji?: string; english?: string; native?: string };
    coverImage?: { extraLarge?: string; large?: string };
    startDate?: { year?: number };
    description?: string;
    averageScore?: number; // 0–100
    genres?: string[];
    siteUrl?: string;
    episodes?: number;
    chapters?: number;
    format?: string;
    studios?: { nodes?: Array<{ name?: string }> };
    staff?: { nodes?: Array<{ name?: { full?: string } }> };
}

interface AniListResponse {
    data?: { Page?: { media?: AniListMedia[] } };
}

export function parseAniList(json: unknown, kind: 'anime' | 'manga'): MetadataResult[] {
    const media = (json as AniListResponse)?.data?.Page?.media;
    if (!Array.isArray(media)) return [];

    return media
        .map((m): MetadataResult | null => {
            const title = m.title?.english || m.title?.romaji || m.title?.native;
            if (!title) return null;

            // Show the other title as a subtitle — helps tell adaptations apart.
            const alt = [m.title?.romaji, m.title?.native].find(
                (t) => t && t.toLowerCase() !== title.toLowerCase()
            );

            const creators =
                kind === 'anime'
                    ? m.studios?.nodes?.map((n) => n.name).filter(Boolean)
                    : m.staff?.nodes?.map((n) => n.name?.full).filter(Boolean);

            return {
                title,
                subtitle: alt ?? undefined,
                year: positiveInt(m.startDate?.year),
                coverUrl: m.coverImage?.extraLarge || m.coverImage?.large,
                description: cleanText(m.description),
                // AniList scores are 0–100; the app's scale is 0–10.
                rating: typeof m.averageScore === 'number' && m.averageScore > 0 ? m.averageScore / 10 : undefined,
                creator: creators && creators.length > 0 ? creators.join(', ') : undefined,
                genres: m.genres?.length ? m.genres : undefined,
                total: positiveInt(kind === 'anime' ? m.episodes : m.chapters),
                source: m.siteUrl,
                sourceId: m.id != null ? String(m.id) : undefined,
                sourceName: 'AniList',
            };
        })
        .filter((r): r is MetadataResult => r !== null);
}

/** Run one AniList search. Throws on transport failure so callers can fall back. */
export async function searchAniList(
    query: string,
    kind: 'anime' | 'manga',
    fetchJson: JsonFetcher
): Promise<MetadataResult[]> {
    const json = await fetchJson(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            query: QUERY,
            variables: { search: query, type: kind === 'anime' ? 'ANIME' : 'MANGA' },
        }),
    });
    return parseAniList(json, kind);
}
