import type { ContentItem } from '../../../store/contentSlice';
import { progressPercent } from './progress';

/**
 * What the dashboard card should put on screen, decided away from the card.
 *
 * The widget used to work this out inline: four `useMemo`s, a status tally, two
 * sorts and a row budget, all in the same function that drew the rows. That
 * made the interesting part — which of forty items is the one to show first —
 * impossible to test and easy to change by accident while moving a `<span>`.
 *
 * The rules it encodes, in the order they matter:
 *
 *   · Nearly-finished beats barely-started. Something at 90% is one evening
 *     from leaving the shelf, and a shelf that never empties is a to-do list.
 *   · Something in progress with no measurable total still belongs there — it
 *     sorts after the measurable ones rather than being dropped, because "not
 *     tracked" is not "not being read".
 *   · An empty shelf borrows from the backlog, best-rated first. A card with
 *     nothing under way should answer "what do I start", not show whitespace.
 */

/** How the card's own numbers read, once the items have been counted. */
export interface ShelfCounts {
    total: number;
    byStatus: Record<string, number>;
    /** Mean of the ratings people actually gave, 0 when nobody has rated. */
    avgRating: number;
    /** Share of the library marked completed, 0–100. */
    completionRate: number;
    /** In-progress items whose note has not been touched in `staleDays`. */
    stalled: number;
}

export interface ContentShelf {
    /**
     * The one item the card leads with, drawn large.
     *
     * Null when nothing is under way — a spotlight on a backlog entry would be
     * telling the user to start something rather than reporting what they are
     * doing, which is a different and much pushier claim.
     */
    spotlight: ContentItem | null;
    /** Everything else in progress, in the same order. */
    continuing: ContentItem[];
    /** Best-rated backlog entries, offered when the shelf has room. */
    upNext: ContentItem[];
    counts: ShelfCounts;
}

const DAY_MS = 86_400_000;

/** Completion of an item as a 0–1 share, or null when it has no known total. */
function share(item: ContentItem): number | null {
    const pct = progressPercent({
        current: item.progressCurrent ?? 0,
        total: item.progressTotal,
    });
    return pct == null ? null : pct / 100;
}

/**
 * In-progress items, closest to done first.
 *
 * Items without a measurable total keep their relative order at the back, and
 * a stable sort is what makes that true — hence the explicit tie-break on the
 * untracked pair rather than returning zero and hoping.
 */
function byNearlyDone(items: ContentItem[]): ContentItem[] {
    return [...items].sort((a, b) => {
        const left = share(a);
        const right = share(b);
        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        return right - left;
    });
}

export function buildContentShelf(
    items: ContentItem[],
    now: number,
    opts: { staleDays: number }
): ContentShelf {
    const byStatus: Record<string, number> = {};
    let ratingSum = 0;
    let ratedCount = 0;
    let stalled = 0;

    const active: ContentItem[] = [];
    const backlog: ContentItem[] = [];

    for (const item of items) {
        byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;

        if (item.rating > 0) {
            ratingSum += item.rating;
            ratedCount++;
        }

        if (item.status === 'in-progress') {
            active.push(item);
            // The note's mtime is the honest answer to "when did I last touch
            // this", which is the whole question here — unlike `finished`,
            // where mtime moves for reasons that have nothing to do with the
            // item. See `computeContentStats` for the same distinction.
            const idle = item.updatedAt ? (now - item.updatedAt) / DAY_MS : null;
            if (idle != null && idle > opts.staleDays) stalled++;
        }

        if (item.status === 'backlog') backlog.push(item);
    }

    const ordered = byNearlyDone(active);
    const rated = [...backlog].sort((a, b) => b.rating - a.rating);

    return {
        spotlight: ordered[0] ?? null,
        continuing: ordered.slice(1),
        upNext: rated,
        counts: {
            total: items.length,
            byStatus,
            avgRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
            completionRate:
                items.length > 0 ? Math.round(((byStatus.completed ?? 0) / items.length) * 100) : 0,
            stalled,
        },
    };
}

/**
 * The rows to draw, given how many the card has room for.
 *
 * Kept apart from the shelf itself because the two questions have different
 * answers at different times: what is on the shelf depends on the library, how
 * much of it fits depends on the card, and the card is resized far more often
 * than the library changes.
 */
export function shelfRows(
    shelf: ContentShelf,
    budget: number
): { continuing: ContentItem[]; upNext: ContentItem[]; hidden: number } {
    const room = Math.max(0, budget);
    const continuing = shelf.continuing.slice(0, room);
    // Only what is left over, and only from the backlog: a suggestion must
    // never push something already under way off the card.
    const upNext = shelf.upNext.slice(0, Math.max(0, room - continuing.length));
    return { continuing, upNext, hidden: shelf.continuing.length - continuing.length };
}
