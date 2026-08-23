/**
 * Date helpers shared across modules.
 *
 * IMPORTANT: task due-dates are compared as `YYYY-MM-DD` strings, so "today"
 * must be computed in the user's LOCAL timezone. `new Date().toISOString()`
 * returns a UTC date, which flips a day early/late for users far from UTC
 * (e.g. an evening in UTC+3 already reports "tomorrow"). We build the string
 * from local getters instead.
 */

/** Format a Date as `YYYY-MM-DD` using its LOCAL calendar fields. */
export function toLocalIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Local date as `YYYY-MM-DD` (today by default). */
export function getTodayString(): string {
    return toLocalIsoDate(new Date());
}

/** Whether an ISO `YYYY-MM-DD` date is strictly before today (local). */
export function isOverdue(dueDate?: string): boolean {
    if (!dueDate) return false;
    return dueDate < getTodayString();
}

/** Whether an ISO `YYYY-MM-DD` date is today (local). */
export function isToday(dueDate?: string): boolean {
    if (!dueDate) return false;
    return dueDate === getTodayString();
}

/**
 * Whole days from `a` to `b` (b − a), both parsed as LOCAL midnight.
 *
 * The canonical version: four near-identical copies of this used to live in
 * tasks / tasks-calendar / dashboard code. Unparseable input yields 0 rather
 * than NaN, because every caller feeds the result straight into layout maths
 * where a NaN silently corrupts a whole row.
 *
 * Note this is deliberately NOT `content/services/contentDates.daysBetween`,
 * which parses as UTC and returns `null` for a negative span — a different
 * contract for a different job.
 */
export function daysBetweenIso(a: string, b: string): number {
    const da = new Date(`${a}T00:00:00`).getTime();
    const db = new Date(`${b}T00:00:00`).getTime();
    if (Number.isNaN(da) || Number.isNaN(db)) return 0;
    return Math.round((db - da) / 86400000);
}
