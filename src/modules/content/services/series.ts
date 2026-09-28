import type { ContentItem } from '../../../store/contentSlice';
import type { ContentStatus } from '../../../core/constants';
import { normalizeTitle } from './contentDuplicates';

/**
 * Series: the seasons, films and spin-offs of one thing, kept together.
 *
 * A series is nothing but a name every part carries in its `series` key, so it
 * lives in the notes themselves, reads in Dataview and survives any edit made
 * outside Zenith. This file groups items by that name, puts the parts in order,
 * and finds the series a library already has but nobody has named yet.
 */

/** The key parts are grouped by: the name without case, punctuation or `ё`. */
export function seriesKey(name: string): string {
    return normalizeTitle(name);
}

export interface SeriesGroup {
    key: string;
    /** The name as most of its parts spell it. */
    name: string;
    /** In series order. */
    items: ContentItem[];
}

/** Lower case, `ё` as `е`, single spaces — punctuation kept, since it separates parts. */
function fold(text: string): string {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** "2", "ТВ-2", "Season 2", "2nd Season", "Часть 2" — a bare part number after the name. */
const PART_NUMBER =
    /^(?:(?:тв|tv|season|сезон|часть|part)[\s-]*)?(\d+)(?:\s*(?:st|nd|rd|th))?(?:\s*(?:сезон|season|часть|part))?$/;

/**
 * Where a part falls among the others, from its title alone: the name itself
 * first, then the numbered sequels in number order, then everything with a
 * subtitle ("…: Alicization", "… Film") alphabetically.
 */
function partRank(title: string, name: string): [number, number, string] {
    const t = fold(title);
    const base = fold(name);
    if (!base || !t.startsWith(base)) return [2, 0, t];
    const rest = t.slice(base.length).trim();
    if (!rest) return [0, 0, ''];
    const number = rest.match(PART_NUMBER);
    if (number) return [1, Number(number[1]), ''];
    return [2, 0, rest];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * The order parts are listed in: a place set by hand (or by the source, as
 * Goodreads' "#3"), then the year, then what the titles say.
 */
export function compareParts(a: ContentItem, b: ContentItem, name: string): number {
    if (a.seriesOrder != null || b.seriesOrder != null) {
        if (a.seriesOrder == null) return 1;
        if (b.seriesOrder == null) return -1;
        if (a.seriesOrder !== b.seriesOrder) return a.seriesOrder - b.seriesOrder;
    }
    if (a.year && b.year && a.year !== b.year) return a.year - b.year;
    const [ga, na, ra] = partRank(a.title, name);
    const [gb, nb, rb] = partRank(b.title, name);
    return ga - gb || na - nb || collator.compare(ra, rb) || collator.compare(a.title, b.title);
}

/** The spelling most parts agree on; the first seen breaks a tie. */
function commonName(names: string[]): string {
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    let best = names[0];
    for (const [n, c] of counts) if (c > (counts.get(best) ?? 0)) best = n;
    return best;
}

/**
 * A part's title as its series lists it: without the series' name in front,
 * which every part repeats — "TV-2", "Alicization", not eleven lines that all
 * start "Sword Art Online:" and cut off before they differ. A title that is
 * only the name, or does not start with it, stays whole.
 */
export function partTitle(title: string, name: string): string {
    const whole = title.replace(/\s+/g, ' ').trim();
    const base = fold(name);
    if (!isPartOf(fold(whole), base)) return title;
    const rest = whole.slice(base.length).replace(/^[\s:.,;!?—–-]+/, '').trim();
    return rest || title;
}

/** Every series among `items`, by key, each with its parts in order. */
export function groupSeries(items: readonly ContentItem[]): Map<string, SeriesGroup> {
    const byKey = new Map<string, ContentItem[]>();
    for (const item of items) {
        const name = item.series?.trim();
        if (!name) continue;
        const key = seriesKey(name);
        if (!key) continue;
        const list = byKey.get(key);
        if (list) list.push(item);
        else byKey.set(key, [item]);
    }
    const groups = new Map<string, SeriesGroup>();
    for (const [key, parts] of byKey) {
        const name = commonName(parts.map((p) => p.series!.trim()));
        groups.set(key, { key, name, items: [...parts].sort((a, b) => compareParts(a, b, name)) });
    }
    return groups;
}

/** One series' parts, in order, by the series' key. */
export function partsOf(items: readonly ContentItem[], key: string): ContentItem[] {
    return groupSeries(items.filter((i) => i.series && seriesKey(i.series) === key)).get(key)?.items ?? [];
}

/** How far through a series is: how many parts are finished, of how many. */
export function seriesProgress(parts: readonly ContentItem[]): {
    done: number;
    total: number;
    byStatus: Partial<Record<ContentStatus, number>>;
} {
    const byStatus: Partial<Record<ContentStatus, number>> = {};
    for (const p of parts) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    return { done: byStatus.completed ?? 0, total: parts.length, byStatus };
}

/**
 * A name for items picked to be put together: the start their titles share,
 * cut back to a whole word and stripped of the separator after it — "Mushoku
 * Tensei" for "Mushoku Tensei 2" and "Mushoku Tensei: Eris". The series one of
 * them is already in wins, and with nothing shared the first title does.
 */
export function suggestSeriesName(items: readonly ContentItem[]): string {
    if (items.length === 0) return '';
    const named = items.find((i) => i.series?.trim());
    if (named) return named.series!.trim();

    const titles = items.map((i) => i.title.trim());
    let prefix = titles[0];
    for (const title of titles.slice(1)) {
        let n = 0;
        while (n < prefix.length && n < title.length && prefix[n].toLowerCase() === title[n].toLowerCase()) n++;
        prefix = prefix.slice(0, n);
    }
    // A prefix that ends mid-word ("Mushoku Tensei I" of "II" and "Is…") is cut
    // back to the last whole word.
    const whole = titles.every((t) => t.length === prefix.length || /[\s\p{P}]/u.test(t[prefix.length]))
        ? prefix
        : prefix.replace(/\s+\S*$/, '');
    const name = whole.replace(/[\s:.,;!?—–-]+$/u, '').trim();
    return name.length >= 2 ? name : titles[0];
}

// ── Finding series nobody has named ─────────────────────────────────────────

/** What follows a series name in the title of one of its parts. */
const PART_SEPARATOR =
    /^(?:\s*[:.,!?(/—–-]|\s+(?:\d|(?:тв|tv)[\s-]*\d|season|сезон|часть|part|фильм|movie|film|ova|ona|спецвыпуск|special|gaiden))/;

/** Shortest name that may stand for a series: two letters would match anything. */
const MIN_BASE = 3;

/** Whether `title` names a part of what `base` names: the base, then a separator. */
function isPartOf(title: string, base: string): boolean {
    return (
        base.length >= MIN_BASE &&
        title.length > base.length &&
        title.startsWith(base) &&
        PART_SEPARATOR.test(title.slice(base.length))
    );
}

/** What series-finding needs of an item — library notes and import rows alike. */
export interface SeriesCandidate {
    title: string;
    aliases?: readonly string[];
    series?: string;
    type?: string;
}

export interface SeriesProposal<T extends SeriesCandidate> {
    /** The series' name: its first part's title, or the series that part is in. */
    name: string;
    key: string;
    /** Items that would join, none of them in a series yet. */
    joining: T[];
    /** Items already in the series under that name. */
    already: T[];
}

/**
 * Series a set of items holds but has not named.
 *
 * An item is a part of another when one of its names is one of the other's
 * names followed by a separator — "Sword Art Online: Alicization" of "Sword Art
 * Online", "Noragami 2" of "Noragami", "Gintama. Film" of "Gintama". Only a
 * whole title counts as a base, so "Monster" never swallows "Monster Hunter",
 * and a series with no part named plainly after it is left for the user.
 *
 * A part whose title contains several bases goes to the outermost: "Fate/stay
 * night: Heaven's Feel 2" belongs to "Fate/stay night", along with "Heaven's
 * Feel" itself. A base already in a series brings its parts into that series.
 * Items already in a series are never moved.
 */
export function findSeries<T extends SeriesCandidate>(items: readonly T[]): SeriesProposal<T>[] {
    interface Base {
        fold: string;
        /** The series a part of this base lands in. */
        name: string;
        owner: T | null;
    }
    const bases: Base[] = [];
    const namedSeries = new Map<string, string>();

    for (const item of items) {
        const series = item.series?.trim();
        if (series) namedSeries.set(seriesKey(series), series);
        const target = series || item.title.trim();
        const title = fold(item.title);
        for (const f of [title, ...(item.aliases ?? []).map(fold)]) {
            // An alias its own title continues ("Клинок" on "Клинок,
            // рассекающий демонов") is a scrap of that title, not a base.
            if (!f || (f !== title && isPartOf(title, f))) continue;
            bases.push({ fold: f, name: target, owner: item });
        }
    }
    // A series name is a base of its own, even when no part is called just that.
    for (const name of namedSeries.values()) bases.push({ fold: fold(name), name, owner: null });

    const joins = new Map<string, { name: string; members: Set<T> }>();
    const join = (name: string, item: T) => {
        const key = seriesKey(name);
        const entry = joins.get(key) ?? { name, members: new Set<T>() };
        entry.members.add(item);
        joins.set(key, entry);
    };

    const namesOf = (item: T) => [item.title, ...(item.aliases ?? [])].map(fold).filter(Boolean);
    const basesOf = (item: T) => {
        const names = namesOf(item);
        return bases.filter((b) => b.owner !== item && names.some((n) => isPartOf(n, b.fold)));
    };

    // Parts are told from roots first. Exports list a series' own name among a
    // part's alternative titles ("Kimetsu no Yaiba" on "…: Swordsmith Village"),
    // which makes that part look like a base as good as the first season; a
    // part is only ever a base when no root of the same name is there.
    const isPart = new Map<T, boolean>(items.map((i) => [i, basesOf(i).length > 0]));

    /**
     * The base a part belongs under: the outermost; between bases of one name,
     * a root over a part, then one of the part's own type (the anime over the
     * manga of the same title).
     */
    const rank = (base: Base, item: T): [number, number, number] => [
        base.fold.length,
        base.owner && isPart.get(base.owner) ? 1 : 0,
        base.owner?.type === item.type ? 0 : 1,
    ];
    const bestOf = new Map<T, Base>();
    for (const item of items) {
        if (item.series?.trim()) continue;
        let best: Base | null = null;
        let bestRank: [number, number, number] | null = null;
        for (const base of basesOf(item)) {
            const r = rank(base, item);
            if (!bestRank || (r[0] - bestRank[0] || r[1] - bestRank[1] || r[2] - bestRank[2]) < 0) {
                best = base;
                bestRank = r;
            }
        }
        if (best) bestOf.set(item, best);
    }

    for (const [item, first] of bestOf) {
        // Up to the root: a base that is itself a part leads to its own base.
        let base = first;
        const seen = new Set<T>([item]);
        while (base.owner && !base.owner.series?.trim() && bestOf.has(base.owner) && !seen.has(base.owner)) {
            seen.add(base.owner);
            base = bestOf.get(base.owner)!;
        }
        // The root's own series, when it has one — else the root names it.
        const outer = base.owner?.series?.trim() || base.name;
        join(outer, item);
        if (base.owner && !base.owner.series?.trim()) join(outer, base.owner);
    }

    const proposals: SeriesProposal<T>[] = [];
    for (const [key, { name, members }] of joins) {
        const already = items.filter((i) => i.series?.trim() && seriesKey(i.series) === key);
        // In the order they were given, not the order they were found in.
        const joining = items.filter((i) => members.has(i) && !i.series?.trim());
        if (joining.length === 0 || joining.length + already.length < 2) continue;
        proposals.push({ name: namedSeries.get(key) ?? name, key, joining, already });
    }
    return proposals.sort((a, b) => collator.compare(a.name, b.name));
}
