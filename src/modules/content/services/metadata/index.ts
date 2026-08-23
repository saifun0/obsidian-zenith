import { requestUrl } from 'obsidian';
import { normalizeProviderId, type MetadataProviderId } from '../../../../core/contentTypes';
import type { JsonFetcher, JsonRequest, MetadataProvider, MetadataResult } from './types';
import { itunesProvider } from './providers/itunes';
import { booksProvider } from './providers/books';
import { animangaProvider } from './providers/animanga';
import { gameProvider } from './providers/steam';
import { wikipediaProvider } from './providers/wikipedia';

/**
 * Metadata service — maps a content type's provider id to a keyless provider,
 * runs the search through Obsidian's `requestUrl` (no CORS), and caches results
 * (memory + localStorage) so repeat searches are instant and offline-tolerant.
 * Mirrors the weather widget's caching approach.
 */

const PROVIDERS: Record<Exclude<MetadataProviderId, 'none'>, MetadataProvider> = (() => {
    const movie = itunesProvider('movie');
    const show = itunesProvider('show');
    const music = itunesProvider('music');
    const anime = animangaProvider('anime');
    const manga = animangaProvider('manga');
    return {
        movie,
        show,
        music,
        books: booksProvider,
        anime,
        manga,
        game: gameProvider,
        wikipedia: wikipediaProvider,
        // Legacy ids resolve to the same providers so saved settings keep working.
        'itunes-movie': movie,
        'itunes-show': show,
        'itunes-music': music,
        'jikan-anime': anime,
        'jikan-manga': manga,
    };
})();

/** Human-readable provider name for settings UI. */
export function providerLabel(id: MetadataProviderId): string {
    if (normalizeProviderId(id) === 'none') return 'None (manual entry)';
    return PROVIDERS[normalizeProviderId(id) as Exclude<MetadataProviderId, 'none'>]?.label ?? id;
}

/** Whether a provider can auto-fill (i.e. isn't `none`). */
export function providerSearchable(id: MetadataProviderId): boolean {
    return normalizeProviderId(id) !== 'none';
}

/** Shortest query this provider is worth calling with. */
export function providerMinQueryLength(id: MetadataProviderId): number {
    if (!providerSearchable(id)) return Number.POSITIVE_INFINITY;
    return PROVIDERS[normalizeProviderId(id) as Exclude<MetadataProviderId, 'none'>]?.minQueryLength ?? 2;
}

// ── Cache ────────────────────────────────────────────

const CACHE_PREFIX = 'zenith:meta';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const memoryCache = new Map<string, { at: number; results: MetadataResult[] }>();

function cacheKey(id: MetadataProviderId, query: string): string {
    return `${normalizeProviderId(id)}:${query.trim().toLowerCase()}`;
}

function readCache(key: string): MetadataResult[] | null {
    const mem = memoryCache.get(key);
    if (mem && Date.now() - mem.at < TTL_MS) return mem.results;
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { at: number; results: MetadataResult[] };
        if (Date.now() - parsed.at >= TTL_MS) return null;
        memoryCache.set(key, parsed);
        return parsed.results;
    } catch {
        return null;
    }
}

function writeCache(key: string, results: MetadataResult[]): void {
    const entry = { at: Date.now(), results };
    memoryCache.set(key, entry);
    try {
        localStorage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify(entry));
    } catch {
        /* quota / private mode — memory cache still works */
    }
}

/** JSON fetch over Obsidian's request layer (bypasses CORS). Supports POST. */
const requestJson: JsonFetcher = async (url: string, init?: JsonRequest) => {
    const res = await requestUrl({
        url,
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        throw: false,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json;
};

/** Outcome of a search — distinguishes "nothing matched" from "couldn't reach". */
export interface MetadataSearchOutcome {
    results: MetadataResult[];
    /** True when every upstream failed (offline, rate-limited, blocked). */
    failed: boolean;
}

/**
 * Search the given provider for `query`. Best-effort — resolves to an empty
 * result list on any error or for the `none` provider / too-short query.
 * Non-empty results are cached.
 */
export async function searchMetadata(
    providerId: MetadataProviderId,
    query: string,
    fetchJson: JsonFetcher = requestJson
): Promise<MetadataResult[]> {
    return (await searchMetadataDetailed(providerId, query, fetchJson)).results;
}

/** {@link searchMetadata} plus whether the miss was a failure or a real blank. */
export async function searchMetadataDetailed(
    providerId: MetadataProviderId,
    query: string,
    fetchJson: JsonFetcher = requestJson
): Promise<MetadataSearchOutcome> {
    const q = query.trim();
    const id = normalizeProviderId(providerId);
    if (!q || id === 'none') return { results: [], failed: false };

    const key = cacheKey(id, q);
    const cached = readCache(key);
    if (cached) return { results: cached, failed: false };

    const provider = PROVIDERS[id as Exclude<MetadataProviderId, 'none'>];
    if (!provider) return { results: [], failed: false };

    try {
        const results = await provider.search(q, fetchJson);
        if (results.length > 0) writeCache(key, results);
        return { results, failed: false };
    } catch (err) {
        console.error('Zenith: metadata search failed:', err);
        return { results: [], failed: true };
    }
}

/**
 * Fill in the details a search endpoint didn't return (Steam only returns names
 * + ids, for instance). Safe to call for every pick — providers without an
 * `enrich` step resolve immediately with the input.
 */
export async function enrichMetadata(
    providerId: MetadataProviderId,
    result: MetadataResult,
    fetchJson: JsonFetcher = requestJson
): Promise<MetadataResult> {
    const provider = PROVIDERS[normalizeProviderId(providerId) as Exclude<MetadataProviderId, 'none'>];
    if (!provider?.enrich || !result.enrichKey) return result;
    try {
        return await provider.enrich(result, fetchJson);
    } catch {
        return result;
    }
}

export type { MetadataResult } from './types';
