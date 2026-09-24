/**
 * The notification center's records, and everything done to them, as plain
 * functions over plain data — no Obsidian, no store, no clock of their own.
 *
 * Kept on each device apart from the settings. A notification is something
 * that happened here: a reminder shown on the laptop was not shown on the
 * phone, and marking it read on one says nothing about the other. It is also
 * not a setting — it does not belong in a profile, or in what sync merges.
 */

/**
 * Where "open" goes: a note (at a line), a view, or whatever a module opens
 * itself as — the prayer times are a dialog, not a view.
 */
export type OpenTarget =
    | { path: string; line?: number }
    | { view: string }
    | { module: string }
    | { command: string };

export interface NotificationRecord {
    id: string;
    /** The source event's key — one occurrence is never recorded twice. */
    key: string;
    /** Who sent it: `prayer`, `tasks`. */
    source: string;
    title: string;
    body?: string;
    /** When it was due. */
    at: number;
    /** When it reached the center. */
    createdAt: number;
    /** Its moment passed with nobody there — Obsidian closed, the machine asleep. */
    missed?: boolean;
    readAt?: number;
    /** Hidden until then, and back as unread when it comes. */
    snoozedUntil?: number;
    open?: OpenTarget;
    /** The source can mark the thing it is about as done. */
    completable?: boolean;
}

export interface NotificationState {
    records: NotificationRecord[];
    /** The scheduler's "handled up to" — see `core/scheduler.ts`. */
    watermark: number | null;
}

export const EMPTY_NOTIFICATIONS: NotificationState = { records: [], watermark: null };

/** How long a record is kept. */
export const HISTORY_MS = 30 * 86_400_000;

/**
 * How many records are kept at most, oldest going first. A month of five
 * prayer reminders a day is a hundred and fifty; the rest is room.
 */
export const MAX_RECORDS = 300;

/** Records past their month, and past the limit, dropped. Newest first. */
function trimmed(records: NotificationRecord[], now: number): NotificationRecord[] {
    return records
        .filter((r) => now - r.createdAt <= HISTORY_MS || (r.snoozedUntil ?? 0) > now)
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_RECORDS);
}

/** Add a record, unless its occurrence is already there. */
export function addRecord(
    state: NotificationState,
    record: NotificationRecord,
    now: number
): NotificationState {
    if (state.records.some((r) => r.key === record.key)) return state;
    return { ...state, records: trimmed([record, ...state.records], now) };
}

function update(
    state: NotificationState,
    id: string,
    change: (r: NotificationRecord) => NotificationRecord
): NotificationState {
    let hit = false;
    const records = state.records.map((r) => {
        if (r.id !== id) return r;
        hit = true;
        return change(r);
    });
    return hit ? { ...state, records } : state;
}

export function markRead(state: NotificationState, id: string, now: number): NotificationState {
    return update(state, id, (r) => (r.readAt ? r : { ...r, readAt: now }));
}

/** Read everything that is showing — a snoozed one is not showing yet. */
export function markAllRead(state: NotificationState, now: number): NotificationState {
    if (!state.records.some((r) => !r.readAt && !isSnoozed(r, now))) return state;
    return {
        ...state,
        records: state.records.map((r) => (r.readAt || isSnoozed(r, now) ? r : { ...r, readAt: now })),
    };
}

export function removeRecord(state: NotificationState, id: string): NotificationState {
    const records = state.records.filter((r) => r.id !== id);
    return records.length === state.records.length ? state : { ...state, records };
}

export function clearRead(state: NotificationState, now: number): NotificationState {
    const records = state.records.filter((r) => !r.readAt || isSnoozed(r, now));
    return records.length === state.records.length ? state : { ...state, records };
}

export function snoozeRecord(
    state: NotificationState,
    id: string,
    until: number
): NotificationState {
    return update(state, id, (r) => ({ ...r, snoozedUntil: until }));
}

/** A snooze that has come round: showing again, and unread. */
export function wakeRecord(state: NotificationState, id: string): NotificationState {
    return update(state, id, (r) => {
        const woken = { ...r };
        delete woken.snoozedUntil;
        delete woken.readAt;
        return woken;
    });
}

export const isSnoozed = (r: NotificationRecord, now: number): boolean =>
    (r.snoozedUntil ?? 0) > now;

/** Records to show, newest first — the snoozed ones wait out of sight. */
export function visibleRecords(state: NotificationState, now: number): NotificationRecord[] {
    return state.records.filter((r) => !isSnoozed(r, now));
}

export function unreadCount(state: NotificationState, now: number): number {
    return state.records.filter((r) => !r.readAt && !isSnoozed(r, now)).length;
}

export type SnoozeChoice = '10m' | '1h' | 'tomorrow';

/** When a snooze ends. "Tomorrow" is the same time tomorrow. */
export function snoozeUntil(choice: SnoozeChoice, now: number): number {
    if (choice === '10m') return now + 10 * 60_000;
    if (choice === '1h') return now + 60 * 60_000;
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.getTime();
}

/**
 * Is `now` inside the quiet hours? Hours are whole, `from` inclusive and `to`
 * exclusive, and the span may wrap midnight — 22 to 7 is the usual night.
 * A negative `from`, or `from === to`, is no quiet hours at all.
 */
export function isQuiet(now: number, from: number, to: number): boolean {
    if (from < 0 || to < 0 || from === to) return false;
    const hour = new Date(now).getHours();
    return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Records from today, and the rest. */
export function splitByDay(
    records: NotificationRecord[],
    now: number
): { today: NotificationRecord[]; earlier: NotificationRecord[] } {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const today: NotificationRecord[] = [];
    const earlier: NotificationRecord[] = [];
    for (const r of records) (r.at >= start.getTime() ? today : earlier).push(r);
    return { today, earlier };
}

/**
 * Read what `data.json` holds, trusting none of it: a hand edit or an older
 * build can have left anything there, and a record without a title or a time
 * is one the list cannot draw.
 */
export function normalizeNotifications(raw: unknown): NotificationState {
    if (!raw || typeof raw !== 'object') return EMPTY_NOTIFICATIONS;
    const obj = raw as { records?: unknown; watermark?: unknown };
    const records = Array.isArray(obj.records)
        ? obj.records.filter(
              (r): r is NotificationRecord =>
                  !!r &&
                  typeof r === 'object' &&
                  typeof (r as NotificationRecord).id === 'string' &&
                  typeof (r as NotificationRecord).key === 'string' &&
                  typeof (r as NotificationRecord).source === 'string' &&
                  typeof (r as NotificationRecord).title === 'string' &&
                  typeof (r as NotificationRecord).at === 'number' &&
                  typeof (r as NotificationRecord).createdAt === 'number'
          )
        : [];
    const watermark = typeof obj.watermark === 'number' ? obj.watermark : null;
    return { records, watermark };
}
