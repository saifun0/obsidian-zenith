import type { ContentStatus } from '../../../core/constants';
import type { NewContentInput } from './contentWriter';

/**
 * Import a library from the services people already keep one in.
 *
 * MyAnimeList, Goodreads and Letterboxd all hand out a plain export file, and
 * re-typing several hundred entries by hand is the difference between trying
 * this plugin and using it. Everything here is pure text-in / objects-out — no
 * Obsidian, no network — so the formats are unit-testable and the caller stays
 * responsible for writing notes.
 *
 * Nothing is fetched: an import brings across what the export actually contains
 * (title, score, status, progress, dates). Covers and synopses come later from
 * the ordinary "refresh metadata" action, which is why importing 400 items
 * doesn't hammer anyone's API.
 */

export type ImportFormat = 'mal' | 'goodreads' | 'letterboxd';

export interface ImportedItem extends NewContentInput {
    /** `YYYY-MM-DD`, when the export records it. */
    started?: string;
    finished?: string;
}

export interface ImportResult {
    format: ImportFormat;
    items: ImportedItem[];
    /** Rows recognised as entries but lacking a usable title. */
    skipped: number;
}

/** Which of the user's content types each source maps onto. */
export interface ImportTypeMap {
    anime: string;
    manga: string;
    book: string;
    movie: string;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Split CSV text into rows of fields.
 *
 * Written out rather than split on commas because every one of these exports
 * contains titles with commas in them, Goodreads quotes its own quotes, and
 * Letterboxd reviews carry embedded newlines — all three break the naive
 * version on real data.
 */
export function parseCsv(text: string): string[][] {
    const src = text.replace(/\r\n?/g, '\n');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"') quoted = true;
        else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** `2020/01/05`, `2020-01-05` → `2020-01-05`. MAL's `0000-00-00` → undefined. */
function isoDate(raw: string | undefined): string | undefined {
    const v = (raw ?? '').trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000')) return undefined;
    return v;
}

function toInt(raw: string | undefined): number | undefined {
    const n = Number((raw ?? '').trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** Rescale a 0–5 score (Goodreads, Letterboxd) onto our 0–10 stars. */
function fromFiveScale(raw: string | undefined): number {
    const n = Number((raw ?? '').trim());
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(10, Math.round(n * 2));
}

/**
 * Fill in progress for a finished item.
 *
 * An export says "read" but rarely says "218 of 218 pages". Left alone the
 * library would show every imported book at 0%, so a completed entry with a
 * known length is recorded as done.
 */
function completedProgress(status: ContentStatus, current: number | undefined, total: number | undefined) {
    if (status === 'completed' && total) return { progress: total, progressTotal: total };
    return { progress: current, progressTotal: total };
}

// ── MyAnimeList (XML) ────────────────────────────────────────────────────────

const MAL_STATUS: Record<string, ContentStatus> = {
    completed: 'completed',
    watching: 'in-progress',
    reading: 'in-progress',
    // "On-Hold" is a paused thing, not an abandoned one; the library's own
    // "gone quiet" statistic is what surfaces it later.
    'on-hold': 'in-progress',
    dropped: 'dropped',
    'plan to watch': 'backlog',
    'plan to read': 'backlog',
};

function xmlBlocks(text: string, tag: string): string[] {
    return [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}

/** Read one tag out of an entry, unwrapping the CDATA that MAL wraps titles in. */
function xmlValue(block: string, tag: string): string | undefined {
    const raw = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
    if (raw == null) return undefined;
    const inner = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)?.[1] ?? raw;
    return inner
        .trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");
}

function parseMal(text: string, types: ImportTypeMap): ImportResult {
    const items: ImportedItem[] = [];
    let skipped = 0;

    const sections: { tag: string; typeId: string; titleTag: string; idTag: string; totalTag: string; doneTag: string }[] = [
        { tag: 'anime', typeId: types.anime, titleTag: 'series_title', idTag: 'series_animedb_id', totalTag: 'series_episodes', doneTag: 'my_watched_episodes' },
        { tag: 'manga', typeId: types.manga, titleTag: 'manga_title', idTag: 'manga_mangadb_id', totalTag: 'manga_chapters', doneTag: 'my_read_chapters' },
    ];

    for (const s of sections) {
        for (const block of xmlBlocks(text, s.tag)) {
            const title = xmlValue(block, s.titleTag);
            if (!title) {
                skipped++;
                continue;
            }
            const status = MAL_STATUS[(xmlValue(block, 'my_status') ?? '').toLowerCase()] ?? 'backlog';
            const score = toInt(xmlValue(block, 'my_score')) ?? 0;
            const sourceId = xmlValue(block, s.idTag);

            items.push({
                title,
                type: s.typeId,
                status,
                rating: Math.min(10, score),
                tags: [],
                ...completedProgress(status, toInt(xmlValue(block, s.doneTag)), toInt(xmlValue(block, s.totalTag))),
                started: isoDate(xmlValue(block, 'my_start_date')),
                finished: isoDate(xmlValue(block, 'my_finish_date')),
                sourceId,
                source: sourceId ? `https://myanimelist.net/${s.tag}/${sourceId}` : undefined,
            });
        }
    }

    return { format: 'mal', items, skipped };
}

// ── CSV sources ──────────────────────────────────────────────────────────────

const GOODREADS_STATUS: Record<string, ContentStatus> = {
    read: 'completed',
    'currently-reading': 'in-progress',
    'to-read': 'backlog',
};

/** Index the header row so column order changes between exports don't matter. */
function columnIndex(header: string[]): (name: string) => number {
    const map = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
    return (name: string) => map.get(name.toLowerCase()) ?? -1;
}

function parseGoodreads(rows: string[][], typeId: string): ImportResult {
    const at = columnIndex(rows[0]);
    const items: ImportedItem[] = [];
    let skipped = 0;

    const col = {
        title: at('Title'),
        author: at('Author'),
        rating: at('My Rating'),
        shelf: at('Exclusive Shelf'),
        pages: at('Number of Pages'),
        year: at('Original Publication Year'),
        yearFallback: at('Year Published'),
        dateRead: at('Date Read'),
        id: at('Book Id'),
    };

    for (const row of rows.slice(1)) {
        const title = (row[col.title] ?? '').trim();
        if (!title) {
            skipped++;
            continue;
        }
        const status = GOODREADS_STATUS[(row[col.shelf] ?? '').trim().toLowerCase()] ?? 'backlog';
        const finished = isoDate(row[col.dateRead]);
        const id = (row[col.id] ?? '').trim();

        items.push({
            title,
            type: typeId,
            status,
            rating: fromFiveScale(row[col.rating]),
            tags: [],
            creator: (row[col.author] ?? '').trim() || undefined,
            year: toInt(row[col.year]) ?? toInt(row[col.yearFallback]),
            ...completedProgress(status, undefined, toInt(row[col.pages])),
            finished,
            sourceId: id || undefined,
            source: id ? `https://www.goodreads.com/book/show/${id}` : undefined,
        });
    }

    return { format: 'goodreads', items, skipped };
}

function parseLetterboxd(rows: string[][], typeId: string): ImportResult {
    const at = columnIndex(rows[0]);
    const items: ImportedItem[] = [];
    let skipped = 0;

    const col = {
        name: at('Name'),
        year: at('Year'),
        rating: at('Rating'),
        uri: at('Letterboxd URI'),
        // `diary.csv` has both; `Watched Date` is the real one.
        watched: at('Watched Date'),
        date: at('Date'),
    };

    for (const row of rows.slice(1)) {
        const title = (row[col.name] ?? '').trim();
        if (!title) {
            skipped++;
            continue;
        }
        // Every Letterboxd export lists films you have seen; a watchlist export
        // has no Date/Rating columns at all, which is how a backlog is spotted.
        const seen = col.watched >= 0 || col.date >= 0 || col.rating >= 0;

        items.push({
            title,
            type: typeId,
            status: seen ? 'completed' : 'backlog',
            rating: fromFiveScale(row[col.rating]),
            tags: [],
            year: toInt(row[col.year]),
            finished: isoDate(row[col.watched]) ?? isoDate(row[col.date]),
            source: (row[col.uri] ?? '').trim() || undefined,
        });
    }

    return { format: 'letterboxd', items, skipped };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Recognise and parse an export file.
 *
 * Detection is by content, not by filename: all three services hand out files
 * called `export.csv` or similar, and asking the user which service a file came
 * from is a question the file itself already answers.
 *
 * Returns null when the text isn't a supported export.
 */
export function parseImport(text: string, types: ImportTypeMap): ImportResult | null {
    if (/<myanimelist[\s>]/i.test(text)) return parseMal(text, types);

    const rows = parseCsv(text);
    if (rows.length < 2) return null;

    const header = rows[0].map((h) => h.trim().toLowerCase());
    if (header.includes('exclusive shelf')) return parseGoodreads(rows, types.book);
    if (header.includes('letterboxd uri')) return parseLetterboxd(rows, types.movie);

    return null;
}
