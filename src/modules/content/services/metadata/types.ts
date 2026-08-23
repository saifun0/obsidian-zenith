import type { MetadataProviderId } from '../../../../core/contentTypes';

/**
 * A normalized metadata hit from any provider. Every field beyond `title` is
 * optional — providers fill what they have; the add form maps this onto a
 * content item's curated fields.
 */
export interface MetadataResult {
    title: string;
    /** Original-language / alternative title, shown as a subtitle in the picker. */
    subtitle?: string;
    /** Release / publication year. */
    year?: number;
    /** Absolute cover/poster URL. */
    coverUrl?: string;
    /** Plain-text synopsis/description. */
    description?: string;
    /** Normalized to the 0–10 scale (undefined if the source has no score). */
    rating?: number;
    /** Author / director / studio / artist … */
    creator?: string;
    genres?: string[];
    /** Total progress units the work has: episodes, chapters, pages, tracks. */
    total?: number;
    /** Canonical page URL on the source. */
    source?: string;
    /** Provider-native id (e.g. MAL id, Google volume id). */
    sourceId?: string;
    /** Which API produced this hit — shown as a badge in the picker. */
    sourceName?: string;
    /**
     * Opaque handle a provider needs to fetch full details on pick (e.g. a Steam
     * appid). Set together with {@link MetadataProvider.enrich}.
     */
    enrichKey?: string;
}

/** Optional request options — providers that need POST (GraphQL) pass these. */
export interface JsonRequest {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

/** Fetches and parses JSON from a URL. Injected so providers stay testable. */
export type JsonFetcher = (url: string, init?: JsonRequest) => Promise<unknown>;

export interface MetadataProvider {
    id: MetadataProviderId;
    /** Human-readable name for the settings dropdown. */
    label: string;
    /**
     * Shortest query worth sending. Some upstreams reject 1–2 character terms
     * outright (MyAnimeList needs 3), which used to surface as "no results".
     */
    minQueryLength?: number;
    /** Search the source; best-effort — resolves to `[]` on any failure. */
    search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]>;
    /**
     * Optionally fetch the expensive details for a single hit when the user
     * picks it (search endpoints that only return names use this). Returns a
     * merged result, or the input unchanged on failure.
     */
    enrich?(result: MetadataResult, fetchJson: JsonFetcher): Promise<MetadataResult>;
}

/** Strip HTML tags / collapse whitespace from provider descriptions. */
export function cleanText(text: string | undefined): string | undefined {
    if (!text) return undefined;
    const t = text
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
    return t || undefined;
}

/** First 4-digit year found in a date-ish string. */
export function yearFrom(value: string | number | undefined): number | undefined {
    if (value == null) return undefined;
    const m = String(value).match(/\d{4}/);
    if (!m) return undefined;
    const y = Number(m[0]);
    return y > 0 ? y : undefined;
}

/** Positive integer or undefined — providers report 0/null for "unknown". */
export function positiveInt(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/**
 * Rank hits by how well they match what was typed, keeping the upstream order
 * as the tie-breaker. Several APIs (Wikipedia especially) bury the obvious
 * answer under tangential pages, which is what made auto-fill feel broken.
 */
export function rankByRelevance(results: MetadataResult[], query: string): MetadataResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return results;
    const score = (r: MetadataResult): number => {
        const t = r.title.toLowerCase();
        const alt = r.subtitle?.toLowerCase() ?? '';
        if (t === q || alt === q) return 0;
        if (t.startsWith(q) || alt.startsWith(q)) return 1;
        if (t.includes(q) || alt.includes(q)) return 2;
        return 3;
    };
    return results
        .map((r, i) => ({ r, i, s: score(r) }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((x) => x.r);
}

/** Drop hits whose title repeats one already kept (case/spacing-insensitive). */
export function dedupeByTitle(results: MetadataResult[]): MetadataResult[] {
    const seen = new Set<string>();
    const out: MetadataResult[] = [];
    for (const r of results) {
        const key = r.title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}
