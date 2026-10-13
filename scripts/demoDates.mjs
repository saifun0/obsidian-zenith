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
//
// A day moves by days. A note for a week, a month, a quarter or a year moves by periods: the vault says "last
// week" and "last month" of them, and that stays true only if last month's note is still the month before today's.

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
const inSpan = (iso, span) => iso >= span[0] && iso <= span[1];

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

/** The Monday of a date's week — what the timetable's two-week cycle counts from, and where an ISO week starts. */
export function mondayOf(iso) {
    const weekday = (new Date(toUtc(iso)).getUTCDay() + 6) % 7;
    return shiftIso(iso, -weekday);
}

/** ISO week of a date: the year the week belongs to, and its number. */
export function isoWeek(iso) {
    // The week's Thursday decides its year; the week holding 4 January is the first.
    const thursday = shiftIso(mondayOf(iso), 3);
    const year = Number(thursday.slice(0, 4));
    const firstMonday = mondayOf(`${year}-01-04`);
    return { year, week: 1 + Math.round((toUtc(mondayOf(iso)) - toUtc(firstMonday)) / (7 * DAY)) };
}

/** The Monday an ISO week starts on. */
function mondayOfWeek(year, week) {
    return shiftIso(mondayOf(`${year}-01-04`), (week - 1) * 7);
}

/**
 * Where a period goes when the demo's day moves from `from` to `to` — as many periods on as today's own period
 * moved. Given the period's name as the journal writes it: `2026-W39`, `2026-09`, `2026-Q3`, `2026`. Answers its
 * new name and first and last day, or null for a name that is not a period or is outside the demo's span.
 */
export function movePeriod(name, from, to, span = DEMO_SPAN) {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    let m;
    if ((m = /^(20\d\d)-W(\d\d)$/.exec(name))) {
        const weeks = Math.round((toUtc(mondayOf(to)) - toUtc(mondayOf(from))) / (7 * DAY));
        const was = mondayOfWeek(Number(m[1]), Number(m[2]));
        if (!inSpan(was, span)) return null;
        const start = shiftIso(was, weeks * 7);
        const { year, week } = isoWeek(start);
        return { name: `${year}-W${pad(week)}`, start, end: shiftIso(start, 6) };
    }
    if ((m = /^(20\d\d)-(\d\d)$/.exec(name))) {
        if (!inSpan(`${m[1]}-${m[2]}-15`, span)) return null;
        const index = Number(m[1]) * 12 + Number(m[2]) - 1 + (ty * 12 + tm) - (fy * 12 + fm);
        const y = Math.floor(index / 12);
        const mo = (index % 12) + 1;
        return { name: `${y}-${pad(mo)}`, start: `${y}-${pad(mo)}-01`, end: toIso(Date.UTC(y, mo, 0)) };
    }
    if ((m = /^(20\d\d)-Q([1-4])$/.exec(name))) {
        if (!inSpan(`${m[1]}-${pad(Number(m[2]) * 3 - 1)}-15`, span)) return null;
        const quarterOf = (y, mo) => y * 4 + Math.floor((mo - 1) / 3);
        const index = Number(m[1]) * 4 + Number(m[2]) - 1 + quarterOf(ty, tm) - quarterOf(fy, fm);
        const y = Math.floor(index / 4);
        const q = (index % 4) + 1;
        return { name: `${y}-Q${q}`, start: `${y}-${pad(q * 3 - 2)}-01`, end: toIso(Date.UTC(y, q * 3, 0)) };
    }
    if ((m = /^(20\d\d)$/.exec(name))) {
        if (!inSpan(`${m[1]}-07-01`, span)) return null;
        const y = Number(m[1]) + ty - fy;
        return { name: String(y), start: `${y}-01-01`, end: `${y}-12-31` };
    }
    return null;
}

/**
 * Move every date written in a text, `days` on from the day the demo is written around.
 *
 * A day is found as `YYYY-MM-DD` — in a task's `📅`, a note's frontmatter, a link to a daily note, the settings
 * file — and moves by days. A week (`YYYY-Www`, wherever it stands) and a link to a month's, a quarter's or a
 * year's note (`[[2026-08]]`) move by periods. Anything outside the demo's span is left.
 */
export function shiftText(text, days, today = DEMO_TODAY, span = DEMO_SPAN) {
    if (!days) return text;
    const to = shiftIso(today, days);
    const period = (whole, name) => movePeriod(name, today, to, span)?.name ?? name;
    return text
        .replace(/\b(20\d\d-\d\d-\d\d)\b/g, (whole, iso) => (inSpan(iso, span) ? shiftIso(iso, days) : whole))
        .replace(/\b(20\d\d-W\d\d)\b/g, period)
        .replace(/\[\[(20\d\d(?:-\d\d|-Q[1-4])?)([\]|#])/g, (whole, name, tail) => `[[${period(whole, name)}${tail}`);
}

/**
 * Move a file's name, when it is named after a time: a day (`2026-09-24`), or a week, a month, a quarter or a
 * year — the names the journal gives its notes. Only a name that is nothing but the time is moved: "Tax Return
 * 2026" is a title, not a date.
 */
export function shiftName(name, days, today = DEMO_TODAY, span = DEMO_SPAN) {
    if (!days) return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    if (/^20\d\d-\d\d-\d\d$/.test(stem)) return inSpan(stem, span) ? shiftIso(stem, days) + ext : name;
    const moved = movePeriod(stem, today, shiftIso(today, days), span);
    return moved ? moved.name + ext : name;
}

/**
 * A period's note says which period it is in its own lines too — `start:` and `end:` in the frontmatter, `date:`
 * in its summary block — and those are the period's first and last day, not days to be moved one by one. Given the
 * note's name before the move, set them to the period it moved to.
 */
export function settlePeriodNote(text, nameBefore, days, today = DEMO_TODAY, span = DEMO_SPAN) {
    const stem = nameBefore.replace(/\.[^.]+$/, '');
    const moved = days ? movePeriod(stem, today, shiftIso(today, days), span) : null;
    if (!moved) return text;
    return text
        .replace(/^(start:\s*)\S+$/m, `$1${moved.start}`)
        .replace(/^(end:\s*)\S+$/m, `$1${moved.end}`)
        .replace(/^(date:\s*)\d{4}-\d\d-\d\d$/m, `$1${moved.start}`);
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
 * Fill the places where the vault's own notes speak of its day in words — "in this copy today is …" — which no
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
