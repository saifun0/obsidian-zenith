import type { ContentStatus } from '../../../core/constants';
import type { ContentItem } from '../../../store/contentSlice';
import { findSameItem } from './contentDuplicates';
import type { NewContentInput } from './contentWriter';
import { findSeries, seriesKey } from './series';

/**
 * Import a library from the services people already keep one in.
 *
 * MyAnimeList, Goodreads, Letterboxd and Anixart all hand out a plain export
 * file, and
 * re-typing several hundred entries by hand is the difference between trying
 * this plugin and using it. Everything here is pure text-in / objects-out — no
 * Obsidian, no network — so the formats are unit-testable and the caller stays
 * responsible for writing notes.
 *
 * Nothing is fetched: an import brings across what the export actually contains
 * (title, score, status, progress, dates) and nothing more. The services' own
 * ids and links stay behind — the library does not point back at them.
 */

export type ImportFormat = 'mal' | 'goodreads' | 'letterboxd' | 'anixart';

export interface ImportedItem extends NewContentInput {
    /** `YYYY-MM-DD`, when the export records it. */
    started?: string;
    finished?: string;
    /**
     * Names the entry is recognised by and nothing more — the title as the
     * export wrote it, before a series was taken out of it — so a library
     * imported by an older version still knows it. Never written to the note.
     */
    knownAs?: string[];
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
    // "On-Hold" is a paused thing, not an abandoned one, and the library has
    // a status for exactly that.
    'on-hold': 'on-hold',
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

    const sections: { tag: string; typeId: string; titleTag: string; totalTag: string; doneTag: string }[] = [
        { tag: 'anime', typeId: types.anime, titleTag: 'series_title', totalTag: 'series_episodes', doneTag: 'my_watched_episodes' },
        { tag: 'manga', typeId: types.manga, titleTag: 'manga_title', totalTag: 'manga_chapters', doneTag: 'my_read_chapters' },
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

            items.push({
                title,
                type: s.typeId,
                status,
                rating: Math.min(10, score),
                tags: [],
                ...completedProgress(status, toInt(xmlValue(block, s.doneTag)), toInt(xmlValue(block, s.totalTag))),
                started: isoDate(xmlValue(block, 'my_start_date')),
                finished: isoDate(xmlValue(block, 'my_finish_date')),
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

/**
 * Goodreads writes a book's series into its title: "The Name of the Wind (The
 * Kingkiller Chronicle, #1)". Taken out, the title is the book's own and the
 * series and its number become the book's place in it. A book in several
 * series ("Discworld, #1; Rincewind #1") goes into the first; an omnibus
 * ("#1-3") takes its first number.
 */
export function splitGoodreadsTitle(raw: string): { title: string; series?: string; order?: number } {
    const m = raw.match(
        /^(.*\S)\s*\(([^()#]*?),?\s*#(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?(?:\s*;[^()]*)?\)\s*$/
    );
    if (!m || !m[2].trim()) return { title: raw.trim() };
    return { title: m[1].trim(), series: m[2].trim(), order: Number(m[3]) };
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
    };

    for (const row of rows.slice(1)) {
        const raw = (row[col.title] ?? '').trim();
        if (!raw) {
            skipped++;
            continue;
        }
        const { title, series, order } = splitGoodreadsTitle(raw);
        const status = GOODREADS_STATUS[(row[col.shelf] ?? '').trim().toLowerCase()] ?? 'backlog';
        const finished = isoDate(row[col.dateRead]);

        items.push({
            title,
            series,
            seriesOrder: order,
            knownAs: series ? [raw] : undefined,
            type: typeId,
            status,
            rating: fromFiveScale(row[col.rating]),
            tags: [],
            creator: (row[col.author] ?? '').trim() || undefined,
            year: toInt(row[col.year]) ?? toInt(row[col.yearFallback]),
            ...completedProgress(status, undefined, toInt(row[col.pages])),
            finished,
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
        });
    }

    return { format: 'letterboxd', items, skipped };
}

// ── Anixart ──────────────────────────────────────────────────────────────────

/**
 * Anixart's bookmarks export: a Russian title, the original one, alternative
 * names, whether it is a favourite, and one of five statuses — nothing about
 * episodes, dates, scores or covers.
 *
 * Every entry is anime; the export does not say which are films. The Russian
 * title is the entry's name, and the original and alternative titles become
 * its aliases, so the library knows it by all of them.
 */
const ANIXART_STATUS: Record<string, ContentStatus> = {
    'смотрю': 'in-progress',
    'в планах': 'backlog',
    'просмотрено': 'completed',
    'отложено': 'on-hold',
    'не смотрю': 'dropped',
    'брошено': 'dropped',
};

/** What Anixart writes in a name column that has nothing in it. */
const ANIXART_NONE = 'не указаны';

/**
 * Anixart's alternative names, one list joined by commas — commas that also
 * occur inside the names ("Клинок, рассекающий демонов: …"). A piece that
 * starts in lower case is the rest of the name before it, not a name of its own.
 */
function splitAnixartNames(list: string): string[] {
    const names: string[] = [];
    for (const piece of list.split(',')) {
        const text = piece.trim();
        if (!text) continue;
        if (names.length > 0 && /^\p{Ll}/u.test(text)) names[names.length - 1] += `, ${text}`;
        else names.push(text);
    }
    return names;
}

function parseAnixart(rows: string[][], typeId: string): ImportResult {
    const at = columnIndex(rows[0]);
    const col = {
        ru: at('Русское название'),
        original: at('Оригинальное название'),
        other: at('Альтернативные названия'),
        favorite: at('Добавлено в избранное'),
        status: at('Статус просмотра'),
    };
    const items: ImportedItem[] = [];
    let skipped = 0;

    for (const row of rows.slice(1)) {
        const ru = (row[col.ru] ?? '').trim();
        const original = (row[col.original] ?? '').trim();
        const title = ru || original;
        if (!title) {
            skipped++;
            continue;
        }

        const other = (row[col.other] ?? '').trim();
        const names = [original, ...(other.toLowerCase() === ANIXART_NONE ? [] : splitAnixartNames(other))]
            .map((n) => n.trim())
            .filter(Boolean);
        // Each other name once, and never the title again.
        const seen = new Set([title.toLowerCase()]);
        const aliases = names.filter((n) => {
            const key = n.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        items.push({
            title,
            type: typeId,
            status: ANIXART_STATUS[(row[col.status] ?? '').trim().toLowerCase()] ?? 'backlog',
            rating: 0,
            tags: [],
            aliases: aliases.length > 0 ? aliases : undefined,
            favorite: (row[col.favorite] ?? '').trim().toLowerCase() === 'добавлено',
        });
    }

    return { format: 'anixart', items, skipped };
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
    if (header.includes('русское название') && header.includes('статус просмотра')) {
        return parseAnixart(rows, types.anime);
    }

    return null;
}

// ── What an import would do ──────────────────────────────────────────────────

/** An entry that is already in the library, and what the export says differently. */
export interface ImportUpdate {
    item: ContentItem;
    entry: ImportedItem;
    /** The export's status, when it differs from the library's. */
    status?: ContentStatus;
    /** The export's favourite mark, when it differs (and the export has one). */
    favorite?: boolean;
    /**
     * The status would move back — "watched" to "watching". The library is
     * the likelier to be right about that, so it waits for a tick of its own.
     */
    backward: boolean;
}

export interface ImportPlan {
    create: ImportedItem[];
    update: ImportUpdate[];
    /** Entries already in the library exactly as the export has them. */
    same: number;
}

/** How far along a status is. On hold is as far along as in progress. */
const STAGE: Record<ContentStatus, number> = {
    backlog: 0,
    'in-progress': 1,
    'on-hold': 1,
    completed: 2,
    dropped: 2,
};

/**
 * Sort an import into what to create, what to update and what is already so.
 *
 * An entry is the library's item when any of its names is any of the item's —
 * so a second export tops the library up and moves statuses on, rather than
 * adding every title again. Only the status and the favourite mark are ever
 * taken from the export for an existing item; a score, progress or notes kept
 * in Zenith are the library's own.
 */
export function planImport(result: ImportResult, library: ContentItem[]): ImportPlan {
    const plan: ImportPlan = { create: [], update: [], same: 0 };
    for (const entry of result.items) {
        const item = findSameItem(library, [entry.title, ...(entry.aliases ?? []), ...(entry.knownAs ?? [])]);
        if (!item) {
            plan.create.push(entry);
            continue;
        }
        const status = entry.status !== item.status ? entry.status : undefined;
        // Only a source that records favourites can say one was removed.
        const favorite =
            result.format === 'anixart' && !!entry.favorite !== !!item.favorite
                ? !!entry.favorite
                : undefined;
        if (status === undefined && favorite === undefined) {
            plan.same++;
            continue;
        }
        plan.update.push({
            item,
            entry,
            status,
            favorite,
            backward: status !== undefined && STAGE[status] < STAGE[item.status],
        });
    }
    return plan;
}

// ── Series an import brings ─────────────────────────────────────────────────

export interface ImportSeries {
    /** The series each new entry goes into, by its place in `plan.create`. */
    assign: Map<number, { series: string; seriesOrder?: number }>;
    /** Library items without a series that a new entry is a part of, or the base of. */
    join: { item: ContentItem; series: string }[];
    /** How many series all that makes or adds to. */
    count: number;
}

/**
 * The series the new entries of an import fall into — the ones the export
 * names (Goodreads) and the ones their titles show, among themselves and with
 * what the library already has. A series made only of items already in the
 * library is not the import's business; "Find series" is for that.
 */
export function planImportSeries(plan: ImportPlan, library: ContentItem[]): ImportSeries {
    const assign: ImportSeries['assign'] = new Map();
    const join: ImportSeries['join'] = [];
    const names = new Set<string>();

    plan.create.forEach((entry, index) => {
        if (entry.series?.trim()) {
            assign.set(index, { series: entry.series.trim(), seriesOrder: entry.seriesOrder });
            names.add(seriesKey(entry.series));
        }
    });

    type Candidate = { title: string; aliases?: string[]; series?: string; type?: string; index?: number; item?: ContentItem };
    const candidates: Candidate[] = [
        ...library.map((item) => ({ title: item.title, aliases: item.aliases, series: item.series, type: item.type, item })),
        ...plan.create.map((entry, index) => ({
            title: entry.title,
            aliases: entry.aliases,
            series: assign.get(index)?.series,
            type: entry.type,
            index,
        })),
    ];
    for (const proposal of findSeries(candidates)) {
        if (!proposal.joining.some((c) => c.index !== undefined)) continue;
        names.add(proposal.key);
        for (const c of proposal.joining) {
            if (c.index !== undefined) assign.set(c.index, { series: proposal.name });
            else if (c.item) join.push({ item: c.item, series: proposal.name });
        }
    }
    return { assign, join, count: names.size };
}
