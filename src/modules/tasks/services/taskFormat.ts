import type { Priority, TaskStatus } from '../../../core/constants';

/**
 * Pure, Obsidian-free helpers for the Zenith task line format. Shared by the
 * writer (build a line) and the parser (read a line) so the two round-trip, and
 * unit-testable in isolation.
 *
 * Uses the widely-adopted Tasks-plugin emoji convention:
 *   `- [ ] <title> <priority> 🔁 <recurrence> 🛫 <start> ⏳ <scheduled> 📅 <due> ✅ <done> #tags`
 * The status lives in the checkbox itself (`[ ] [/] [x] [-]`), handled by the
 * writer; the body carries everything else.
 */

// Inline priority markers.
export const PRIORITY_EMOJI: Record<Priority, string> = {
    none: '',
    low: '🔽',
    medium: '',
    high: '🔼',
    urgent: '⏫',
};

const ISO = '(\\d{4}-\\d{2}-\\d{2})';
const TAG_RE = /#[\w/-]+/g;
const DUE_RE = new RegExp(`📅\\s*${ISO}`);
const START_RE = new RegExp(`🛫\\s*${ISO}`);
const SCHEDULED_RE = new RegExp(`⏳\\s*${ISO}`);
const DONE_RE = new RegExp(`✅\\s*${ISO}`);
/** When a task was given up on. `❌` is the Tasks convention, as `✅` is for done. */
const CANCELLED_RE = new RegExp(`❌\\s*${ISO}`);
const RECUR_RE = /🔁\s*([^📅🛫⏳✅❌➕🔁⏰⏱⏲#\n]+)/u;

/**
 * When a task happens, as opposed to the day `📅` gives it: `⏰ 09:00`, or
 * `⏰ 09:00-10:30` when it also ends at a known hour.
 *
 * A separate marker rather than a time appended to `📅 2026-09-01`: other
 * readers of this convention parse that date with a fixed pattern, and a
 * trailing time would either be ignored or break them. On its own, `⏰` is one
 * more marker they skip — and so is the `-10:30` hanging off it.
 *
 * The dash may be a hyphen, an en dash or an em dash, because a note typed by
 * hand (or autocorrected by the editor) uses whichever it feels like.
 */
const DUE_TIME_RE = /⏰\s*(\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?/;
/** Time already spent on the task, accumulated across sessions. */
const SPENT_RE = /⏱\s*(\d+(?:h\d*)?m?|\d+h)/;
/** The countdown the user set, in case they want the same one again. */
const TIMER_RE = /⏲\s*(\d+(?:h\d*)?m?|\d+h)/;

// Everything that must be stripped from the raw text to recover the title.
const ALL_MARKERS_RE =
    /(?:📅|🛫|⏳|✅|❌|➕)\s*\d{4}-\d{2}-\d{2}|⏰\s*\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?|(?:⏱|⏲)\s*\d+(?:h\d*)?m?|🔁\s*[^📅🛫⏳✅❌➕🔁⏰⏱⏲#\n]+|⏫|🔼|🔽/gu;

/**
 * Read a duration like `90m`, `2h`, `1h25m` as whole minutes.
 *
 * Written the way a person would write it rather than as a raw count of
 * seconds: the line is meant to be read and edited by hand, and `⏱ 5100` says
 * nothing to the eye that `⏱ 1h25m` doesn't say better.
 */
export function parseDuration(raw: string): number | undefined {
    const m = raw.trim().match(/^(?:(\d+)h)?(?:(\d+)m?)?$/);
    if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
    const hours = m[1] ? parseInt(m[1], 10) : 0;
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const total = hours * 60 + minutes;
    return total > 0 ? total : undefined;
}

/** The inverse: 85 → `1h25m`, 120 → `2h`, 45 → `45m`. */
export function formatDuration(minutes: number): string {
    const whole = Math.max(0, Math.round(minutes));
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** `9:5` → `09:05`; anything that isn't a time of day → undefined. */
export function normalizeTimeOfDay(raw: string): string | undefined {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return undefined;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return undefined;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * The end of a `⏰` range, kept only when it is a real time *after* the start.
 *
 * Both zero-length and backwards ranges are dropped rather than repaired: they
 * come from a typo or from an edit that moved the start past the end, and a
 * calendar block of negative height is not a thing that can be drawn. An end
 * that would cross midnight goes the same way — the task then simply has a
 * start, which every reader of the marker already handles.
 *
 * Normalized `HH:MM` compares correctly as a string, which is why this can be a
 * `>` and not a parse.
 */
function endAfter(start: string, raw: string | undefined): string | undefined {
    const end = normalizeTimeOfDay(raw ?? '');
    return end && end > start ? end : undefined;
}

export interface TaskInput {
    title: string;
    /** Checkbox status — used by the writer for the `[ ]` char; ignored by the body. */
    status?: TaskStatus;
    priority: Priority;
    tags: string[];
    dueDate?: string;
    startDate?: string;
    scheduledDate?: string;
    doneDate?: string;
    cancelledDate?: string;
    /** Hour of the day the task is due, `HH:MM`. Needs `dueDate` to mean anything. */
    dueTime?: string;
    /** Hour it ends at, `HH:MM`. Written only when it is after `dueTime`. */
    dueEndTime?: string;
    /** Minutes already spent on it. */
    spentMinutes?: number;
    /** Minutes the countdown was last set to. */
    timerMinutes?: number;
    recurrence?: string;
    /** Subtask titles (only consumed by `addTask` when creating). */
    subtasks?: string[];
}

export interface TaskDefaults {
    priority: Priority;
    dueDate?: string;
    tags: string[];
}

export interface ParsedTaskText {
    title: string;
    priority: Priority;
    tags: string[];
    dueDate?: string;
    startDate?: string;
    scheduledDate?: string;
    doneDate?: string;
    cancelledDate?: string;
    /** Hour of the day the task is due, `HH:MM`. Needs `dueDate` to mean anything. */
    dueTime?: string;
    /** Hour it ends at, `HH:MM`. Only set when the line stated one after the start. */
    dueEndTime?: string;
    /** Minutes already spent on it. */
    spentMinutes?: number;
    /** Minutes the countdown was last set to. */
    timerMinutes?: number;
    recurrence?: string;
}

/** Extract inline `#tags` (nested `#a/b` allowed) without the leading `#`. */
export function parseInlineTags(text: string): string[] {
    const matches = text.match(TAG_RE);
    return matches ? matches.map((t) => t.slice(1)) : [];
}

/** The task text after the checkbox: title + priority + recurrence + dates + tags. */
export function buildTaskBody(input: TaskInput): string {
    const parts = [input.title.trim()];

    const emoji = PRIORITY_EMOJI[input.priority];
    if (emoji) parts.push(emoji);

    if (input.recurrence?.trim()) parts.push(`🔁 ${input.recurrence.trim()}`);
    if (input.startDate) parts.push(`🛫 ${input.startDate}`);
    if (input.scheduledDate) parts.push(`⏳ ${input.scheduledDate}`);
    if (input.dueDate) parts.push(`📅 ${input.dueDate}`);
    // Right after the date it qualifies, so the two read as one deadline. The
    // end is normalized and re-checked here rather than trusted from the form:
    // this is the single door every write goes through, and it is the only
    // place that can guarantee no line is ever written with a backwards range.
    if (input.dueTime) {
        const start = normalizeTimeOfDay(input.dueTime) ?? input.dueTime;
        const end = endAfter(start, input.dueEndTime);
        parts.push(`⏰ ${start}${end ? `-${end}` : ''}`);
    }
    if (input.spentMinutes) parts.push(`⏱ ${formatDuration(input.spentMinutes)}`);
    if (input.timerMinutes) parts.push(`⏲ ${formatDuration(input.timerMinutes)}`);
    if (input.doneDate) parts.push(`✅ ${input.doneDate}`);
    if (input.cancelledDate) parts.push(`❌ ${input.cancelledDate}`);

    for (const tag of input.tags) {
        const clean = tag.replace(/^#/, '').trim();
        if (clean) parts.push(`#${clean}`);
    }

    return parts.join(' ');
}

/** A full `- [ ] …` task line for a new task (status defaults to todo). */
export function buildTaskLine(input: TaskInput): string {
    const char = input.status === 'done' ? 'x'
        : input.status === 'in-progress' ? '/'
        : input.status === 'cancelled' ? '-'
        : ' ';
    return `- [${char}] ${buildTaskBody(input)}`;
}

function firstMatch(re: RegExp, text: string): string | undefined {
    const m = text.match(re);
    return m ? m[1] : undefined;
}

/**
 * Parse a task's text (the part after the checkbox) into structured fields,
 * layering the file-level defaults underneath any inline markers.
 */
export function parseTaskText(text: string, defaults: TaskDefaults): ParsedTaskText {
    const inlineTags = parseInlineTags(text);

    let priority = defaults.priority;
    if (text.includes('⏫')) priority = 'urgent';
    else if (text.includes('🔼')) priority = 'high';
    else if (text.includes('🔽')) priority = 'low';

    const title =
        text
            .replace(TAG_RE, '')
            .replace(ALL_MARKERS_RE, '')
            .replace(/\s+/g, ' ')
            .trim() || text.trim();

    const recurMatch = text.match(RECUR_RE);
    const timeMatch = text.match(DUE_TIME_RE);
    const dueTime = normalizeTimeOfDay(timeMatch?.[1] ?? '');

    return {
        title,
        priority,
        tags: [...new Set([...defaults.tags, ...inlineTags])],
        dueDate: firstMatch(DUE_RE, text) ?? defaults.dueDate,
        dueTime,
        dueEndTime: dueTime ? endAfter(dueTime, timeMatch?.[2]) : undefined,
        spentMinutes: parseDuration(firstMatch(SPENT_RE, text) ?? ''),
        timerMinutes: parseDuration(firstMatch(TIMER_RE, text) ?? ''),
        startDate: firstMatch(START_RE, text),
        scheduledDate: firstMatch(SCHEDULED_RE, text),
        doneDate: firstMatch(DONE_RE, text),
        cancelledDate: firstMatch(CANCELLED_RE, text),
        recurrence: recurMatch ? recurMatch[1].trim() : undefined,
    };
}

/** Format a Date as local `YYYY-MM-DD`. */
function localIso(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
}

/** Add `days` to an ISO date, returning a new ISO date. */
export function shiftIsoDate(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    d.setDate(d.getDate() + days);
    return localIso(d);
}

/**
 * Whole days from `a` to `b` (b - a).
 *
 * Re-exported from core so the long-standing `taskFormat` import path keeps
 * working; the implementation lives in `core/dateUtils` alongside the rest of
 * the local-midnight date helpers.
 */
export { daysBetweenIso } from '../../../core/dateUtils';

/** Parse a recurrence rule into a function that advances a date. Returns null if unrecognized. */
export function nextRecurrenceDate(rule: string, from: string): string | null {
    const base = new Date(`${from}T00:00:00`);
    if (Number.isNaN(base.getTime())) return null;

    const r = rule.toLowerCase().trim().replace(/^every\s+/, '');
    let days = 0;
    let months = 0;

    if (/^(day|daily|1 day)$/.test(r)) days = 1;
    else if (/^(week|weekly|1 week)$/.test(r)) days = 7;
    else if (/^(month|monthly|1 month)$/.test(r)) months = 1;
    else if (/^(year|yearly|annually|1 year)$/.test(r)) months = 12;
    else {
        const m = r.match(/^(\d+)\s*(day|week|month|year)s?$/);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        if (m[2] === 'day') days = n;
        else if (m[2] === 'week') days = n * 7;
        else if (m[2] === 'month') months = n;
        else months = n * 12;
    }

    if (months) base.setMonth(base.getMonth() + months);
    if (days) base.setDate(base.getDate() + days);

    return localIso(base);
}
