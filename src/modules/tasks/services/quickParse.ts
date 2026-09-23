import type { Priority } from '../../../core/constants';
import { shiftIsoDate } from './taskFormat';

/**
 * "Позвонить маме завтра в 18 !" → a title, a date, a time and a priority.
 *
 * A narrow grammar on purpose, in Russian and English: a word it does not know
 * stays part of the title, and only what it did recognise is shown back as a
 * chip the user can take away. A phrase half understood therefore looks half
 * understood — nothing is dropped, and nothing is guessed at silently.
 *
 * What it knows:
 * - dates: today / tomorrow / the day after, a weekday (with or without
 *   "в" / "on"), `+3д` / `+2w`, `15.10` or `15.10.2027`;
 * - times: `в 18`, `at 9:30`, `18:00`, `6pm`, a range `18–19` or `с 18 до 19`;
 * - priority: `!` (🔼) and `!!` (⏫), standing alone;
 * - repeats the recurrence engine can run: every day / week / month / year,
 *   every N days / weeks / months / years.
 *
 * `#tags` are left in the title: they are already the task's own syntax.
 *
 * Pure — text in, fields out — so the quick-add form, and anything that
 * captures a task from outside, read a phrase the same way.
 */

export type QuickPieceKind = 'date' | 'time' | 'priority' | 'recurrence';

export interface QuickPiece {
    kind: QuickPieceKind;
    /** The text as typed. */
    text: string;
    /** Stable across edits elsewhere in the phrase: what "ignore this" is keyed by. */
    key: string;
    start: number;
    end: number;
}

export interface QuickParse {
    /** The phrase with every recognised piece taken out. */
    title: string;
    dueDate?: string;
    dueTime?: string;
    dueEndTime?: string;
    priority?: Priority;
    /** In the recurrence engine's own words: `every day`, `every 2 weeks`. */
    recurrence?: string;
    /**
     * The date was not said but is needed — a time or a repeat means nothing
     * without one — so today was assumed.
     */
    impliedDate: boolean;
    pieces: QuickPiece[];
}

/** Starts a piece: the start of the text, whitespace or an opening bracket. */
const B = '(?<=^|[\\s(])';
/** Ends one: the end, whitespace, a closing bracket or punctuation. */
const E = '(?=$|[\\s),.;:!?])';

interface Candidate {
    kind: QuickPieceKind;
    start: number;
    end: number;
    text: string;
    apply: (out: QuickParse, today: string) => boolean;
}

type Rule = {
    kind: QuickPieceKind;
    re: RegExp;
    /** Fills the fields; false when the match turns out not to mean anything (31.02). */
    apply: (m: RegExpExecArray, out: QuickParse, today: string) => boolean;
};

const rule = (kind: QuickPieceKind, body: string, apply: Rule['apply']): Rule => ({
    kind,
    re: new RegExp(`${B}(?:${body})${E}`, 'giu'),
    apply,
});

const pad = (n: number) => String(n).padStart(2, '0');

// ── Dates ────────────────────────────────────────────

/** Weekday names by JS day number (0 = Sunday). Short English forms that are also words need "on". */
const WEEKDAYS: Array<{ day: number; ru: string; en: string }> = [
    { day: 1, ru: 'пн|пнд|понедельник', en: 'mon|monday' },
    { day: 2, ru: 'вт|втр|вторник', en: 'tue|tues|tuesday' },
    { day: 3, ru: 'ср|среда|среду', en: 'wed|wednesday' },
    { day: 4, ru: 'чт|чтв|четверг', en: 'thu|thur|thurs|thursday' },
    { day: 5, ru: 'пт|птн|пятница|пятницу', en: 'fri|friday' },
    { day: 6, ru: 'сб|суббота|субботу', en: 'saturday|on\\s+sat' },
    { day: 0, ru: 'вс|воскресенье', en: 'sunday|on\\s+sun' },
];

/** The next such weekday after today — a weekday named for today means next week. */
function nextWeekday(today: string, day: number): string {
    const now = new Date(`${today}T00:00:00`).getDay();
    return shiftIsoDate(today, (day - now + 7) % 7 || 7);
}

function setDate(out: QuickParse, iso: string): boolean {
    out.dueDate = iso;
    return true;
}

/** `15.10` (the next one), `15.10.26`, `15.10.2026` — only a date that exists. */
function dotDate(m: RegExpExecArray, today: string): string | null {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : Number(today.slice(0, 4));
    const make = (y: number) => {
        const d = new Date(y, month - 1, day);
        return d.getMonth() === month - 1 && d.getDate() === day
            ? `${y}-${pad(month)}-${pad(day)}`
            : null;
    };
    let iso = make(year);
    // Without a year a date already past means next year's: nobody schedules
    // for last March.
    if (iso && !m[3] && iso < today) iso = make(++year);
    return iso;
}

// ── Times ────────────────────────────────────────────

/** `18`, `9:30`, `6pm` → `HH:MM`, or null when it is not a time of day. */
function clock(h: string, min: string | undefined, meridiem?: string): string | null {
    let hours = Number(h);
    const minutes = min === undefined ? 0 : Number(min);
    if (meridiem) {
        if (hours < 1 || hours > 12) return null;
        const pm = meridiem.toLowerCase() === 'pm';
        hours = (hours % 12) + (pm ? 12 : 0);
    }
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
}

function setTime(out: QuickParse, start: string | null, end?: string | null): boolean {
    if (!start || end === null) return false;
    // A range that runs backwards, or nowhere, is not a range — and the task
    // format has no way to say "until tomorrow morning".
    if (end !== undefined && end <= start) return false;
    out.dueTime = start;
    if (end) out.dueEndTime = end;
    return true;
}

const H = '(\\d{1,2})';
const HM = '(\\d{1,2})(?::(\\d{2}))?';
const DASH = '\\s*[-–—]\\s*';

// ── Repeats ──────────────────────────────────────────

type Unit = 'day' | 'week' | 'month' | 'year';

const every = (n: number, unit: Unit) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`);

/** Russian and English unit words, singular and plural, to the engine's unit. */
function unitOf(word: string): Unit | null {
    const w = word.toLowerCase();
    if (/^(день|дня|дней|day|days)$/.test(w)) return 'day';
    if (/^(неделю|недели|недель|week|weeks)$/.test(w)) return 'week';
    if (/^(месяц|месяца|месяцев|month|months)$/.test(w)) return 'month';
    if (/^(год|года|лет|year|years)$/.test(w)) return 'year';
    return null;
}

/** "Every day" said in one word. */
const ADVERB: Record<string, Unit> = {
    ежедневно: 'day',
    еженедельно: 'week',
    ежемесячно: 'month',
    ежегодно: 'year',
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
    annually: 'year',
};

function setRepeat(out: QuickParse, value: string | null): boolean {
    if (!value) return false;
    out.recurrence = value;
    return true;
}

// ── The grammar ──────────────────────────────────────

const RULES: Rule[] = [
    // Repeats first: "каждый день" must not lose "день" to anything else.
    rule('recurrence', '(?:каждый|каждую|каждое)\\s+(день|неделю|месяц|год)', (m, out) =>
        setRepeat(out, every(1, unitOf(m[1])!))
    ),
    rule(
        'recurrence',
        'каждые\\s+(\\d{1,3})\\s+(дня|дней|недели|недель|месяца|месяцев|года|лет)',
        (m, out) => setRepeat(out, Number(m[1]) > 0 ? every(Number(m[1]), unitOf(m[2])!) : null)
    ),
    rule('recurrence', 'ежедневно|еженедельно|ежемесячно|ежегодно', (m, out) =>
        setRepeat(out, every(1, ADVERB[m[0].toLowerCase()]))
    ),
    rule('recurrence', 'every\\s+(day|week|month|year)', (m, out) =>
        setRepeat(out, every(1, unitOf(m[1])!))
    ),
    rule('recurrence', 'every\\s+(\\d{1,3})\\s+(days?|weeks?|months?|years?)', (m, out) =>
        setRepeat(out, Number(m[1]) > 0 ? every(Number(m[1]), unitOf(m[2])!) : null)
    ),
    rule('recurrence', 'daily|weekly|monthly|yearly|annually', (m, out) =>
        setRepeat(out, every(1, ADVERB[m[0].toLowerCase()]))
    ),

    // Dates.
    rule('date', 'послезавтра|day\\s+after\\s+tomorrow', (_m, out, today) =>
        setDate(out, shiftIsoDate(today, 2))
    ),
    rule('date', 'сегодня|today', (_m, out, today) => setDate(out, today)),
    rule('date', 'завтра|tomorrow', (_m, out, today) => setDate(out, shiftIsoDate(today, 1))),
    ...WEEKDAYS.map((w) =>
        rule('date', `(?:(?:в|во|on)\\s+)?(?:${w.ru}|${w.en})`, (_m, out, today) =>
            setDate(out, nextWeekday(today, w.day))
        )
    ),
    rule('date', '\\+(\\d{1,3})\\s?(д|дн|d|н|нед|w)', (m, out, today) => {
        const n = Number(m[1]);
        const weeks = /^(н|нед|w)$/i.test(m[2]);
        return n > 0 && setDate(out, shiftIsoDate(today, weeks ? n * 7 : n));
    }),
    rule('date', '(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}|\\d{2}))?', (m, out, today) => {
        const iso = dotDate(m, today);
        return !!iso && setDate(out, iso);
    }),

    // Times. A bare number is never a time — "купить 2 хлеба" is not two
    // o'clock — so a time needs a colon, am/pm, or "в" / "at" in front.
    rule('time', `(?:с|from)\\s+${HM}\\s+(?:до|to|till|until)\\s+${HM}`, (m, out) =>
        setTime(out, clock(m[1], m[2]), clock(m[3], m[4]))
    ),
    rule('time', `(?:в|во|at)\\s+${HM}${DASH}${HM}`, (m, out) =>
        setTime(out, clock(m[1], m[2]), clock(m[3], m[4]))
    ),
    rule('time', `(\\d{1,2}):(\\d{2})${DASH}${HM}`, (m, out) =>
        setTime(out, clock(m[1], m[2]), clock(m[3], m[4]))
    ),
    rule('time', `${H}${DASH}(\\d{1,2}):(\\d{2})`, (m, out) =>
        setTime(out, clock(m[1], undefined), clock(m[2], m[3]))
    ),
    rule('time', `(?:(?:в|во|at)\\s+)?${HM}\\s?(am|pm)`, (m, out) =>
        setTime(out, clock(m[1], m[2], m[3]))
    ),
    rule('time', `(?:в|во|at)\\s+${HM}`, (m, out) => setTime(out, clock(m[1], m[2]))),
    rule('time', '(\\d{1,2}):(\\d{2})', (m, out) => setTime(out, clock(m[1], m[2]))),

    // Priority, as marks standing on their own; "Позвонить!" keeps its "!".
    rule('priority', '!!', (_m, out) => {
        out.priority = 'urgent';
        return true;
    }),
    rule('priority', '!', (_m, out) => {
        out.priority = 'high';
        return true;
    }),
];

/** What "ignore this chip" remembers: the kind and the words, not the position. */
export function pieceKey(kind: QuickPieceKind, text: string): string {
    return `${kind}:${text.toLowerCase().replace(/\s+/g, ' ')}`;
}

/**
 * Read a phrase. `ignore` holds the keys of pieces the user took the chip off:
 * those stay in the title as words.
 */
export function quickParse(
    text: string,
    today: string,
    ignore: ReadonlySet<string> = new Set()
): QuickParse {
    const out: QuickParse = { title: '', impliedDate: false, pieces: [] };

    const candidates: Candidate[] = [];
    RULES.forEach((r) => {
        r.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = r.re.exec(text))) {
            const match = m;
            candidates.push({
                kind: r.kind,
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                apply: (o, t) => r.apply(match, o, t),
            });
        }
    });

    // Earliest first; at one position the longest ("завтра в 18" is two pieces,
    // but "каждые 2 дня" is one, not "2" and "дня"); then the rule listed first.
    const order = (c: Candidate) => RULES.findIndex((r) => r.kind === c.kind);
    candidates.sort((a, b) => a.start - b.start || b.end - a.end || order(a) - order(b));

    const taken: Array<[number, number]> = [];
    const done = new Set<QuickPieceKind>();
    for (const c of candidates) {
        if (taken.some(([s, e]) => c.start < e && c.end > s)) continue;
        // One of each: a second date stays in the title, where it can be seen
        // not to have been understood.
        if (done.has(c.kind)) continue;
        const key = pieceKey(c.kind, c.text);
        if (ignore.has(key)) {
            // Words the user said are words: nothing inside them may come
            // back as a chip ("в 18:00" refused must not return as "18:00").
            taken.push([c.start, c.end]);
            continue;
        }
        if (!c.apply(out, today)) {
            // Recognised in shape but not in sense (31.02, 22:00-06:00): the
            // whole of it stays words, rather than a part of it turning up as
            // a chip that means something else.
            taken.push([c.start, c.end]);
            continue;
        }
        done.add(c.kind);
        taken.push([c.start, c.end]);
        out.pieces.push({ kind: c.kind, text: c.text, key, start: c.start, end: c.end });
    }
    out.pieces.sort((a, b) => a.start - b.start);

    let title = '';
    let at = 0;
    for (const p of out.pieces) {
        title += `${text.slice(at, p.start)} `;
        at = p.end;
    }
    title += text.slice(at);
    out.title = title.replace(/\s+/g, ' ').trim();

    // A time or a repeat with no day is today's.
    if (!out.dueDate && (out.dueTime || out.recurrence)) {
        out.dueDate = today;
        out.impliedDate = true;
    }
    return out;
}
