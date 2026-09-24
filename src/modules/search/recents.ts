/**
 * What was picked in the Search panel, how often and when last.
 *
 * Kept per device (`searchRecents`, see `statePolicy.ts`): a phone and a
 * desktop are used for different things, and what one reaches for should not
 * reorder the other.
 */

export interface RecentPick {
    /** Times picked. */
    n: number;
    /** When last, in ms. */
    at: number;
}

export type Recents = Record<string, RecentPick>;

/** How many picks are remembered; the oldest go first. */
export const RECENTS_KEPT = 50;

const DAY = 24 * 60 * 60 * 1000;

/** The record with one more pick of `id`. */
export function recordPick(recents: Recents, id: string, now: number): Recents {
    const prev = recents[id];
    const next: Recents = { ...recents, [id]: { n: (prev?.n ?? 0) + 1, at: now } };
    const ids = Object.keys(next);
    if (ids.length <= RECENTS_KEPT) return next;
    ids.sort((a, b) => next[b].at - next[a].at)
        .slice(RECENTS_KEPT)
        .forEach((old) => delete next[old]);
    return next;
}

/** Ids picked, the latest first. */
export function recentIds(recents: Recents): string[] {
    return Object.keys(recents).sort((a, b) => recents[b].at - recents[a].at);
}

/**
 * How far a match is lifted for having been picked before: a little for each
 * pick, up to ten, and a little more for one picked today or this week. At
 * most 0.14, less than the step from a word's start to the text's (0.15, see
 * `match.ts`): what you pick often comes first among matches as good as each
 * other, and never above a clearly better one.
 */
export function pickBoost(pick: RecentPick | undefined, now: number): number {
    if (!pick) return 0;
    const age = now - pick.at;
    const fresh = age < DAY ? 0.04 : age < 7 * DAY ? 0.02 : 0;
    return Math.min(pick.n, 10) * 0.01 + fresh;
}
