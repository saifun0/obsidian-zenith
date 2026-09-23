import type { Translator } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { trackerHistory } from '../services/journalStats';
/**
 * The share of the window the tracker was recorded on, 0-1 and safe to print.
 *
 * Every kind of tracker has a rate, and it is the one quantity all three can be
 * asked for without the answer changing meaning. An average out of five and a
 * sum of repetitions do not share a scale; "written down on eleven days of
 * thirty" does.
 *
 * Clamped rather than trusted: the window and the count come from parsing
 * notes, and a day counted twice would otherwise report 103%.
 */
export function clampRate(rate: number): number {
    if (!Number.isFinite(rate)) return 0;
    return Math.min(1, Math.max(0, rate));
}

/**
 * One tracker's window, read as figures rather than as a shape: how much of it
 * was recorded, how long the current run is, how stale the last mark is. The
 * habit card puts these on each row's tooltip.
 */
export interface TrackerWindow {
    /** Days of the window the tracker was recorded on. */
    days: number;
    windowDays: number;
    /** Recorded share of the window, 0–100, rounded and safe to print. */
    percent: number;
    /** Consecutive recorded days ending at the window's last day. */
    currentRun: number;
    /** The longest such run anywhere in the window. */
    bestRun: number;
    /** Days since the last recorded one — 0 is today, null is never. */
    sinceLast: number | null;
    /** The same, in words: "today" / "3 d ago" / "never". */
    lastMark: string;
}

/** "today" / "3 d ago" / "never" — how stale the tracker is, in words. */
export function staleness(sinceLast: number | null, t: Translator): string {
    if (sinceLast === null) return t('journal.stats.never');
    if (sinceLast === 0) return t('journal.stats.today');
    return t('journal.stats.daysAgo', { count: sinceLast });
}

export function trackerWindow(stat: TrackerStat, t: Translator): TrackerWindow {
    const history = trackerHistory(stat.series);

    return {
        days: stat.days,
        windowDays: stat.windowDays,
        percent: Math.round(clampRate(stat.rate) * 100),
        currentRun: history.currentRun,
        bestRun: history.bestRun,
        sinceLast: history.sinceLast,
        lastMark: staleness(history.sinceLast, t),
    };
}
