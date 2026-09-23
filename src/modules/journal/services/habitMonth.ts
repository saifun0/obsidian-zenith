/**
 * A month of trackers, as a grid.
 *
 * The journal's statistics answer "how has this tracker been going" one tracker
 * at a time, over a rolling window with no dates on it. This answers a
 * different question — "which days did I actually do these things" — and it
 * needs the calendar back: real dates, one column each, every tracker on the
 * same axis so a row can be compared with the row above it.
 *
 * Everything here is pure. The grid's one side effect, writing a value into a
 * day's note, goes through the journal's existing `setTrackerValue`.
 */

import type { JournalEntry, TrackerValue } from '../../../store/journalSlice';
import {
    coerceTrackerValue,
    meetsGoal,
    trackerFill,
    type JournalTracker,
} from '../../../core/journalConfig';
import { isJournalled } from './journalStats';
import { addDays } from './journalDates';

/**
 * Why a day's mark looks the way it does.
 *
 * `miss` and `empty` are deliberately different: a day you journalled without
 * ticking a habit is a day you didn't do it, and a day with no note at all is a
 * day you didn't say. Collapsing them would turn every gap in the record into
 * a failure, which is both wrong and discouraging.
 */
export type HabitCellState = 'done' | 'partial' | 'miss' | 'empty' | 'future';

export interface HabitCell {
    date: string;
    /** Day of the month, 1-based — what the column header shows. */
    day: number;
    /** What the note records, if anything. */
    value?: TrackerValue;
    state: HabitCellState;
    /** How full to draw the mark, 0–1. Zero for the states that draw a ring. */
    fill: number;
}

/** A run of consecutive done days — one connector across those columns. */
export interface HabitRun {
    /** Index into the month's days, inclusive. */
    from: number;
    to: number;
}

export interface HabitRow {
    tracker: JournalTracker;
    cells: HabitCell[];
    /** Runs of two or more days. A lone day needs no connector. */
    runs: HabitRun[];
    /** Days in the month that reached the goal. */
    done: number;
    /** Longest run of done days, counted over the whole month. */
    streak: number;
    /** Done ÷ days elapsed, 0–1. */
    rate: number;
}

export interface HabitSummary {
    /** Highest and lowest rate. Null when there are no trackers at all. */
    best: HabitRow | null;
    worst: HabitRow | null;
    /** Mean of the rows' rates, 0–1. */
    average: number;
    /** Every done day across every tracker. */
    totalDone: number;
}

export interface HabitMonthResult {
    /** Every date in the month, in order. */
    days: string[];
    rows: HabitRow[];
    /** How many trackers were done on each day — the column under the grid. */
    totals: number[];
    /**
     * Days of the month already lived through, which is what rates divide by.
     * Dividing by the whole month would score a good first week of March as 20%
     * on the 7th, and nobody reads that as encouragement.
     */
    elapsed: number;
}

/**
 * How many of the day's habits reached their goal, out of how many there are.
 *
 * The calendar draws this as a ring around each day number, which is the same
 * question the grid's totals row answers a column at a time — asked here of a
 * single entry so the calendar can ask it about days outside the month it is
 * anchored to.
 */
export function keptOn(
    entry: JournalEntry | undefined,
    trackers: readonly JournalTracker[]
): { kept: number; total: number } {
    if (!entry) return { kept: 0, total: trackers.length };
    let kept = 0;
    for (const tracker of trackers) {
        if (meetsGoal(tracker, entry.values[tracker.id])) kept += 1;
    }
    return { kept, total: trackers.length };
}

/** Every date in the month `anchor` falls in. */
export function monthDays(anchor: string): string[] {
    const first = `${anchor.slice(0, 7)}-01`;
    const [year, month] = first.split('-').map(Number);
    // Day 0 of the next month is the last day of this one.
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, i) => addDays(first, i));
}

function cellState(
    tracker: JournalTracker,
    entry: JournalEntry | undefined,
    raw: TrackerValue | undefined,
    date: string,
    today: string
): HabitCellState {
    if (meetsGoal(tracker, raw)) return 'done';
    if (coerceTrackerValue(tracker.kind, raw) !== undefined) return 'partial';
    if (date > today) return 'future';
    return isJournalled(entry) ? 'miss' : 'empty';
}

/** Runs of two or more consecutive true flags. A lone day needs no connector. */
export function runsOfFlags(flags: readonly boolean[]): HabitRun[] {
    const runs: HabitRun[] = [];
    let start: number | null = null;

    for (let i = 0; i <= flags.length; i++) {
        const done = i < flags.length && flags[i];
        if (done && start === null) start = i;
        if (!done && start !== null) {
            if (i - 1 > start) runs.push({ from: start, to: i - 1 });
            start = null;
        }
    }
    return runs;
}

/** Runs of two or more consecutive done cells. */
export function runsOf(cells: HabitCell[]): HabitRun[] {
    return runsOfFlags(cells.map((cell) => cell.state === 'done'));
}

/** The longest run of done days, however short — a lone day is a streak of 1. */
export function longestRun(cells: HabitCell[]): number {
    let best = 0;
    let run = 0;
    for (const cell of cells) {
        if (cell.state === 'done') {
            run += 1;
            if (run > best) best = run;
        } else {
            run = 0;
        }
    }
    return best;
}

/**
 * One tracker across `days`, read the way the grid reads it.
 *
 * `elapsed` is what the rate divides by: the days already lived through, which
 * for a month in progress is fewer than the month has.
 */
function habitRow(
    byDate: Map<string, JournalEntry>,
    tracker: JournalTracker,
    days: readonly string[],
    today: string,
    elapsed: number
): HabitRow {
    const cells: HabitCell[] = days.map((date) => {
        const entry = byDate.get(date);
        const value = entry?.values[tracker.id];
        return {
            date,
            day: Number(date.slice(8, 10)),
            value,
            state: cellState(tracker, entry, value, date, today),
            fill: trackerFill(tracker, value),
        };
    });

    const done = cells.filter((cell) => cell.state === 'done').length;
    return {
        tracker,
        cells,
        runs: runsOf(cells),
        done,
        streak: longestRun(cells),
        rate: done / elapsed,
    };
}

/** Build the grid for the month `anchor` falls in. */
export function habitMonth(
    byDate: Map<string, JournalEntry>,
    trackers: JournalTracker[],
    anchor: string,
    today: string
): HabitMonthResult {
    const days = monthDays(anchor);
    const elapsed = Math.max(1, days.filter((date) => date <= today).length);

    const rows = trackers.map((tracker) => habitRow(byDate, tracker, days, today, elapsed));

    const totals = days.map(
        (_, day) => rows.filter((row) => row.cells[day].state === 'done').length
    );

    return { days, rows, totals, elapsed };
}

/**
 * Every tracker over the `days` days ending today, oldest first.
 *
 * The same rows the month grid draws, over a window that slides instead of one
 * pinned to the calendar: on the 2nd of the month a calendar month has two days
 * in it, and a card asking "how have my habits been going" needs the weeks
 * before that too. Nothing in the window is in the future, so every day counts
 * towards the rate.
 */
export function recentHabits(
    byDate: Map<string, JournalEntry>,
    trackers: JournalTracker[],
    today: string,
    days: number
): HabitRow[] {
    const count = Math.max(1, Math.floor(days));
    const window = Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
    return trackers.map((tracker) => habitRow(byDate, tracker, window, today, count));
}

/** Rank the rows. Ties break on the longer streak, then alphabetically. */
export function summarize(rows: HabitRow[]): HabitSummary {
    if (rows.length === 0) {
        return { best: null, worst: null, average: 0, totalDone: 0 };
    }

    const ranked = [...rows].sort(
        (a, b) =>
            b.rate - a.rate ||
            b.streak - a.streak ||
            a.tracker.label.localeCompare(b.tracker.label)
    );

    const totalDone = rows.reduce((sum, row) => sum + row.done, 0);
    return {
        best: ranked[0],
        worst: ranked[ranked.length - 1],
        average: rows.reduce((sum, row) => sum + row.rate, 0) / rows.length,
        totalDone,
    };
}

/*
 * Clicking a day used to cycle its value here. It doesn't any more: a tick
 * toggles in place, and a score or a count opens `HabitValuePicker`, because
 * reaching "sixty reps, step five" by clicking one dot twelve times is not an
 * interaction anybody wants twice.
 */
