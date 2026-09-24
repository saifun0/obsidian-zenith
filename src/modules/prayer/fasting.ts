import type { JournalEntry } from '../../store/journalSlice';
import { addDays, isoToDate } from '../../core/calendarDates';
import { hijriDate, RAMADAN_MONTH } from './hijri';

/**
 * Fasting, recorded in the day's note as one property:
 *
 * ```yaml
 * fast: ramadan   # ramadan | qada | nafl | broken | excused
 * ```
 *
 * `ramadan` is a Ramadan fast kept, `qada` one made up, `nafl` a voluntary
 * one; `broken` and `excused` say why a Ramadan day was not fasted. A Ramadan
 * day with nothing written is exactly that — nothing written — and is never
 * counted as a missed fast: the record is the user's to keep, not the
 * calendar's to presume.
 */

export const FAST_KEY = 'fast';

export const FAST_KINDS = ['ramadan', 'qada', 'nafl', 'broken', 'excused'] as const;
export type FastKind = (typeof FAST_KINDS)[number];

/** Words read as each kind, in both languages — a note is written by hand too. */
const ALIASES: Record<FastKind, readonly string[]> = {
    ramadan: ['ramadan', 'рамадан', 'fasted', 'пост'],
    qada: ['qada', 'qadha', 'qaza', 'kaza', 'каза', 'када', 'восполнение'],
    nafl: ['nafl', 'sunnah', 'voluntary', 'нафль', 'сунна', 'добровольный'],
    broken: ['broken', 'broke', 'прерван', 'нарушен'],
    excused: ['excused', 'excuse', 'уважительная', 'освобождён', 'освобожден'],
};

export function parseFast(raw: unknown): FastKind | undefined {
    if (typeof raw !== 'string') return undefined;
    const text = raw.trim().toLowerCase();
    return FAST_KINDS.find((kind) => ALIASES[kind].includes(text));
}

/** Every recorded fast, by date. */
export function fastsByDate(entries: readonly JournalEntry[]): Map<string, FastKind> {
    const out = new Map<string, FastKind>();
    for (const entry of entries) {
        const kind = parseFast(entry.texts?.[FAST_KEY]);
        if (kind) out.set(entry.date, kind);
    }
    return out;
}

const monthOf = (date: string, offset: number) => hijriDate(isoToDate(date), offset)?.month;

export interface RamadanProgress {
    /** Day of Ramadan `date` is, 1-based. */
    day: number;
    /** Days in this Ramadan — 29 or 30, as the calendar has it. */
    length: number;
    /** Fasts kept so far, up to `date`. */
    fasted: number;
    broken: number;
    excused: number;
    /** Days so far with nothing written. Not missed — unrecorded. */
    unrecorded: number;
}

/** Where `date` stands in its Ramadan, or null outside it (or with no Hijri calendar). */
export function ramadanProgress(
    fasts: ReadonlyMap<string, FastKind>,
    date: string,
    offset = 0
): RamadanProgress | null {
    if (monthOf(date, offset) !== RAMADAN_MONTH) return null;
    let start = date;
    while (monthOf(addDays(start, -1), offset) === RAMADAN_MONTH) start = addDays(start, -1);
    let end = date;
    while (monthOf(addDays(end, 1), offset) === RAMADAN_MONTH) end = addDays(end, 1);

    const progress: RamadanProgress = {
        day: 0,
        length: 0,
        fasted: 0,
        broken: 0,
        excused: 0,
        unrecorded: 0,
    };
    for (let d = start; d <= end; d = addDays(d, 1)) {
        progress.length += 1;
        if (d > date) continue;
        progress.day += 1;
        const kind = fasts.get(d);
        if (kind === 'ramadan') progress.fasted += 1;
        else if (kind === 'broken') progress.broken += 1;
        else if (kind === 'excused') progress.excused += 1;
        else progress.unrecorded += 1;
    }
    return progress;
}

/** Fasts made up, all told. */
export function qadaCount(fasts: ReadonlyMap<string, FastKind>): number {
    let n = 0;
    for (const kind of fasts.values()) if (kind === 'qada') n += 1;
    return n;
}

export type VoluntaryHint = 'arafah' | 'ashura' | 'whiteDays' | 'monThu';

/**
 * Whether a day is one of the recommended voluntary fasts, and which: the
 * day of Arafah (9 Dhu al-Hijjah), Ashura (10 Muharram), the "white days"
 * (13–15 of each month), Mondays and Thursdays.
 *
 * Never on a day fasting is not for: Ramadan itself (the fast is already
 * obligatory), the two Eids and the days of Tashriq (11–13 Dhu al-Hijjah) —
 * which is why the 13th of that month is not offered as a white day.
 */
export function voluntaryHint(date: string, offset = 0): VoluntaryHint | null {
    const h = hijriDate(isoToDate(date), offset);
    if (!h) return null;
    if (h.month === RAMADAN_MONTH) return null;
    if (h.month === 10 && h.day === 1) return null; // Eid al-Fitr
    if (h.month === 12 && h.day >= 10 && h.day <= 13) return null; // Eid al-Adha, Tashriq
    if (h.month === 12 && h.day === 9) return 'arafah';
    if (h.month === 1 && h.day === 10) return 'ashura';
    if (h.day >= 13 && h.day <= 15) return 'whiteDays';
    const weekday = isoToDate(date).getDay();
    if (weekday === 1 || weekday === 4) return 'monThu';
    return null;
}

/** The kinds that make sense to offer for a day: Ramadan's, or the rest of the year's. */
export function fastChoices(date: string, offset = 0): FastKind[] {
    return monthOf(date, offset) === RAMADAN_MONTH
        ? ['ramadan', 'broken', 'excused']
        : ['qada', 'nafl'];
}

/**
 * Whether `date` is being fasted: any day whose note records a fast, and every
 * day of Ramadan unless its note says the fast was broken or excused. Unlike
 * the progress above, this one does presume — it only decides what a
 * countdown is called, and in Ramadan "until iftar" is the likelier question.
 */
export function isFastDay(fasts: ReadonlyMap<string, FastKind>, date: string, offset = 0): boolean {
    const kind = fasts.get(date);
    if (kind === 'broken' || kind === 'excused') return false;
    return kind !== undefined || monthOf(date, offset) === RAMADAN_MONTH;
}

export interface FastCountdown {
    moment: 'iftar' | 'suhoor';
    minutesAway: number;
}

/**
 * What the countdown to the next prayer means on a fasting day: maghrib is
 * iftar; fajr is the end of suhoor — `imsak` minutes before it, for those who
 * stop eating early. Fajr after isha belongs to tomorrow, so it is tomorrow's
 * fast that decides. Null when the day is not a fast, the next prayer is
 * neither, or imsak has already passed (the plain "fajr in…" is right again).
 */
export function fastCountdown(
    next: { id: string; minutesAway: number; tomorrow: boolean },
    today: string,
    fasts: ReadonlyMap<string, FastKind>,
    offset = 0,
    imsak = 0
): FastCountdown | null {
    if (next.id === 'maghrib' && !next.tomorrow) {
        return isFastDay(fasts, today, offset)
            ? { moment: 'iftar', minutesAway: next.minutesAway }
            : null;
    }
    if (next.id !== 'fajr') return null;
    const day = next.tomorrow ? addDays(today, 1) : today;
    if (!isFastDay(fasts, day, offset)) return null;
    const minutesAway = next.minutesAway - Math.max(0, imsak);
    return minutesAway > 0 ? { moment: 'suhoor', minutesAway } : null;
}
