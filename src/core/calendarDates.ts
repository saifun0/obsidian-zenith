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

/** Weekday header labels for a calendar, localized and rotated to `weekStart`. */
export function weekdayLabels(locale: string, weekStart: WeekStart): string[] {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-07 is a Sunday, so index 0 lines up with `Date#getDay()`.
    const base = Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
    return weekStart === 'mon' ? [...base.slice(1), base[0]] : base;
}

/** Localized "July 2026" heading. */
export function monthLabel(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(isoToDate(iso));
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
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(isoToDate(iso));
}
