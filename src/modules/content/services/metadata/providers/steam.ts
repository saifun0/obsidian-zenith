import type { JsonFetcher, MetadataProvider, MetadataResult } from '../types';
import { cleanText, rankByRelevance, yearFrom } from '../types';
import { searchWikipedia } from './wikipedia';

/**
 * Games — Steam's keyless storefront endpoints, with Wikipedia as the fallback
 * for anything not on Steam (console exclusives, board games, retro titles).
 *
 * Search returns names + appids only, so the poster comes from Steam's CDN
 * (`library_600x900`, the portrait art the client shows) and the heavy details
 * — synopsis, genres, developer, release year, Metacritic score — are fetched
 * once, on pick, via {@link steamProvider.enrich}.
 */

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

interface SteamSearchApp {
    appid?: string | number;
    name?: string;
}

export function parseSteamSearch(json: unknown): MetadataResult[] {
    if (!Array.isArray(json)) return [];
    return (json as SteamSearchApp[])
        .map((a): MetadataResult | null => {
            if (!a?.name || a.appid == null) return null;
            const id = String(a.appid);
            return {
                title: a.name,
                coverUrl: `${CDN}/${id}/library_600x900.jpg`,
                source: `https://store.steampowered.com/app/${id}/`,
                sourceId: id,
                sourceName: 'Steam',
                enrichKey: id,
            };
        })
        .filter((r): r is MetadataResult => r !== null);
}

interface SteamAppDetails {
    success?: boolean;
    data?: {
        name?: string;
        short_description?: string;
        detailed_description?: string;
        header_image?: string;
        developers?: string[];
        publishers?: string[];
        genres?: Array<{ description?: string }>;
        release_date?: { date?: string };
        metacritic?: { score?: number };
    };
}

/** Merge Steam's app-details payload onto the search hit. */
export function parseSteamDetails(json: unknown, base: MetadataResult): MetadataResult {
    const entry = json && typeof json === 'object' ? Object.values(json as Record<string, SteamAppDetails>)[0] : null;
    const d = entry?.success ? entry.data : undefined;
    if (!d) return base;

    return {
        ...base,
        title: d.name || base.title,
        description: cleanText(d.short_description || d.detailed_description) ?? base.description,
        creator: d.developers?.filter(Boolean).join(', ') || d.publishers?.filter(Boolean).join(', ') || base.creator,
        genres: d.genres?.map((g) => g.description).filter((g): g is string => !!g) ?? base.genres,
        year: yearFrom(d.release_date?.date) ?? base.year,
        // Metacritic is 0–100; the app's scale is 0–10.
        rating: typeof d.metacritic?.score === 'number' && d.metacritic.score > 0 ? d.metacritic.score / 10 : base.rating,
        coverUrl: base.coverUrl || d.header_image,
    };
}

export const gameProvider: MetadataProvider = {
    id: 'game',
    label: 'Games (Steam + Wikipedia)',
    minQueryLength: 2,
    async search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
        let steam: MetadataResult[] = [];
        try {
            steam = parseSteamSearch(
                await fetchJson(`https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(query)}`)
            ).slice(0, 10);
        } catch {
            /* fall through to Wikipedia */
        }
        if (steam.length > 0) return rankByRelevance(steam, query);

        try {
            return await searchWikipedia(query, fetchJson);
        } catch {
            return [];
        }
    },
    async enrich(result: MetadataResult, fetchJson: JsonFetcher): Promise<MetadataResult> {
        if (!result.enrichKey) return result;
        try {
            const json = await fetchJson(
                `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(result.enrichKey)}&l=english`
            );
            return parseSteamDetails(json, result);
        } catch {
            return result;
        }
    },
};
