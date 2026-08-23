import type { ContentStatus } from '../../../core/constants';

/**
 * When an item was started and finished.
 *
 * Statistics used to lean on the note's `mtime`, which is a proxy and a bad
 * one: renaming a tag or fixing a typo makes a two-year-old book look finished
 * today. These two dates record the events themselves, stamped on the status
 * transitions that cause them — the same trick tasks use for their ✅ date.
 *
 * Stored as `YYYY-MM-DD` strings rather than timestamps: a calendar day is what
 * anyone means by "when did I finish it", and strings compare correctly without
 * dragging timezones into it.
 */

export interface ContentDates {
    started?: string;
    finished?: string;
}

/**
 * The date patch a status change implies, or null when nothing should change.
 *
 * `undefined` in the returned patch means "clear this field" — the same
 * convention `ContentWriter.patch` already uses for frontmatter keys, so the
 * result can be spread straight into a write.
 *
 * The rules, and why:
 * - **in progress** — you began it. Stamp `started` if it isn't already set
 *   (a re-read shouldn't rewrite the original date), and drop `finished`,
 *   which is now simply false.
 * - **completed** — stamp `finished`. `started` is deliberately *not*
 *   backfilled: guessing it as today would report everything you ever import
 *   as read in a single day.
 * - **backlog** — an explicit "not begun". Both dates go.
 * - **dropped** — you did start it and gave up. Nothing is touched.
 */
export function datesForStatus(
    next: ContentStatus,
    prev: ContentDates,
    today: string
): ContentDates | null {
    switch (next) {
        case 'in-progress': {
            const patch: ContentDates = {};
            if (!prev.started) patch.started = today;
            if (prev.finished) patch.finished = undefined;
            return Object.keys(patch).length > 0 ? patch : null;
        }
        case 'completed':
            return prev.finished ? null : { finished: today };
        case 'backlog': {
            const patch: ContentDates = {};
            if (prev.started) patch.started = undefined;
            if (prev.finished) patch.finished = undefined;
            return Object.keys(patch).length > 0 ? patch : null;
        }
        case 'dropped':
        default:
            return null;
    }
}

/**
 * Whole days from one `YYYY-MM-DD` to another, or null if either is unusable.
 *
 * Parsed as UTC midnight on both sides so the subtraction can't be knocked off
 * by a daylight-saving change in between.
 */
export function daysBetween(from: string | undefined, to: string | undefined): number | null {
    if (!from || !to) return null;
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
    return Math.round((b - a) / 86_400_000);
}
