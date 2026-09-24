import { isoToDate } from '../../../core/calendarDates';
import { daysBetweenIso, toLocalIsoDate } from '../../../core/dateUtils';

/**
 * A life as a grid of weeks: a column per year of it, fifty-two weeks down
 * each. The year runs from birthday to birthday, so a column is a year of the
 * person's life rather than of the calendar, and the week within it is counted
 * from the last birthday — the drift of 52 × 7 against 365 is absorbed at each
 * birthday instead of accumulating across eighty years.
 */

export const WEEKS_PER_YEAR = 52;

export interface LifeWeeks {
    /** Whole years lived. */
    age: number;
    /** Week of the current year of life, 0-based, under 52. */
    week: number;
    /** Weeks lived, the current one included. */
    lived: number;
    total: number;
    fraction: number;
}

/** Leap-day birthdays fall on 28 February in the years without one. */
function birthdayIn(birth: string, year: number): string {
    const [, m, d] = birth.split('-').map(Number);
    const last = new Date(year, m, 0).getDate();
    return toLocalIsoDate(new Date(year, m - 1, Math.min(d, last)));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Null when the birth date is missing, malformed, or still to come. */
export function lifeWeeks(birth: string, years: number, today: string): LifeWeeks | null {
    const value = birth.trim();
    if (!ISO.test(value) || Number.isNaN(isoToDate(value).getTime()) || value > today) return null;
    const span = Math.max(1, Math.round(years));

    const year = isoToDate(today).getFullYear();
    const thisYears = birthdayIn(value, year);
    const last = thisYears <= today ? thisYears : birthdayIn(value, year - 1);
    const age = isoToDate(last).getFullYear() - isoToDate(value).getFullYear();
    const week = Math.min(WEEKS_PER_YEAR - 1, Math.floor(daysBetweenIso(last, today) / 7));

    const total = span * WEEKS_PER_YEAR;
    const lived = Math.min(total, age * WEEKS_PER_YEAR + week + 1);
    return { age, week, lived, total, fraction: lived / total };
}
