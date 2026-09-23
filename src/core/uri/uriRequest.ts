import type { JournalTracker } from '../journalConfig';
import type { TrackerValue } from '../../store/journalSlice';

/**
 * What an `obsidian://zenith?…` link asks for, read and checked before
 * anything is done about it.
 *
 * Any web page can open such a link — that is what makes it useful from a
 * phone's shortcuts, and what makes it a door. So the set of things a link can
 * ask for is small and additive: add a task, log a tracker for today, open a
 * view. Nothing here deletes, edits an existing task or reads anything back.
 * Everything else about safety — off by default, a limit on how often, an undo
 * on every write — lives with the handler; this file only reads.
 *
 * `do` names the action rather than `action`: Obsidian takes `action` for
 * itself, as the name the handler was registered under.
 */

export type UriRequest =
    | { kind: 'add-task'; text: string }
    | { kind: 'log'; tracker: string; value: LogValue }
    | { kind: 'open'; view: UriView };

/** `+2` adds, `5` sets, `true`/`false` ticks and clears. */
export type LogValue = { op: 'add'; amount: number } | { op: 'set'; amount: number } | boolean;

/** Views a link can open, by the name a person would use, to the module that has it. */
export const URI_VIEWS = {
    dashboard: 'dashboard',
    tasks: 'tasks',
    calendar: 'tasks-calendar',
    projects: 'projects',
    content: 'content',
    journal: 'journal',
    prayer: 'prayer',
} as const;
export type UriView = keyof typeof URI_VIEWS;

export type UriError =
    'unknown-action' | 'missing-text' | 'missing-tracker' | 'bad-value' | 'unknown-view';

/** A task title this long is a paste accident, not a task. */
export const MAX_TEXT = 500;

/**
 * One line of plain text. A newline in a task title would start a second line
 * in the note — another task, a heading, anything — so every line break
 * becomes a space.
 */
export function oneLine(raw: string): string {
    return raw
        .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT);
}

function readLogValue(raw: string | undefined): LogValue | null {
    // In a query string `+` means a space, so an unencoded `value=+1` arrives
    // as " 1". Read that as the "+1" it was typed as — "set to 1" would be a
    // quietly wrong answer to the most common shortcut there is.
    const typed = raw !== undefined && /^\s+\d/.test(raw) ? `+${raw.trim()}` : raw;
    const v = (typed ?? '+1').trim().toLowerCase();
    if (['true', 'yes', 'on', 'done', 'да'].includes(v)) return true;
    if (['false', 'no', 'off', 'нет'].includes(v)) return false;
    const signed = /^([+-])(\d+(?:[.,]\d+)?)$/.exec(v);
    if (signed) {
        const amount = Number(signed[2].replace(',', '.'));
        return { op: 'add', amount: signed[1] === '-' ? -amount : amount };
    }
    if (/^\d+(?:[.,]\d+)?$/.test(v)) return { op: 'set', amount: Number(v.replace(',', '.')) };
    return null;
}

/** Read a link's parameters. */
export function readUriRequest(
    params: Record<string, string | undefined>
): { ok: true; request: UriRequest } | { ok: false; error: UriError } {
    switch ((params.do ?? '').trim().toLowerCase()) {
        case 'add-task': {
            const text = oneLine(params.text ?? '');
            return text
                ? { ok: true, request: { kind: 'add-task', text } }
                : { ok: false, error: 'missing-text' };
        }
        case 'log': {
            const tracker = (params.tracker ?? '').trim();
            if (!tracker) return { ok: false, error: 'missing-tracker' };
            const value = readLogValue(params.value);
            return value === null
                ? { ok: false, error: 'bad-value' }
                : { ok: true, request: { kind: 'log', tracker, value } };
        }
        case 'open': {
            const view = (params.view ?? 'dashboard').trim().toLowerCase();
            return view in URI_VIEWS
                ? { ok: true, request: { kind: 'open', view: view as UriView } }
                : { ok: false, error: 'unknown-view' };
        }
        default:
            return { ok: false, error: 'unknown-action' };
    }
}

/**
 * The value a log request leaves the tracker at, from what it had — or null to
 * clear it — or `undefined` when the request does not fit the tracker (a
 * number for a check box).
 *
 * A number never goes below zero, and a scale stays within 1–5: a shortcut
 * pressed once too often should not leave a value the check-in cannot show.
 */
export function nextTrackerValue(
    tracker: Pick<JournalTracker, 'kind'>,
    current: TrackerValue | undefined,
    value: LogValue
): TrackerValue | null | undefined {
    if (tracker.kind === 'check') {
        if (typeof value === 'boolean') return value ? true : null;
        // "+1" on a check box is the natural way to say "done" from a shortcut.
        if (value.op === 'add' && value.amount > 0) return true;
        if (value.op === 'set') return value.amount > 0 ? true : null;
        return null;
    }
    if (typeof value === 'boolean') return undefined;
    const now = typeof current === 'number' ? current : 0;
    const next = value.op === 'add' ? now + value.amount : value.amount;
    if (tracker.kind === 'scale') return Math.min(5, Math.max(1, Math.round(next)));
    return Math.max(0, Math.round(next * 100) / 100);
}

/**
 * At most `limit` requests in any `windowMs`. A page that fires links in a
 * loop gets its first few through — each with an undo — and nothing more.
 */
export class RateLimiter {
    private readonly times: number[] = [];

    constructor(
        private readonly limit: number,
        private readonly windowMs: number
    ) {}

    /** Whether a request now is allowed; an allowed one is counted. */
    take(now = Date.now()): boolean {
        while (this.times.length && now - this.times[0] >= this.windowMs) this.times.shift();
        if (this.times.length >= this.limit) return false;
        this.times.push(now);
        return true;
    }
}
