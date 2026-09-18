import type { JournalEntry, TrackerValue } from '../../../store/journalSlice';
import { coerceTrackerValue, SCALE_MAX, type JournalTracker } from '../../../core/journalConfig';
import { addDays } from './journalDates';

/** Entries indexed by their date, for O(1) calendar lookups. */
export function entriesByDate(entries: JournalEntry[]): Map<string, JournalEntry> {
    const map = new Map<string, JournalEntry>();
    for (const entry of entries) {
        // Two files claiming the same day (a rename mid-sync, a duplicate under a
        // changed pattern) — keep the one edited most recently.
        const existing = map.get(entry.date);
        if (!existing || entry.mtime > existing.mtime) map.set(entry.date, entry);
    }
    return map;
}

/**
 * A day "counts" for a streak when its note exists and has something in it.
 *
 * An empty note created by clicking through the calendar isn't a journalled
 * day, and counting it would let the streak — the one number people actually
 * care about — be gamed by navigation.
 */
export function isJournalled(entry: JournalEntry | undefined): boolean {
    if (!entry) return false;
    return entry.words > 0 || Object.keys(entry.values).length > 0;
}

/**
 * Consecutive journalled days ending today.
 *
 * Today not being written yet doesn't break the streak — the day isn't over.
 * So an unwritten today falls back to counting from yesterday; two blank days
 * in a row is what ends it.
 */
export function currentStreak(byDate: Map<string, JournalEntry>, today: string): number {
    let cursor = isJournalled(byDate.get(today)) ? today : addDays(today, -1);
    let streak = 0;
    while (isJournalled(byDate.get(cursor))) {
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
}

/** The longest run of consecutive journalled days on record. */
export function longestStreak(byDate: Map<string, JournalEntry>): number {
    const days = [...byDate.entries()]
        .filter(([, entry]) => isJournalled(entry))
        .map(([date]) => date)
        .sort();

    let best = 0;
    let run = 0;
    let previous: string | null = null;
    for (const day of days) {
        run = previous && addDays(previous, 1) === day ? run + 1 : 1;
        if (run > best) best = run;
        previous = day;
    }
    return best;
}

/** One day of a tracker's history. `null` = the day recorded nothing. */
export interface TrackerPoint {
    date: string;
    value: number | null;
}

/** How one tracker's window reads as a rhythm rather than as a total. */
export interface TrackerHistory {
    /** Consecutive recorded days ending at the window's last day. */
    currentRun: number;
    /** The longest run of consecutive recorded days anywhere in the window. */
    bestRun: number;
    /** Days since the last recorded one — 0 is today, null is never. */
    sinceLast: number | null;
}

/**
 * The three things a coverage figure cannot say.
 *
 * "Eleven days of thirty" is the same number whether they were eleven in a row
 * or one every third day, and the same again whether the last of them was this
 * morning or three weeks ago. These are what tell those cases apart, and they
 * come out of one pass over the series because they are three readings of the
 * same thing.
 *
 * `currentRun` forgives an unwritten today for the same reason `currentStreak`
 * does: the day is not over. Two blank days in a row is what ends a run.
 */
export function trackerHistory(series: TrackerPoint[]): TrackerHistory {
    let bestRun = 0;
    let run = 0;
    for (const point of series) {
        run = point.value === null ? 0 : run + 1;
        if (run > bestRun) bestRun = run;
    }

    let sinceLast: number | null = null;
    for (let i = series.length - 1; i >= 0; i--) {
        if (series[i].value !== null) {
            sinceLast = series.length - 1 - i;
            break;
        }
    }

    let cursor = series.length - 1;
    if (cursor >= 0 && series[cursor].value === null) cursor--;
    let currentRun = 0;
    while (cursor >= 0 && series[cursor].value !== null) {
        currentRun++;
        cursor--;
    }

    return { currentRun, bestRun, sinceLast };
}

export interface TrackerStat {
    tracker: JournalTracker;
    /** Length of the window, repeated here so a row can render standalone. */
    windowDays: number;
    /** Days in the window that recorded a value at all. */
    days: number;
    /** `check`: days ticked. `number`: the sum. `scale`: days scored. */
    total: number;
    /** `scale` / `number`: mean over the days that recorded. Null if none did. */
    average: number | null;
    /** Share of the whole window the tracker was recorded on, 0–1. */
    rate: number;
    /** One point per day of the window, oldest first. */
    series: TrackerPoint[];
    /** The value a full bar represents, for drawing the series. */
    scaleMax: number;
}

export interface JournalStatsResult {
    /** Journalled days, all time. */
    total: number;
    /** Journalled days within the window. */
    inRange: number;
    /** Length of the window, in days. */
    windowDays: number;
    currentStreak: number;
    longestStreak: number;
    /** Words written within the window. */
    words: number;
    /**
     * The most recent journalled day, all time, or null if there is none.
     *
     * "How long since I wrote anything" is the question a coverage figure of
     * 3/30 immediately raises, and a count can't answer it — three entries last
     * week and three from a month ago give the same 3.
     */
    lastEntryDate: string | null;
    /**
     * Every journalled day, all time. The coverage strip needs day-level lookup
     * rather than a count — "which days" is the whole point of drawing it.
     */
    filledDates: Set<string>;
    /** One entry per configured tracker, in configuration order. */
    trackers: TrackerStat[];
}

/** The numeric height a value should draw at, or null when unrecorded. */
function numericValue(tracker: JournalTracker, raw: TrackerValue | undefined): number | null {
    const value = coerceTrackerValue(tracker.kind, raw);
    if (value === undefined) return null;
    return typeof value === 'boolean' ? 1 : value;
}

/**
 * Summarise the journal over a trailing window ending today.
 *
 * Averages skip the days that recorded nothing rather than treating them as a
 * zero: a month with three cheerful entries averages "cheerful", not "mostly
 * absent" — the number of days behind each average is reported next to it, and
 * honestly.
 */
export function journalStats(
    entries: JournalEntry[],
    trackers: JournalTracker[],
    today: string,
    windowDays = 30
): JournalStatsResult {
    const byDate = entriesByDate(entries);

    const window: string[] = [];
    for (let i = windowDays - 1; i >= 0; i--) window.push(addDays(today, -i));

    const windowEntries = window
        .map((date) => byDate.get(date))
        .filter((e): e is JournalEntry => isJournalled(e));

    const trackerStats: TrackerStat[] = trackers.map((tracker) => {
        const series: TrackerPoint[] = window.map((date) => ({
            date,
            value: numericValue(tracker, byDate.get(date)?.values[tracker.id]),
        }));

        const recorded = series
            .map((p) => p.value)
            .filter((v): v is number => v !== null);

        const sum = recorded.reduce((acc, v) => acc + v, 0);
        const days = recorded.length;

        // A `check` tracker's "total" is the count of ticked days, which is the
        // same as its sum of ones — but calling it a sum would invite a
        // meaningless average of 1.0 next to it, so scales and numbers get the
        // average and checks get the rate.
        const average = tracker.kind === 'check' || days === 0 ? null : sum / days;

        const scaleMax =
            tracker.kind === 'scale'
                ? SCALE_MAX
                : tracker.kind === 'check'
                  ? 1
                  : Math.max(tracker.max ?? 0, ...recorded, 1);

        return {
            tracker,
            windowDays,
            days,
            total: tracker.kind === 'number' ? sum : days,
            average,
            rate: windowDays > 0 ? days / windowDays : 0,
            series,
            scaleMax,
        };
    });

    // All time, not just the window: an empty window is exactly when "when did
    // I last write?" matters most, and answering "—" there would be useless.
    let lastEntryDate: string | null = null;
    const filledDates = new Set<string>();
    for (const [date, entry] of byDate) {
        if (!isJournalled(entry)) continue;
        filledDates.add(date);
        if (lastEntryDate === null || date > lastEntryDate) lastEntryDate = date;
    }

    return {
        total: [...byDate.values()].filter(isJournalled).length,
        inRange: windowEntries.length,
        windowDays,
        currentStreak: currentStreak(byDate, today),
        longestStreak: longestStreak(byDate),
        words: windowEntries.reduce((sum, e) => sum + e.words, 0),
        lastEntryDate,
        filledDates,
        trackers: trackerStats,
    };
}
