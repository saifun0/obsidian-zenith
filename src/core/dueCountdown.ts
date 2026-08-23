/**
 * How long is left until a task's deadline.
 *
 * Tasks store dates as `YYYY-MM-DD` with no time of day (see `taskFormat`'s
 * 📅 emoji contract), so for every day but one the honest answer is a whole
 * number of days. The exception is a deadline falling *today*: there a real
 * countdown exists — what is left of the day — and showing "6 ч" instead of
 * "Today" is the difference between a label and an actual answer.
 *
 * The `text` is deliberately terse (`6 ч`, `2 д`, `−3 д`): it renders in a
 * dense row where a column of short units can be scanned vertically, and the
 * spelled-out version lives in `title` where there's room for it.
 */

import type { Locale, Translator } from './i18n';
import { daysBetweenIso, toLocalIsoDate } from './dateUtils';

/** How urgently the deadline wants attention. Drives the row's colour. */
export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

export interface DueCountdown {
    /** Compact label for a dense row. */
    text: string;
    tone: DueTone;
    /** Spelled-out version, for a `title` tooltip. */
    title: string;
}

/** A date we're willing to do arithmetic on. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Days at or under which a deadline counts as imminent. */
const SOON_DAYS = 2;

/** Milliseconds from `now` to the next local midnight. */
function msUntilMidnight(now: Date): number {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

/**
 * `12 August`, or `12 August 2026` when the deadline is in another year —
 * without the year, a date eight months out reads as one two months out.
 */
function longDate(iso: string, locale: Locale, now: Date): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
        day: 'numeric',
        month: 'long',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    });
}

/**
 * Time remaining until `dueDate`. Returns null when there is no deadline to
 * count down to — a task with only a start date gets no label rather than a
 * countdown to a date that isn't its deadline.
 */
export function dueCountdown(
    dueDate: string | undefined,
    t: Translator,
    now: Date = new Date()
): DueCountdown | null {
    if (!dueDate || !ISO_DATE.test(dueDate)) return null;

    const days = daysBetweenIso(toLocalIsoDate(now), dueDate);
    const date = longDate(dueDate, t.locale, now);

    if (days < 0) {
        return {
            text: t('date.left.overdue', { count: -days }),
            tone: 'overdue',
            title: t('date.due.overdue', { date }),
        };
    }

    if (days === 0) {
        const ms = msUntilMidnight(now);
        const hours = Math.floor(ms / 3_600_000);
        return {
            text:
                hours >= 1
                    ? t('date.left.hours', { count: hours })
                    : // Never round down to "0 min" while the day is still running.
                      t('date.left.minutes', { count: Math.max(1, Math.floor(ms / 60_000)) }),
            tone: 'today',
            title: t('date.due.today', { date }),
        };
    }

    return {
        text: t('date.left.days', { count: days }),
        tone: days <= SOON_DAYS ? 'soon' : 'later',
        title: t('date.due.in', { date }),
    };
}
