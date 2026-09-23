/**
 * Calendar arithmetic shared by every module that draws a grid of days.
 *
 * This started inside the Journal module; the Tasks Calendar needs the same
 * month grid, weekday headers and ISO-date maths, and neither module owns the
 * Gregorian calendar. `journalDates` re-exports what it always exported, so the
 * journal's own imports (and its tests) are unaffected.
 *
 * Everything here works in the LOCAL calendar — see `dateUtils` for why UTC
 * would shift days for anyone away from Greenwich.
 */

import { toLocalIsoDate } from './dateUtils';

/** Parse `YYYY-MM-DD` into a Date at LOCAL midnight (never UTC — see dateUtils). */
export function isoToDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Shift an ISO date by whole days, staying in the local calendar. */
export function addDays(iso: string, days: number): string {
    const date = isoToDate(iso);
    date.setDate(date.getDate() + days);
    return toLocalIsoDate(date);
}

/** Shift an ISO date by whole months, clamping to the end of a shorter month. */
export function addMonths(iso: string, months: number): string {
    const date = isoToDate(iso);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return toLocalIsoDate(date);
}

/** Whether two ISO dates fall in the same calendar month. */
export function sameMonth(a: string, b: string): boolean {
    return a.slice(0, 7) === b.slice(0, 7);
}

export type WeekStart = 'mon' | 'sun';

/** The first day of the week `iso` falls in. */
export function startOfWeek(iso: string, weekStart: WeekStart): string {
    const date = isoToDate(iso);
    const offset = weekStart === 'mon' ? (date.getDay() + 6) % 7 : date.getDay();
    return addDays(iso, -offset);
}

/**
 * The dates a month grid shows: whole weeks, so the month is padded with the
 * tail of the previous one and the head of the next. Always 6 rows — a grid
 * that changed height between months would make the panel below it jump.
 */
export function monthGrid(monthAnchor: string, weekStart: WeekStart): string[] {
    const anchor = isoToDate(monthAnchor);
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);

    const offset = weekStart === 'mon' ? (first.getDay() + 6) % 7 : first.getDay();
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    const days: string[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(toLocalIsoDate(d));
    }
    return days;
}

/** The seven dates of the week `iso` falls in. */
export function weekGrid(iso: string, weekStart: WeekStart): string[] {
    const first = startOfWeek(iso, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/**
 * ISO-8601 week number and its week-numbering year.
 *
 * Always Monday-based, even when the grid starts on Sunday: ISO weeks are
 * defined that way, and a "week 34" that means something different depending on
 * a display preference would be worse than one that's occasionally off by a
 * column. The rule is that week 1 is the one containing the first Thursday, so
 * we count from the Thursday of the week in question.
 */
export function isoWeek(iso: string): { year: number; week: number } {
    const thursday = isoToDate(addDays(startOfWeek(iso, 'mon'), 3));
    const year = thursday.getFullYear();
    const firstThursday = new Date(year, 0, 4);
    firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
    const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
    return { year, week };
}

/**
 * Localized "Mon" for one date.
 *
 * What a seven-wide grid puts in its header strip once per column, a narrower
 * one has to repeat in every cell: three days across start on a different
 * weekday every row, so a fixed strip above them would name the wrong days.
 */
export function weekdayLabel(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(isoToDate(iso));
}

/** Weekday header labels for a calendar, localized and rotated to `weekStart`. */
export function weekdayLabels(locale: string, weekStart: WeekStart): string[] {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-07 is a Sunday, so index 0 lines up with `Date#getDay()`.
    const base = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
    return weekStart === 'mon' ? [...base.slice(1), base[0]] : base;
}

/** Localized "July 2026" heading. */
export function monthLabel(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        isoToDate(iso)
    );
}

/** Localized "Tuesday, 28 July" heading. */
export function dayLabel(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(isoToDate(iso));
}

/** Localized "28 Jul" — the compact form for a chip or a column header. */
export function shortDayLabel(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
        isoToDate(iso)
    );
}

/**
 * "July 2026" for a heading standing inside the grid.
 *
 * Built from parts rather than from a plain format string because Russian's
 * `{month: 'long', year: 'numeric'}` is "июль 2026 г." — the era suffix is
 * correct in a sentence and noise in a heading two words long.
 */
export function monthHeading(iso: string, locale: string): string {
    const parts = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).formatToParts(
        isoToDate(iso)
    );
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`;
}

/** One row of a scrolling month grid: a run of days, filed under one month. */
export interface MonthRow {
    /** The row's days: `size` of them, bar a short row at either end. */
    dates: string[];
    /** `YYYY-MM` the row is filed under — the month its last day falls in. */
    month: string;
    /** This row is where `month` starts: the row holding its 1st. */
    opens: boolean;
}

/** Days since 1970-01-01, counted in whole UTC days so it cannot drift. */
function epochDay(iso: string): number {
    return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
}

/**
 * A run of days, as the rows a grid draws — and which month each is filed
 * under.
 *
 * `size` is how many days a row holds: seven on any screen that fits a week,
 * three on a phone, where seven columns leave each day too narrow to read a
 * task in.
 *
 * A row is filed under the month it ENDS in, which is the month whose 1st it
 * contains. A seven-day row spans two months whenever a week straddles a
 * boundary, and it stays whole regardless: cutting it costs a row at every
 * boundary and leaves the grid full of gaps, and a week is a real thing a
 * reader plans in. The filing is what the scroll reports to the toolbar, and
 * `opens` marks the row a month starts in — the one "go to October" scrolls
 * to, and the one carrying October's name on its 1st.
 */
export function monthRows(run: string[], size = 7): MonthRow[] {
    const rows: MonthRow[] = [];
    if (run.length === 0) return rows;

    /**
     * How many days the first row is short of a full one.
     *
     * A seven-day row is a week and `monthRun` already begins on one, so it
     * starts whole. Three days is not a week and has no natural start, so the
     * rows are anchored to an absolute count of days instead of to whichever
     * day the run happens to begin with. The run grows at both ends while it is
     * being read: phased from its own first day, prepending four months would
     * re-group every row below and shuffle the whole grid sideways.
     */
    // The second modulus is for dates before 1970, where the first is negative
    // — a negative lead would skip the run's first days rather than short its
    // first row.
    const lead = size === 7 ? 0 : ((epochDay(run[0]) % size) + size) % size;

    for (let i = lead === 0 ? 0 : -lead; i < run.length; i += size) {
        const dates = run.slice(Math.max(0, i), i + size);
        const month = dates[dates.length - 1].slice(0, 7);
        rows.push({
            dates,
            month,
            // The month a row ends in only ever moves forwards, one month at a
            // time, so the first row to name a month is the only one that can
            // open it and every month opens exactly once.
            opens: rows.length === 0 || rows[rows.length - 1].month !== month,
        });
    }

    return rows;
}

/**
 * Whole weeks covering a run of months, for a calendar that scrolls through
 * them rather than paging between them.
 *
 * A month at a time is a decision the paper wall calendar had to make and a
 * screen does not: the last week of August and the first of September are
 * adjacent in life, and putting a page turn between them is the reason the
 * question "what is happening at the end of next month" takes two clicks. The
 * run starts at the week containing the 1st of `from` months before the anchor
 * and ends at the week containing the last day of `to` months after it.
 *
 * What comes back is a flat list of days, which is the right shape to grow at
 * either end and the wrong one to draw. `monthRows` turns it into rows.
 */
export function monthRun(anchor: string, weekStart: WeekStart, from: number, to: number): string[] {
    const begin = isoToDate(addMonths(anchor, -from));
    const first = toLocalIsoDate(new Date(begin.getFullYear(), begin.getMonth(), 1));

    const end = isoToDate(addMonths(anchor, to));
    const last = toLocalIsoDate(new Date(end.getFullYear(), end.getMonth() + 1, 0));

    const start = startOfWeek(first, weekStart);
    const stop = addDays(startOfWeek(last, weekStart), 6);

    const days: string[] = [];
    for (let date = start; date <= stop; date = addDays(date, 1)) days.push(date);
    return days;
}
