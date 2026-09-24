import { EXACT, normalize, scoreTexts } from './match';
import { pickBoost, recentIds, type Recents } from './recents';
import type { SearchCreateRow, SearchCreator, SearchItem } from './searchSources';

/**
 * From a query and what every source offers, to the groups the panel shows.
 *
 * Pure — the sources' items are read by the caller — so the order of results,
 * which is the whole of what the panel does, is tested without a DOM.
 *
 * - An empty query shows what was picked last.
 * - A query that starts with a creator's keyword ("проект Ремонт") offers to
 *   create that, first, and searches that source for the rest — unless one
 *   by exactly that name is there already, which then comes first, so Enter
 *   opens it rather than making a second.
 * - Anything else is searched everywhere. Each group keeps its best few, and
 *   the group with the best match goes first. The default creator's row ("+
 *   Task") comes first when nothing matched well, and last when something did.
 * - `#tag` keeps only rows with a tag that starts so.
 */

/** A source, read: its heading resolved and its items fetched. */
export interface ReadSource {
    id: string;
    label: string;
    icon?: string;
    items: readonly SearchItem[];
    /** What its `suggest` offered for this query. */
    suggested: readonly SearchItem[];
    creators: readonly SearchCreator[];
}

export type ResultRow =
    | { kind: 'item'; item: SearchItem; icon?: string; score: number }
    | { kind: 'create'; row: SearchCreateRow };

export interface ResultGroup {
    /** A source's id, `recent`, or `create`. */
    id: string;
    /** Empty for the create row, which needs no heading. */
    label: string;
    rows: ResultRow[];
}

export interface RankOptions {
    query: string;
    sources: readonly ReadSource[];
    recents: Recents;
    now: number;
    /** Heading of the recent picks. */
    recentLabel: string;
    /** Rows per group. */
    perGroup?: number;
    /** Recent picks shown for an empty query. */
    recentCount?: number;
}

export const PER_GROUP = 5;
export const RECENT_COUNT = 7;

/** A match this good means "found it": the create row then goes last. */
export const STRONG = 0.8;

/** How much less a tag match counts than a title match. */
const TAG_WEIGHT = 0.8;

/** A row a source suggested for the query itself, like a date's note. */
const SUGGESTED = 1;

function scoreItem(item: SearchItem, query: string): number {
    const title = scoreTexts(query, [item.title, ...(item.aliases ?? [])]);
    const tags = item.tags?.length ? scoreTexts(query, item.tags) * TAG_WEIGHT : 0;
    return Math.max(title, tags);
}

/** `#tag rest` → the tag, and the rest of the query. */
function tagQuery(query: string): { tag: string; rest: string } | null {
    const m = /^#(\S+)\s*(.*)$/.exec(query.trim());
    if (!m) return null;
    return { tag: normalize(m[1]), rest: m[2].trim() };
}

/** The keyword creator the line starts with, and the rest of the line. */
function keywordCreator(
    query: string,
    sources: readonly ReadSource[]
): { source: ReadSource; creator: SearchCreator; rest: string } | null {
    const q = normalize(query);
    let best: { source: ReadSource; creator: SearchCreator; rest: string; len: number } | null =
        null;
    for (const source of sources) {
        for (const creator of source.creators) {
            for (const keyword of creator.keywords ?? []) {
                const k = normalize(keyword);
                if (!k || !q.startsWith(`${k} `)) continue;
                // The longest wins: a type called "board game" over "board".
                if (best && best.len >= k.length) continue;
                const rest = query.trim().slice(keyword.trim().length).trim();
                if (rest) best = { source, creator, rest, len: k.length };
            }
        }
    }
    return best;
}

/** Match `query` against a source's items, best first, at most `limit`. */
function matchSource(
    source: ReadSource,
    query: string,
    opts: RankOptions,
    tag: { tag: string; rest: string } | null
): ResultRow[] {
    const rows: ResultRow[] = [];
    for (const item of source.suggested) {
        rows.push({ kind: 'item', item, icon: item.icon ?? source.icon, score: SUGGESTED });
    }
    for (const item of source.items) {
        let score: number;
        if (tag) {
            const tagged = item.tags?.some((t) => normalize(t).startsWith(tag.tag));
            if (!tagged) continue;
            score = tag.rest ? scoreTexts(tag.rest, [item.title, ...(item.aliases ?? [])]) : 1;
        } else {
            score = scoreItem(item, query);
        }
        if (score <= 0) continue;
        score += pickBoost(opts.recents[item.id], opts.now);
        rows.push({ kind: 'item', item, icon: item.icon ?? source.icon, score });
    }
    rows.sort((a, b) => (b.kind === 'item' ? b.score : 0) - (a.kind === 'item' ? a.score : 0));
    return rows.slice(0, opts.perGroup ?? PER_GROUP);
}

function best(group: ResultGroup): number {
    const first = group.rows[0];
    return first?.kind === 'item' ? first.score : 0;
}

/** The last picks that still exist, as one group. */
function recentGroup(opts: RankOptions): ResultGroup[] {
    const byId = new Map<string, { item: SearchItem; icon?: string }>();
    for (const source of opts.sources) {
        for (const item of source.items) {
            if (!item.transient) byId.set(item.id, { item, icon: item.icon ?? source.icon });
        }
    }
    const rows: ResultRow[] = [];
    for (const id of recentIds(opts.recents)) {
        const found = byId.get(id);
        if (!found) continue;
        rows.push({ kind: 'item', item: found.item, icon: found.icon, score: 0 });
        if (rows.length >= (opts.recentCount ?? RECENT_COUNT)) break;
    }
    return rows.length ? [{ id: 'recent', label: opts.recentLabel, rows }] : [];
}

export function rankResults(opts: RankOptions): ResultGroup[] {
    const query = opts.query.trim();
    if (!query) return recentGroup(opts);

    // "проект Ремонт": the project first, then projects like "Ремонт".
    const keyword = keywordCreator(query, opts.sources);
    if (keyword) {
        const groups: ResultGroup[] = [];
        const found = matchSource(keyword.source, keyword.rest, opts, null);
        if (found.length) {
            groups.push({ id: keyword.source.id, label: keyword.source.label, rows: found });
        }
        const row = keyword.creator.row(keyword.rest);
        if (row) {
            const create: ResultGroup = {
                id: 'create',
                label: '',
                rows: [{ kind: 'create', row }],
            };
            const exists = groups.length > 0 && best(groups[0]) >= EXACT;
            if (exists) groups.push(create);
            else groups.unshift(create);
        }
        return groups;
    }

    const tag = tagQuery(query);
    const groups: ResultGroup[] = [];
    for (const source of opts.sources) {
        const rows = matchSource(source, query, opts, tag);
        if (rows.length) groups.push({ id: source.id, label: source.label, rows });
    }
    // Stable: equal groups keep the sources' own order.
    groups.sort((a, b) => best(b) - best(a));

    const fallback = opts.sources
        .flatMap((s) => s.creators)
        .find((c) => !c.keywords?.length)
        ?.row(query);
    if (fallback) {
        const create: ResultGroup = {
            id: 'create',
            label: '',
            rows: [{ kind: 'create', row: fallback }],
        };
        const found = groups.length > 0 && best(groups[0]) >= STRONG;
        if (found) groups.push(create);
        else groups.unshift(create);
    }
    return groups;
}

/** Every row in the order the arrow keys walk them. */
export function flatRows(groups: readonly ResultGroup[]): ResultRow[] {
    return groups.flatMap((g) => g.rows);
}
