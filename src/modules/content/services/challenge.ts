import type { ContentItem } from '../../../store/contentSlice';
import { pace, type Pace } from '../../../core/period';
import { readingsOf } from './readings';

/**
 * The yearly challenge: "24 books this year", one number per type per year.
 *
 * Kept as `{ "2026": { "book": 24 } }` — a year's goals stay with that year, so
 * setting next year's does not rewrite how last year went.
 *
 * What counts is a reading finished in the year. With re-reads counted, the
 * book read twice this year counts twice; without, only items finished for the
 * first time this year count — the same book twice is one book, and a book
 * first read years ago and read again now is not a new one.
 */

export type ChallengeGoals = Record<string, Record<string, number>>;

export interface ChallengeProgress {
    typeId: string;
    year: number;
    target: number;
    done: number;
    pace: Pace;
}

/** The year's goals, by type — only the ones actually set. */
export function goalsFor(goals: ChallengeGoals, year: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [typeId, target] of Object.entries(goals[String(year)] ?? {})) {
        if (Number.isFinite(target) && target > 0) out[typeId] = Math.round(target);
    }
    return out;
}

/** Finished readings of one item that end in `year`. */
function finishesIn(item: ContentItem, year: number): string[] {
    const prefix = `${year}-`;
    return readingsOf(item)
        .map((r) => r.end)
        .filter((end): end is string => !!end && end.startsWith(prefix));
}

/** How many count towards a type's goal for the year. */
export function countFinished(
    items: readonly ContentItem[],
    typeId: string,
    year: number,
    rereads: boolean
): number {
    let done = 0;
    for (const item of items) {
        if (item.type !== typeId) continue;
        const ends = finishesIn(item, year);
        if (!ends.length) continue;
        if (rereads) {
            done += ends.length;
            continue;
        }
        // A new read only: its first finish is this year.
        const first = readingsOf(item)
            .map((r) => r.end)
            .filter((end): end is string => !!end)
            .sort()[0];
        if (first?.startsWith(`${year}-`)) done += 1;
    }
    return done;
}

/** Every goal set for `today`'s year, with how it is going. */
export function challengeProgress(
    items: readonly ContentItem[],
    goals: ChallengeGoals,
    today: string,
    rereads: boolean
): ChallengeProgress[] {
    const year = Number(today.slice(0, 4));
    return Object.entries(goalsFor(goals, year)).map(([typeId, target]) => {
        const done = countFinished(items, typeId, year, rereads);
        return {
            typeId,
            year,
            target,
            done,
            pace: pace(target, done, `${year}-01-01`, `${year}-12-31`, today),
        };
    });
}

/** Set (or clear, with 0) one type's goal for a year. */
export function withGoal(
    goals: ChallengeGoals,
    year: number,
    typeId: string,
    target: number
): ChallengeGoals {
    const key = String(year);
    const yearGoals = { ...(goals[key] ?? {}) };
    if (target > 0) yearGoals[typeId] = Math.round(target);
    else delete yearGoals[typeId];
    const next = { ...goals };
    if (Object.keys(yearGoals).length) next[key] = yearGoals;
    else delete next[key];
    return next;
}
