// The demo vault's calendar, and how to move it.
//
// Everything in `demo-vault/` is written around one day, DEMO_TODAY: the daily notes run up to it, the tasks are
// due on and after it, the library was last touched before it. Left alone, the demo ages — a month on, every task
// in it is overdue and the journal ends weeks ago. So when a release is packed, the whole vault is moved forward:
// every date in it, and every file named after one.
//
// It is moved to the day of the release exactly, not to the nearest week. Whole weeks would keep every note on its
// own weekday, and were tried: a release on a Monday then opened on a demo whose "today" was the Thursday before,
// with fourteen tasks overdue — the first thing anyone saw. What does depend on the weekday is little, and is seen
// to here instead: the timetable's two-week cycle is anchored again so that this week is still "Week A" (see
// `mondayOf`), and the vault's own notes no longer say which weekdays its fasts fell on.

/** The day the vault in the repository is written around. */
export const DEMO_TODAY = '2026-09-24';

/** Dates outside this span are not the demo's own: a film's release, a birthday. They stay where they are. */
export const DEMO_SPAN = ['2026-01-01', '2027-12-31'];

const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const toUtc = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const toIso = (utc) => {
    const d = new Date(utc);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** A date some days on (or back). */
export function shiftIso(iso, days) {
    return toIso(toUtc(iso) + days * DAY);
}

/**
 * How far to move the vault for a release on `releaseDay`: the days between the demo's day and that one.
 * Never backward — a build made before the demo's own day leaves it as written.
 */
export function shiftFor(releaseDay, demoToday = DEMO_TODAY) {
    return Math.max(0, Math.round((toUtc(releaseDay) - toUtc(demoToday)) / DAY));
}

/** The Monday of a date's week — what the timetable's two-week cycle counts from. */
export function mondayOf(iso) {
    const weekday = (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
    return shiftIso(iso, -weekday);
}

/** ISO week of a date: the year the week belongs to, and its number. */
export function isoWeek(iso) {
    const date = new Date(toUtc(iso));
    // The week's Thursday decides its year.
    const weekday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - weekday + 3);
    const year = date.getUTCFullYear();
    const first = Date.UTC(year, 0, 4);
    const firstWeekday = (new Date(first).getUTCDay() + 6) % 7;
    const week = 1 + Math.round((date.getTime() - (first - firstWeekday * DAY + 3 * DAY)) / (7 * DAY));
    return { year, week };
}

/** The Thursday of an ISO week. */
function thursdayOf(year, week) {
    const first = Date.UTC(year, 0, 4);
    const firstWeekday = (new Date(first).getUTCDay() + 6) % 7;
    return toIso(first - firstWeekday * DAY + 3 * DAY + (week - 1) * 7 * DAY);
}

const inSpan = (iso, span) => iso >= span[0] && iso <= span[1];

/**
 * Move every date written in a text. Dates are found as `YYYY-MM-DD` — in a task's `📅`, a note's frontmatter, a
 * link to a daily note, the settings file — and as ISO weeks, `YYYY-Www`. Anything outside the demo's span is left.
 */
export function shiftText(text, days, span = DEMO_SPAN) {
    if (!days) return text;
    return text
        .replace(/\b(20\d\d-\d\d-\d\d)\b/g, (whole, iso) => (inSpan(iso, span) ? shiftIso(iso, days) : whole))
        .replace(/\b(20\d\d)-W(\d\d)\b/g, (whole, y, w) => {
            const thursday = thursdayOf(Number(y), Number(w));
            if (!inSpan(thursday, span)) return whole;
            const to = isoWeek(shiftIso(thursday, days));
            return `${to.year}-W${pad(to.week)}`;
        });
}

/**
 * Move a file's name, when it is named after a time: a day (`2026-09-24`), a week (`2026-W39`), a month
 * (`2026-09`), a quarter (`2026-Q3`) or a year (`2026`) — the names the journal gives its notes. A period goes
 * where its middle goes: a month moved three weeks on is the month its fifteenth lands in.
 *
 * Only a name that is nothing but the period is moved. "Tax Return 2026" is a title, not a date.
 */
export function shiftName(name, days, span = DEMO_SPAN) {
    if (!days) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let m;
    if ((m = /^(20\d\d)-(\d\d)-(\d\d)$/.exec(stem))) {
        return inSpan(stem, span) ? shiftIso(stem, days) + ext : name;
    }
    if ((m = /^(20\d\d)-W(\d\d)$/.exec(stem))) {
        return shiftText(stem, days, span) + ext;
    }
    const middle =
        (m = /^(20\d\d)-(\d\d)$/.exec(stem)) ? `${m[1]}-${m[2]}-15`
        : (m = /^(20\d\d)-Q([1-4])$/.exec(stem)) ? `${m[1]}-${pad(Number(m[2]) * 3 - 1)}-15`
        : (m = /^(20\d\d)$/.exec(stem)) ? `${m[1]}-07-01`
        : null;
    if (!middle || !inSpan(middle, span)) return name;
    const to = shiftIso(middle, days);
    const [y, mo] = to.split('-');
    if (/^20\d\d-\d\d$/.test(stem)) return `${y}-${mo}${ext}`;
    if (/^20\d\d-Q/.test(stem)) return `${y}-Q${Math.ceil(Number(mo) / 3)}${ext}`;
    return `${y}${ext}`;
}

const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const SHORT = {
    en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
};

/**
 * Fill the places where the vault's own notes speak of its day in words — "the dates are around …" — which no
 * search for `YYYY-MM-DD` would find. The notes carry them as `{{demo-today}}` and `{{demo-day:-12}}` (a day so
 * many before today, as it is typed into Search: "12 sep").
 */
export function fillDemoDay(text, today, lang) {
    const months = MONTHS[lang] ?? MONTHS.en;
    const short = SHORT[lang] ?? SHORT.en;
    const parts = (iso) => iso.split('-').map(Number);
    return text
        .replace(/\{\{demo-today\}\}/g, () => {
            const [y, m, d] = parts(today);
            return `${d} ${months[m - 1]} ${y}`;
        })
        .replace(/\{\{demo-day:([+-]?\d+)\}\}/g, (_, offset) => {
            const [, m, d] = parts(shiftIso(today, Number(offset)));
            return `${d} ${short[m - 1]}`;
        });
}
