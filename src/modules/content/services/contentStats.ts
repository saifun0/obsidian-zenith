import type { ContentItem } from '../../../store/contentSlice';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { readingDurations } from './readings';

/**
 * Statistics for the content library. Pure — no Obsidian, no `Date.now` — so
 * it's unit-testable and the view just renders what it returns.
 *
 * "Finished recently", "finished by month" and "how long it took" come only
 * from the item's own `started` / `finished` dates, stamped on the status
 * change. The file's mtime used to stand in where there was no date, and it
 * made an import of a hundred watched titles read as a hundred finished this
 * month: an item with no finish date is finished, just not at a known time.
 *
 * "Gone quiet" is the one metric mtime is genuinely right for: the question
 * there *is* "when was this note last touched".
 */

export interface GenreCount {
    genre: string;
    count: number;
}

export interface MonthCount {
    /** `YYYY-MM`. */
    month: string;
    count: number;
}

export interface ContentStatsResult {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    avgRating: number;
    /** Items in progress now. */
    inProgress: number;
    /** Completed items whose finish date is within the last `staleDays` days. */
    finishedRecently: number;
    /** In-progress items untouched for `staleDays`, most neglected first. */
    stalled: ContentItem[];
    /**
     * Mean days a finished reading took, over every reading that records both
     * ends — each re-read on its own, so a book read again seven years later
     * is two readings of a few weeks, not one of seven years. Null until at
     * least one item has been tracked end to end.
     */
    avgDaysToFinish: number | null;
    topGenres: GenreCount[];
    /**
     * Items finished in each of the last twelve months, this one included,
     * oldest first — every month present, so a quiet one reads as a gap.
     */
    finishedByMonth: MonthCount[];
}

/** `YYYY-MM` of a local date. */
function monthOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The last `count` months up to the one `now` falls in, oldest first. */
export function lastMonths(now: number, count = 12): string[] {
    const today = new Date(now);
    const out: string[] = [];
    for (let back = count - 1; back >= 0; back--) {
        out.push(monthOf(new Date(today.getFullYear(), today.getMonth() - back, 1)));
    }
    return out;
}

const DAY_MS = 86_400_000;

/** How long an in-progress item may sit untouched before it counts as stalled. */
export const STALE_DAYS = 30;

export function computeContentStats(
    items: ContentItem[],
    now: number,
    staleDays: number = STALE_DAYS
): ContentStatsResult {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const genres = new Map<string, number>();
    const window = lastMonths(now);
    const months = new Map<string, number>(window.map((m) => [m, 0]));

    let ratingSum = 0;
    let ratedCount = 0;
    let finishedRecently = 0;
    const durations: number[] = [];
    const stalled: ContentItem[] = [];

    /** The oldest `finished` date that still counts as recent. */
    const recentCutoff = toLocalIsoDate(new Date(now - staleDays * DAY_MS));

    for (const item of items) {
        byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
        byType[item.type] = (byType[item.type] ?? 0) + 1;

        if (item.rating > 0) {
            ratingSum += item.rating;
            ratedCount++;
        }

        for (const g of item.genres ?? []) {
            const key = g.trim();
            if (key) genres.set(key, (genres.get(key) ?? 0) + 1);
        }

        if (item.status === 'completed') {
            if (item.finished) {
                if (item.finished >= recentCutoff) finishedRecently++;
                const month = item.finished.slice(0, 7);
                if (months.has(month)) months.set(month, (months.get(month) ?? 0) + 1);
            }
            durations.push(...readingDurations(item));
        }

        // Only what is running can go quiet: something put on hold was
        // stopped on purpose, and saying so again is not news.
        if (item.status === 'in-progress') {
            const idleDays = item.updatedAt ? (now - item.updatedAt) / DAY_MS : null;
            if (idleDays != null && idleDays > staleDays) stalled.push(item);
        }
    }

    stalled.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

    return {
        total: items.length,
        byStatus,
        byType,
        avgRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
        inProgress: byStatus['in-progress'] ?? 0,
        finishedRecently,
        stalled,
        avgDaysToFinish:
            durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        topGenres: [...genres.entries()]
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
            .slice(0, 8),
        finishedByMonth: window.map((month) => ({ month, count: months.get(month) ?? 0 })),
    };
}
