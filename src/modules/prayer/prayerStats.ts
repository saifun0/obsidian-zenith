import type { JournalEntry } from '../../store/journalSlice';
import { entriesByDate } from '../journal/services/journalStats';
import { addDays } from '../journal/services/journalDates';
import {
    EXTRA_PRAYERS,
    PRAYERS,
    isPerformed,
    parsePrayerStatus,
    type ExtraPrayerId,
    type PrayerId,
    type PrayerStatus,
} from './prayerConfig';

/**
 * Turning daily notes into a prayer history.
 *
 * The records already arrive in the store — the daily notes are parsed for the
 * journal, and a prayer status is just another frontmatter property — so this
 * module never touches the vault. It reads `JournalEntry` and counts.
 *
 * Everything here treats "not recorded" and "recorded as missed" as different
 * answers. Collapsing them would make the statistics flattering and useless: a
 * day nobody filled in would count as five missed prayers, and the number that
 * matters — how many you actually missed — would be buried.
 */

export interface PrayerDay {
    date: string;
    statuses: Partial<Record<PrayerId, PrayerStatus>>;
    extras: Partial<Record<ExtraPrayerId, boolean>>;
    /** Whether a daily note exists for this date at all. */
    hasNote: boolean;
}

const emptyDay = (date: string): PrayerDay => ({
    date,
    statuses: {},
    extras: {},
    hasNote: false,
});

/**
 * Read one day's prayers out of its note.
 *
 * Both maps on the entry are consulted: a status written by Zenith is a string
 * (`fajr: ontime`), but someone editing the note by hand is quite likely to
 * write `fajr: true`, which YAML gives us as a boolean — and that means "prayed
 * on time", not "unreadable".
 */
export function readPrayerDay(entry: JournalEntry | undefined, date: string): PrayerDay {
    if (!entry) return emptyDay(date);

    const statuses: Partial<Record<PrayerId, PrayerStatus>> = {};
    for (const id of PRAYERS) {
        const status = parsePrayerStatus(entry.texts[id] ?? entry.values[id]);
        if (status) statuses[id] = status;
    }

    const extras: Partial<Record<ExtraPrayerId, boolean>> = {};
    for (const id of EXTRA_PRAYERS) {
        const raw = entry.texts[id] ?? entry.values[id];
        if (parsePrayerStatus(raw) !== undefined) extras[id] = true;
    }

    return { date, statuses, extras, hasNote: true };
}

/** Every day that has a note, indexed by date. */
export function prayerDaysByDate(entries: JournalEntry[]): Map<string, PrayerDay> {
    const days = new Map<string, PrayerDay>();
    for (const [date, entry] of entriesByDate(entries)) {
        days.set(date, readPrayerDay(entry, date));
    }
    return days;
}

/** The day's record, or an empty one — callers shouldn't handle undefined. */
export function dayOf(days: Map<string, PrayerDay>, date: string): PrayerDay {
    return days.get(date) ?? emptyDay(date);
}

/** How many of the five were performed (0–5). */
export function performedCount(day: PrayerDay): number {
    return PRAYERS.filter((id) => isPerformed(day.statuses[id])).length;
}

/** Whether every obligatory prayer of the day was performed. */
export function isComplete(day: PrayerDay): boolean {
    return performedCount(day) === PRAYERS.length;
}

/** Whether the day records anything at all. */
export function hasAnyRecord(day: PrayerDay): boolean {
    return PRAYERS.some((id) => day.statuses[id] !== undefined);
}

/**
 * Consecutive complete days ending today.
 *
 * An unfinished today doesn't break the streak — the day isn't over, and isha
 * hasn't come in yet for most of it. Counting resumes from yesterday in that
 * case, exactly as the journal's own streak does.
 */
export function currentStreak(days: Map<string, PrayerDay>, today: string): number {
    let cursor = isComplete(dayOf(days, today)) ? today : addDays(today, -1);
    let streak = 0;
    while (isComplete(dayOf(days, cursor))) {
        streak++;
        cursor = addDays(cursor, -1);
    }
    return streak;
}

/** The longest run of complete days on record. */
export function longestStreak(days: Map<string, PrayerDay>): number {
    const dates = [...days.values()]
        .filter(isComplete)
        .map((d) => d.date)
        .sort();

    let best = 0;
    let run = 0;
    let previous: string | null = null;
    for (const date of dates) {
        run = previous && addDays(previous, 1) === date ? run + 1 : 1;
        if (run > best) best = run;
        previous = date;
    }
    return best;
}

export interface PrayerCounts {
    ontime: number;
    late: number;
    missed: number;
    /** ontime + late. */
    performed: number;
    /** Everything above, including missed — i.e. days with an answer. */
    recorded: number;
}

const zeroCounts = (): PrayerCounts => ({
    ontime: 0,
    late: 0,
    missed: 0,
    performed: 0,
    recorded: 0,
});

function tally(counts: PrayerCounts, status: PrayerStatus | undefined): void {
    if (!status) return;
    counts[status] += 1;
    counts.recorded += 1;
    if (status !== 'missed') counts.performed += 1;
}

export interface PrayerStatsResult {
    windowDays: number;
    /** Days in the window that recorded at least one prayer. */
    activeDays: number;
    /** Days in the window with all five performed. */
    completeDays: number;
    /** Performed out of every prayer the window could hold, 0–1. */
    rate: number;
    /** Performed on time, as a share of performed, 0–1. */
    punctuality: number;
    counts: PrayerCounts;
    currentStreak: number;
    longestStreak: number;
}

/**
 * Summarise a trailing window ending today.
 *
 * `rate` is measured against the whole window, not against the days that were
 * filled in: five prayers a day happen whether or not anyone wrote them down,
 * and a tracker that reports 100% because you only logged your best week would
 * be lying to the one person it's for.
 */
export function prayerStats(
    entries: JournalEntry[],
    today: string,
    windowDays = 30
): PrayerStatsResult {
    const days = prayerDaysByDate(entries);

    const window: PrayerDay[] = [];
    for (let i = windowDays - 1; i >= 0; i--) window.push(dayOf(days, addDays(today, -i)));

    const counts = zeroCounts();
    for (const day of window) {
        for (const id of PRAYERS) tally(counts, day.statuses[id]);
    }

    const slots = windowDays * PRAYERS.length;

    return {
        windowDays,
        activeDays: window.filter(hasAnyRecord).length,
        completeDays: window.filter(isComplete).length,
        rate: slots > 0 ? counts.performed / slots : 0,
        punctuality: counts.performed > 0 ? counts.ontime / counts.performed : 0,
        counts,
        currentStreak: currentStreak(days, today),
        longestStreak: longestStreak(days),
    };
}

/** The last `count` days ending today, oldest first — for the week strip. */
export function recentDays(
    days: Map<string, PrayerDay>,
    today: string,
    count: number
): PrayerDay[] {
    const out: PrayerDay[] = [];
    for (let i = count - 1; i >= 0; i--) out.push(dayOf(days, addDays(today, -i)));
    return out;
}
