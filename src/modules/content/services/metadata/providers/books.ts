import type { JsonFetcher, MetadataProvider, MetadataResult } from '../types';
import { cleanText, dedupeByTitle, positiveInt, rankByRelevance, yearFrom } from '../types';

/**
 * Books — Google Books (keyless, rich: description + rating + page count) with
 * an Open Library fallback when Google returns nothing. Page counts seed the
 * progress tracker, so "88 of 320 pages" works without typing the total.
 */

// ── Google Books ─────────────────────────────────────

interface GoogleVolume {
    id?: string;
    volumeInfo?: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        publishedDate?: string;
        description?: string;
        categories?: string[];
        averageRating?: number; // 0–5
        pageCount?: number;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        infoLink?: string;
        canonicalVolumeLink?: string;
    };
}

interface GoogleResponse {
    items?: GoogleVolume[];
}

/** Force https, drop the page-curl edge and ask for a bigger cover. */
function fixGoogleCover(url: string | undefined): string | undefined {
    if (!url) return undefined;
    return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/&zoom=\d/, '&zoom=1');
}

export function parseGoogleBooks(json: unknown): MetadataResult[] {
    const items = (json as GoogleResponse)?.items;
    if (!Array.isArray(items)) return [];
    return items
        .map((it): MetadataResult | null => {
            const v = it.volumeInfo;
            if (!v?.title) return null;
            return {
                title: v.title,
                subtitle: v.subtitle,
                year: yearFrom(v.publishedDate),
                coverUrl: fixGoogleCover(v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail),
                description: cleanText(v.description),
                rating: typeof v.averageRating === 'number' ? v.averageRating * 2 : undefined,
                creator: v.authors?.join(', ') || undefined,
                genres: v.categories && v.categories.length > 0 ? v.categories : undefined,
                total: positiveInt(v.pageCount),
                source: v.canonicalVolumeLink || v.infoLink,
                sourceId: it.id,
                sourceName: 'Google Books',
            };
        })
        .filter((r): r is MetadataResult => r !== null);
}

// ── Open Library (fallback) ──────────────────────────

interface OpenLibraryDoc {
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    number_of_pages_median?: number;
    cover_i?: number;
    subject?: string[];
    key?: string;
}

interface OpenLibraryResponse {
    docs?: OpenLibraryDoc[];
}

export function parseOpenLibrary(json: unknown): MetadataResult[] {
    const docs = (json as OpenLibraryResponse)?.docs;
    if (!Array.isArray(docs)) return [];
    return docs
        .map((d): MetadataResult | null => {
            if (!d.title) return null;
            return {
                title: d.title,
                year: d.first_publish_year,
                coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
                creator: d.author_name?.join(', ') || undefined,
                genres: d.subject?.slice(0, 4),
                total: positiveInt(d.number_of_pages_median),
                source: d.key ? `https://openlibrary.org${d.key}` : undefined,
                sourceId: d.key,
                sourceName: 'Open Library',
            };
        })
        .filter((r): r is MetadataResult => r !== null);
}

export const booksProvider: MetadataProvider = {
    id: 'books',
    label: 'Books (Google Books + Open Library)',
    minQueryLength: 2,
    async search(query: string, fetchJson: JsonFetcher): Promise<MetadataResult[]> {
        const enc = encodeURIComponent(query);
        let google: MetadataResult[] = [];
        try {
            google = parseGoogleBooks(
                await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${enc}&maxResults=12&printType=books`)
            );
            if (google.length >= 5) return rankByRelevance(google, query);
        } catch {
            /* fall through to Open Library */
        }
        let openLib: MetadataResult[] = [];
        try {
            openLib = parseOpenLibrary(
                await fetchJson(
                    `https://openlibrary.org/search.json?q=${enc}&limit=12` +
                        `&fields=title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,key`
                )
            );
        } catch {
            /* keep whatever Google gave us */
        }
        return rankByRelevance(dedupeByTitle([...google, ...openLib]), query).slice(0, 12);
    },
};
