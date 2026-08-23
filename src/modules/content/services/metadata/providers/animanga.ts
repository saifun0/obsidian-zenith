import type { JsonFetcher, MetadataProvider, MetadataResult } from '../types';
import { dedupeByTitle, rankByRelevance } from '../types';
import { searchAniList } from './anilist';
import { searchJikan } from './jikan';
import type { MetadataProviderId } from '../../../../../core/contentTypes';

/**
 * Anime / manga provider — AniList first, MyAnimeList (Jikan) as the safety net.
 *
 * A single upstream misses a lot: Jikan alone returns nothing for short or
 * non-English queries and 429s under fast typing, which is what made anime and
 * manga auto-fill look broken. Trying both and merging by title fixes the
 * common misses while still resolving in one round-trip when AniList answers.
 */
export function animangaProvider(kind: 'anime' | 'manga'): MetadataProvider {
    return {
        id: kind as MetadataProviderId,
        label: kind === 'anime' ? 'Anime (AniList + MyAnimeList)' : 'Manga (AniList + MyAnimeList)',
        minQueryLength: 2,
        async search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
            let primary: MetadataResult[] = [];
            try {
                primary = await searchAniList(query, kind, fetchJson);
            } catch {
                /* fall through to Jikan */
            }
            if (primary.length >= 5) return rankByRelevance(primary, query);

            // MyAnimeList rejects 1–2 character terms outright.
            let fallback: MetadataResult[] = [];
            if (query.trim().length >= 3) {
                try {
                    fallback = await searchJikan(query, kind, fetchJson);
                } catch {
                    /* keep whatever AniList gave us */
                }
            }
            return rankByRelevance(dedupeByTitle([...primary, ...fallback]), query);
        },
    };
}
