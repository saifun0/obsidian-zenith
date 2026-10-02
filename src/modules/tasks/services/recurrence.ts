/**
 * When a recurring task comes round again.
 *
 * The rules are the Tasks plugin's, because the notes are: a line written
 * there as `🔁 every week on Monday` has to mean the same thing when it is
 * ticked off here. What a rule this file cannot read used to mean was "no next
 * occurrence" — the task was marked done and the series quietly ended, which is
 * the one outcome nobody writing a repeat wants. So the grammar covers what
 * Tasks users actually write, and what it still cannot read is reported to the
 * caller as `null` rather than guessed at.
 *
 * Understood, after an optional leading `every`:
 *
 *   day · week · month · year, with a count (`3 days`) or `other` (`other week`)
 *   daily · weekly · monthly · yearly · annually
 *   weekday · weekdays — Monday to Friday
 *   monday · mondays · monday and thursday — the same as `week on …`
 *   week on monday, friday — and `2 weeks on tuesday`
 *   month on the 15th · on the last · on the 2nd tuesday · on the last friday
 *   …, when done — counted from the day it was finished, not from its date
 *
 * Dates are calendar days, worked in UTC so that a clock change in between
 * cannot move one.
 */

type Unit = 'day' | 'week' | 'month' | 'year';

export interface RecurrenceRule {
    unit: Unit;
    interval: number;
    /** Weekly: the days it falls on, 0 = Sunday. Empty means "the same weekday". */
    weekdays: number[];
    /** Monthly: a day of the month, 1–31, or -1 for the last. */
    monthDay?: number;
    /** Monthly: the nth weekday of the month; `n` is 1–5, or -1 for the last. */
    nthWeekday?: { n: number; day: number };
    /** Count from the day it was done rather than from the date it carried. */
    whenDone: boolean;
}

const WEEKDAYS: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

const ORDINALS: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    last: -1,
};

const ADVERBS: Record<string, Unit> = {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
    annually: 'year',
};

/** A sane ceiling: `every 100000 days` is a typo, not a plan. */
const MAX_INTERVAL = 999;

/** Read a rule, or null when it is not one this engine can run. */
export function parseRecurrence(text: string): RecurrenceRule | null {
    let r = text.toLowerCase().trim().replace(/\s+/g, ' ');
    let whenDone = false;
    const done = /,? ?when done$/.exec(r);
    if (done) {
        whenDone = true;
        r = r.slice(0, done.index).trim();
    }
    r = r.replace(/^every /, '');

    const rule = (unit: Unit, interval = 1): RecurrenceRule => ({
        unit,
        interval,
        weekdays: [],
        whenDone,
    });

    if (ADVERBS[r]) return rule(ADVERBS[r]);
    if (/^(?:weekday|weekdays|business day|working day)s?$/.test(r)) {
        return { ...rule('week'), weekdays: [1, 2, 3, 4, 5] };
    }

    // "monday", "mondays and thursdays": a week with its days named.
    const days = weekdayList(r);
    if (days) return { ...rule('week'), weekdays: days };

    const m = /^(?:(\d+|other) )?(day|week|month|year)s?(?: on (.+))?$/.exec(r);
    if (!m) return null;

    const interval = m[1] === undefined ? 1 : m[1] === 'other' ? 2 : Number(m[1]);
    if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return null;
    const unit = m[2] as Unit;
    const on = m[3];
    const base = rule(unit, interval);
    if (on === undefined) return base;

    if (unit === 'week') {
        const named = weekdayList(on);
        return named ? { ...base, weekdays: named } : null;
    }
    if (unit === 'month') {
        const qualifier = monthQualifier(on);
        return qualifier ? { ...base, ...qualifier } : null;
    }
    return null;
}

/** "monday, wednesday and friday" → [1, 3, 5]; null when any part is not a day. */
function weekdayList(text: string): number[] | null {
    const parts = text
        .split(/\s*(?:,|\band\b|&)\s*/)
        .map((p) => p.trim().replace(/s$/, ''))
        .filter(Boolean);
    if (parts.length === 0) return null;
    const out: number[] = [];
    for (const part of parts) {
        const day = WEEKDAYS[part];
        if (day === undefined) return null;
        if (!out.includes(day)) out.push(day);
    }
    return out.sort((a, b) => a - b);
}

function monthQualifier(text: string): Pick<RecurrenceRule, 'monthDay' | 'nthWeekday'> | null {
    const t = text.replace(/^the /, '');
    if (/^last(?: day)?$/.test(t)) return { monthDay: -1 };

    const day = /^(\d{1,2})(?:st|nd|rd|th)?(?: day)?$/.exec(t);
    if (day) {
        const n = Number(day[1]);
        return n >= 1 && n <= 31 ? { monthDay: n } : null;
    }

    const nth = /^(first|second|third|fourth|fifth|last|[1-5](?:st|nd|rd|th)) (\w+)$/.exec(t);
    if (nth) {
        const weekday = WEEKDAYS[nth[2]];
        if (weekday === undefined) return null;
        const n = ORDINALS[nth[1]] ?? Number(nth[1][0]);
        return { nthWeekday: { n, day: weekday } };
    }
    return null;
}

/**
 * The next date after `from` that the rule lands on, or null when the rule is
 * not readable or the date is not a date.
 *
 * `completedOn` is the day the task was ticked off, used only by `when done`.
 */
export function nextRecurrenceDate(
    rule: string,
    from: string,
    completedOn?: string
): string | null {
    const parsed = parseRecurrence(rule);
    if (!parsed) return null;
    const base = parseIso(parsed.whenDone && completedOn ? completedOn : from);
    if (base === null) return null;

    const next = advance(parsed, base);
    return next === null ? null : formatIso(next);
}

/** Whether Zenith can work out a next date for this rule. */
export function isRecurrenceUnderstood(rule: string): boolean {
    return parseRecurrence(rule) !== null;
}

function advance(rule: RecurrenceRule, base: Date): Date | null {
    switch (rule.unit) {
        case 'day':
            return addDays(base, rule.interval);
        case 'week':
            return rule.weekdays.length > 0
                ? nextWeekday(base, rule.weekdays, rule.interval)
                : addDays(base, 7 * rule.interval);
        case 'month':
            if (rule.monthDay !== undefined || rule.nthWeekday) return nextInMonth(rule, base);
            return addMonthsClamped(base, rule.interval);
        case 'year':
            return addMonthsClamped(base, 12 * rule.interval);
    }
}

/**
 * The next named weekday, counting weeks from the one `base` is in.
 *
 * Weeks start on Monday, as they do for the Tasks plugin: `every 2 weeks on
 * Monday and Friday` from a Monday is that Friday, then the Monday a fortnight
 * after the first.
 */
function nextWeekday(base: Date, weekdays: number[], interval: number): Date {
    const sinceMonday = (base.getUTCDay() + 6) % 7;
    for (let offset = 1; offset < 7 - sinceMonday; offset++) {
        const day = addDays(base, offset);
        if (weekdays.includes(day.getUTCDay())) return day;
    }
    const monday = addDays(base, 7 * interval - sinceMonday);
    for (let offset = 0; offset < 7; offset++) {
        const day = addDays(monday, offset);
        if (weekdays.includes(day.getUTCDay())) return day;
    }
    // Unreachable with a non-empty list; the plain weekly step is the safe answer.
    return addDays(base, 7 * interval);
}

/**
 * The next qualifying day in this month or a later one, `interval` months
 * apart. A day the month does not have — the 31st of April — is its last day,
 * the way the Tasks plugin reads it; a fifth Friday a month lacks is skipped.
 */
function nextInMonth(rule: RecurrenceRule, base: Date): Date | null {
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    // Four years of months at the widest interval is far more than any rule
    // here needs; the bound only stops a fifth-weekday hunt from spinning.
    for (let k = 0; k <= 48; k++) {
        const target = new Date(Date.UTC(year, month + k * rule.interval, 1));
        const candidate = dayInMonth(rule, target.getUTCFullYear(), target.getUTCMonth());
        if (candidate && candidate.getTime() > base.getTime()) return candidate;
    }
    return null;
}

function dayInMonth(rule: RecurrenceRule, year: number, month: number): Date | null {
    const last = daysInMonth(year, month);
    if (rule.monthDay !== undefined) {
        const day = rule.monthDay === -1 ? last : Math.min(rule.monthDay, last);
        return new Date(Date.UTC(year, month, day));
    }
    if (!rule.nthWeekday) return null;
    const { n, day } = rule.nthWeekday;
    if (n === -1) {
        const lastDate = new Date(Date.UTC(year, month, last));
        const back = (lastDate.getUTCDay() - day + 7) % 7;
        return addDays(lastDate, -back);
    }
    const first = new Date(Date.UTC(year, month, 1));
    const ahead = (day - first.getUTCDay() + 7) % 7;
    const date = 1 + ahead + (n - 1) * 7;
    return date <= last ? new Date(Date.UTC(year, month, date)) : null;
}

/**
 * Months later, on the same day where the month has it and on its last day
 * where it does not: the 31st of January comes back on the 28th of February,
 * not on the 3rd of March, which is what a plain `setMonth` makes of it.
 */
function addMonthsClamped(base: Date, months: number): Date {
    const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth();
    return new Date(Date.UTC(year, month, Math.min(base.getUTCDate(), daysInMonth(year, month))));
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
}

function parseIso(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
