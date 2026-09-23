import { daysBetweenIso } from './dateUtils';

/**
 * How far through a stretch of days today is, and whether a count kept over it
 * is keeping up.
 *
 * Two small questions several features ask — a reading challenge, a countdown,
 * the week's progress bar — and the reason they share an answer rather than a
 * "Goal" entity is that none of them need more: a goal is a number and two
 * dates, and whatever holds them (a setting, a frontmatter key) is the feature's
 * own business.
 *
 * Days are counted whole and both ends are included: a period from the 1st to
 * the 30th is thirty days, and on the 1st one of them is already under way. The
 * dates are local `YYYY-MM-DD`, like every other date in the plugin.
 */

export interface PeriodProgress {
    /** Days in the period, both ends included. */
    total: number;
    /** Days begun so far, today among them — 0 before the start, `total` after the end. */
    elapsed: number;
    /** Days after today that are still to come. */
    remaining: number;
    /** `elapsed / total`, 0 to 1. */
    fraction: number;
}

export function periodProgress(start: string, end: string, today: string): PeriodProgress {
    const total = Math.max(1, daysBetweenIso(start, end) + 1);
    const elapsed = Math.min(total, Math.max(0, daysBetweenIso(start, today) + 1));
    return { total, elapsed, remaining: total - elapsed, fraction: elapsed / total };
}

export interface Pace {
    /** Where an even pace would be by the end of today. Not rounded. */
    expected: number;
    /** `done - expected`: above zero is ahead. */
    delta: number;
    /**
     * `onTrack` within one of the even pace either way. A count of books is a
     * whole number, and half a book behind is not behind.
     */
    status: 'done' | 'ahead' | 'onTrack' | 'behind';
    /** What is left to do. */
    left: number;
    /**
     * Needed per day from tomorrow to finish on the last day. Zero when there
     * is nothing left; null when there is something left and no days to do it
     * in — a figure would be a division by zero dressed as advice.
     */
    perDay: number | null;
}

export function pace(
    target: number,
    done: number,
    start: string,
    end: string,
    today: string
): Pace {
    const period = periodProgress(start, end, today);
    const expected = target * period.fraction;
    const delta = done - expected;
    const left = Math.max(0, target - done);
    const status =
        done >= target ? 'done' : delta >= 1 ? 'ahead' : delta <= -1 ? 'behind' : 'onTrack';
    const perDay = left === 0 ? 0 : period.remaining > 0 ? left / period.remaining : null;
    return { expected, delta, status, left, perDay };
}
