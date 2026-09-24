import type { ContentStatus } from '../../../core/constants';
import { datesForStatus, daysBetween, type ContentDates } from './contentDates';

/**
 * Every time an item was read, watched or played — not just the first.
 *
 * `started` and `finished` hold one reading each, which is right for most of a
 * library and wrong for the book read again seven years later: its "reading
 * time" came out as seven years. A reading is kept as an ISO interval string,
 * `2019-03-01/2019-03-20`, the last one open while it is going on
 * (`2026-08-02/`):
 *
 * ```yaml
 * readings: ["2019-03-01/2019-03-20", "2026-08-02/"]
 * ```
 *
 * The list is only written once an item is read a second time — a book read
 * once needs nothing more than its two dates, and its note is not touched.
 * `started` and `finished` go on meaning what they always did (the first start,
 * the last finish), so everything that reads them keeps working unchanged.
 */

export interface Reading {
    start?: string;
    end?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `2019-03-01/2019-03-20` → a reading, or null when it is not one. */
export function parseReading(raw: unknown): Reading | null {
    if (typeof raw !== 'string') return null;
    const [start, end, extra] = raw.trim().split('/');
    if (extra !== undefined || end === undefined) return null;
    if ((start && !ISO.test(start)) || (end && !ISO.test(end))) return null;
    if (!start && !end) return null;
    return { start: start || undefined, end: end || undefined };
}

export function formatReading(r: Reading): string {
    return `${r.start ?? ''}/${r.end ?? ''}`;
}

/** The `readings` a note holds, cleaned: anything unreadable is left out. */
export function parseReadingList(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out = raw
        .map(parseReading)
        .filter((r): r is Reading => r !== null)
        .map(formatReading);
    return out.length ? out : undefined;
}

/**
 * The readings an item has had: its list, or — before it has one — the single
 * reading its two dates describe.
 */
export function readingsOf(item: ContentDates & { readings?: string[] }): Reading[] {
    if (item.readings?.length) {
        return item.readings.map(parseReading).filter((r): r is Reading => r !== null);
    }
    if (item.started || item.finished) return [{ start: item.started, end: item.finished }];
    return [];
}

const isOpen = (r: Reading) => !!r.start && !r.end;

/**
 * The readings list a status change leaves, or null when it is unchanged.
 * `undefined` inside the result is never used: a list, or no change.
 *
 * - Back to *in progress* from finished — a re-read: the list is made from the
 *   two dates if there was none, and today opens a new reading.
 * - *Completed* closes the open reading today.
 * - *Backlog* drops the reading that had begun, and keeps the finished ones:
 *   "not started yet" is about now, not about the history.
 * - *Dropped* leaves the list as it is.
 */
export function readingsForStatus(
    next: ContentStatus,
    prev: ContentDates & { readings?: string[] },
    today: string
): string[] | null {
    const readings = readingsOf(prev);
    const hasList = !!prev.readings?.length;
    const open = readings.some(isOpen);

    switch (next) {
        case 'in-progress':
            // Only a finished item can be re-read; a first reading is the
            // started date, and needs no list.
            if (!prev.finished || open) return null;
            return [...readings, { start: today }].map(formatReading);
        case 'completed':
            if (!hasList || !open) return null;
            return readings.map((r) => (isOpen(r) ? { ...r, end: today } : r)).map(formatReading);
        case 'backlog':
            if (!hasList || !open) return null;
            return readings.filter((r) => !isOpen(r)).map(formatReading);
        default:
            return null;
    }
}

export interface Transition extends ContentDates {
    readings?: string[];
}

/**
 * Everything a status change writes: the date stamps, and — with readings kept —
 * the readings list. Null when nothing changes.
 */
export function transitionFor(
    next: ContentStatus,
    prev: ContentDates & { readings?: string[] },
    today: string,
    withReadings: boolean
): Transition | null {
    const dates = datesForStatus(next, prev, today);
    const readings = withReadings ? readingsForStatus(next, prev, today) : null;
    if (!dates && !readings) return null;
    return { ...(dates ?? {}), ...(readings ? { readings } : {}) };
}

/** Days each finished reading took. A reading missing either end has no length. */
export function readingDurations(item: ContentDates & { readings?: string[] }): number[] {
    return readingsOf(item)
        .map((r) => daysBetween(r.start, r.end))
        .filter((d): d is number => d !== null);
}

/** Readings that got to the end. */
export function finishedReadings(item: ContentDates & { readings?: string[] }): number {
    return readingsOf(item).filter((r) => !!r.end).length;
}
