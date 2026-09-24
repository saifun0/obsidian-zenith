import { periodProgress } from '../../../core/period';
import { addDays, isoToDate, startOfWeek, type WeekStart } from '../../../core/calendarDates';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { hijriDate } from '../../prayer/hijri';

/**
 * How far through the day, the week, the month and the year today is — and,
 * for those who count months by the moon, the Hijri month.
 *
 * Everything but the day is `periodProgress()`, the same arithmetic the reading
 * challenge keeps its pace by: whole days, both ends included, today counted
 * as begun. The day is the one period measured in minutes, because "the day
 * is 100% done" at nine in the morning would be the bar lying.
 */

export const PERIODS = ['day', 'week', 'month', 'year'] as const;
export type PeriodId = (typeof PERIODS)[number] | 'hijriMonth';

export interface PeriodRow {
    id: PeriodId;
    /** 0 to 1. */
    fraction: number;
    /** What is left: hours for the day, days for the rest. */
    left: number;
    /** The Hijri month's number, for its name — Ramadan is 9. */
    hijriMonth?: number;
}

/** First and last day of the Hijri month `today` is in, or null without a Hijri calendar. */
export function hijriMonthBounds(
    today: string,
    offset = 0
): { start: string; end: string; month: number } | null {
    const monthOf = (iso: string) => hijriDate(isoToDate(iso), offset)?.month;
    const month = monthOf(today);
    if (month === undefined) return null;
    let start = today;
    while (monthOf(addDays(start, -1)) === month) start = addDays(start, -1);
    let end = today;
    while (monthOf(addDays(end, 1)) === month) end = addDays(end, 1);
    return { start, end, month };
}

export function periodRows(
    today: string,
    nowMinutes: number,
    weekStart: WeekStart,
    hijri: { offset: number } | null = null
): PeriodRow[] {
    const date = isoToDate(today);
    const rows: PeriodRow[] = [
        {
            id: 'day',
            fraction: Math.min(1, Math.max(0, nowMinutes / 1440)),
            left: Math.max(0, Math.floor((1440 - nowMinutes) / 60)),
        },
    ];
    const add = (id: PeriodId, start: string, end: string, extra: Partial<PeriodRow> = {}) => {
        const p = periodProgress(start, end, today);
        rows.push({ id, fraction: p.fraction, left: p.remaining, ...extra });
    };

    const weekFrom = startOfWeek(today, weekStart);
    add('week', weekFrom, addDays(weekFrom, 6));
    add(
        'month',
        toLocalIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)),
        toLocalIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
    );
    add('year', `${date.getFullYear()}-01-01`, `${date.getFullYear()}-12-31`);

    if (hijri) {
        const bounds = hijriMonthBounds(today, hijri.offset);
        if (bounds) add('hijriMonth', bounds.start, bounds.end, { hijriMonth: bounds.month });
    }
    return rows;
}
