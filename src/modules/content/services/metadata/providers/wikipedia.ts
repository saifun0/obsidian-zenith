import type { JsonFetcher, MetadataProvider, MetadataResult } from '../types';
import { cleanText, rankByRelevance, yearFrom } from '../types';

/**
 * Wikipedia — the keyless generic fallback ("other" and custom types). One
 * query fetches search hits with their intro extract and a thumbnail.
 *
 * Raw search output is mostly noise for a media library: searching "bleach"
 * returned "List of Bleach episodes", "Bleach (disambiguation)" and similar
 * index pages above the actual work. Those are filtered out here, and the
 * remainder is re-ranked so an exact title match wins.
 */

interface WikiPage {
    pageid?: number;
    title?: string;
    index?: number;
    extract?: string;
    thumbnail?: { source?: string };
    fullurl?: string;
    canonicalurl?: string;
}

interface WikiResponse {
    query?: { pages?: Record<string, WikiPage> };
}

/** Index/meta pages that are never the thing the user is adding. */
export function isNavigationPage(title: string, extract: string | undefined): boolean {
    if (/\((disambiguation|значения)\)\s*$/i.test(title)) return true;
    if (/^(list of|lists of|index of|outline of|timeline of|glossary of)\b/i.test(title)) return true;
    if (/^\s*[^.]{0,80}\bmay refer to\b/i.test(extract ?? '')) return true;
    return false;
}

export function parseWikipedia(json: unknown, query = ''): MetadataResult[] {
    const pages = (json as WikiResponse)?.query?.pages;
    if (!pages) return [];

    const results = Object.values(pages)
        .filter((p) => !!p.title)
        // Preserve search relevance order.
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((p): MetadataResult => {
            const description = cleanText(p.extract);
            const title = p.title as string;
            return {
                title,
                // Wikipedia disambiguates in parentheses ("Bleach (TV series)") —
                // that qualifier is useful context but not part of the title.
                subtitle: title.match(/\(([^)]+)\)\s*$/)?.[1],
                coverUrl: p.thumbnail?.source,
                description,
                // Best-effort year from the intro sentence (e.g. "…released in 2013…").
                year: yearFrom(description?.match(/\b(19|20)\d{2}\b/)?.[0]),
                source: p.fullurl || p.canonicalurl,
                sourceId: p.pageid != null ? String(p.pageid) : undefined,
                sourceName: 'Wikipedia',
            };
        })
        .filter((r) => !isNavigationPage(r.title, r.description));

    return rankByRelevance(results, query);
}

/** Run one Wikipedia search. Throws on transport failure so callers can fall back. */
export async function searchWikipedia(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
    const url =
        'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1' +
        `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=12` +
        '&prop=pageimages|extracts|info&piprop=thumbnail&pithumbsize=600' +
        '&exintro=1&explaintext=1&inprop=url';
    return parseWikipedia(await fetchJson(url), query);
}

export const wikipediaProvider: MetadataProvider = {
    id: 'wikipedia',
    label: 'Wikipedia (anything)',
    minQueryLength: 2,
    async search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
        try {
            return await searchWikipedia(query, fetchJson);
        } catch {
            return [];
        }
    },
};
