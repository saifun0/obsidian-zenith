import type { ContentItem } from '../../../store/contentSlice';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { finishedReadings, readingDurations } from './readings';
import { progressPercent } from './progress';

/**
 * Statistics for the content library. Pure — no Obsidian, no `Date.now` — so
 * it's unit-testable and the view just renders what it returns.
 *
 * "Finished recently" and "how long it took" come from the item's own
 * `started` / `finished` dates, which are stamped on the status change. Items
 * predating those dates fall back to the file's mtime, which is only a proxy —
 * it moves whenever the note is edited for any reason — so the fallback is
 * used and never preferred.
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
    /** Percentage of items marked completed, 0–100. */
    completionRate: number;
    /** Completed items finished within the last `staleDays` days. */
    finishedRecently: number;
    /** In-progress items untouched for `staleDays`, most neglected first. */
    stalled: ContentItem[];
    /** Mean completion of everything in progress that has a known total, 0–100. */
    averageProgress: number | null;
    /**
     * Mean days a finished reading took, over every reading that records both
     * ends — each re-read on its own, so a book read again seven years later
     * is two readings of a few weeks, not one of seven years. Null until at
     * least one item has been tracked end to end.
     */
    avgDaysToFinish: number | null;
    /** Items finished more than once. */
    reread: number;
    topGenres: GenreCount[];
    /** Items added per month, oldest first — only months that have any. */
    addedByMonth: MonthCount[];
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
    const months = new Map<string, number>();

    let ratingSum = 0;
    let ratedCount = 0;
    let finishedRecently = 0;
    const progressValues: number[] = [];
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

        if (item.createdAt) {
            const d = new Date(item.createdAt);
            const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months.set(month, (months.get(month) ?? 0) + 1);
        }

        const idleDays = item.updatedAt ? (now - item.updatedAt) / DAY_MS : null;

        if (item.status === 'completed') {
            // A recorded finish date is the answer; mtime is only consulted for
            // items old enough not to have one, and is ignored the moment a
            // real date exists — otherwise editing a note would keep declaring
            // a book you read two years ago as "finished this month".
            if (item.finished) {
                if (item.finished >= recentCutoff) finishedRecently++;
            } else if (idleDays != null && idleDays <= staleDays) {
                finishedRecently++;
            }

            durations.push(...readingDurations(item));
        }

        if (item.status === 'in-progress') {
            const pct = progressPercent({
                current: item.progressCurrent ?? 0,
                total: item.progressTotal,
            });
            if (pct != null) progressValues.push(pct);
            if (idleDays != null && idleDays > staleDays) stalled.push(item);
        }
    }

    const reread = items.filter((item) => finishedReadings(item) > 1).length;

    stalled.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

    return {
        total: items.length,
        byStatus,
        byType,
        avgRating: ratedCount > 0 ? ratingSum / ratedCount : 0,
        completionRate:
            items.length > 0 ? Math.round(((byStatus.completed ?? 0) / items.length) * 100) : 0,
        finishedRecently,
        stalled,
        averageProgress:
            progressValues.length > 0
                ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length
                : null,
        avgDaysToFinish:
            durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
        reread,
        topGenres: [...genres.entries()]
            .map(([genre, count]) => ({ genre, count }))
            .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
            .slice(0, 8),
        addedByMonth: [...months.entries()]
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => a.month.localeCompare(b.month)),
    };
}
