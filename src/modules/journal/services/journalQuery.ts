/**
 * A day, read from what was typed into the Search panel: "вчера", "пн",
 * "12 сентября", "sep 12", "12.09", "2026-09-12".
 *
 * Only a query that is a date and nothing else — "12" alone, or "купить хлеб
 * завтра", is not a question about the journal. Looking back, not ahead: a
 * weekday is the last one on or before today, and a date without a year is
 * the one nearest today, so "31 дек" typed in January is the December just
 * gone. Pure, so the Search tests can run it.
 */

const RELATIVE: Record<string, number> = {
    сегодня: 0,
    today: 0,
    вчера: -1,
    yesterday: -1,
    позавчера: -2,
    завтра: 1,
    tomorrow: 1,
    послезавтра: 2,
};

/** Weekday names and abbreviations, 0 = Sunday as in `Date.getDay`. */
const WEEKDAYS: Array<[number, string[]]> = [
    [1, ['понедельник', 'пн', 'пон', 'monday', 'mon']],
    [2, ['вторник', 'вт', 'tuesday', 'tue', 'tues']],
    [3, ['среда', 'среду', 'ср', 'wednesday', 'wed']],
    [4, ['четверг', 'чт', 'thursday', 'thu', 'thur', 'thurs']],
    [5, ['пятница', 'пятницу', 'пт', 'friday', 'fri']],
    [6, ['суббота', 'субботу', 'сб', 'saturday', 'sat']],
    [0, ['воскресенье', 'вс', 'sunday', 'sun']],
];

/** Every full form of each month; a query word matches by its start (three letters or more). */
const MONTHS: string[][] = [
    ['январь', 'января', 'january'],
    ['февраль', 'февраля', 'february'],
    ['март', 'марта', 'march'],
    ['апрель', 'апреля', 'april'],
    ['май', 'мая', 'may'],
    ['июнь', 'июня', 'june'],
    ['июль', 'июля', 'july'],
    ['август', 'августа', 'august'],
    ['сентябрь', 'сентября', 'september'],
    ['октябрь', 'октября', 'october'],
    ['ноябрь', 'ноября', 'november'],
    ['декабрь', 'декабря', 'december'],
];

function iso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

function parseIso(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** The date if it exists: no 31 September. */
function valid(year: number, month: number, day: number): Date | null {
    const d = new Date(year, month, day);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
}

function monthOf(word: string): number | null {
    // "май" is three letters and a whole month; nothing shorter says which.
    if (word.length < 3) return null;
    const i = MONTHS.findIndex((forms) => forms.some((f) => f.startsWith(word)));
    return i < 0 ? null : i;
}

/** Of this year's, last year's and next year's, the one nearest today. */
function nearest(today: Date, month: number, day: number): Date | null {
    const y = today.getFullYear();
    const candidates = [y - 1, y, y + 1]
        .map((year) => valid(year, month, day))
        .filter((d): d is Date => d !== null);
    if (!candidates.length) return null;
    const t = today.getTime();
    return candidates.reduce((a, b) =>
        Math.abs(b.getTime() - t) < Math.abs(a.getTime() - t) ? b : a
    );
}

function dayMonth(today: Date, day: number, month: number, year?: number): Date | null {
    if (year !== undefined) return valid(year < 100 ? 2000 + year : year, month, day);
    return nearest(today, month, day);
}

export function parseJournalQuery(query: string, today: string): string | null {
    const q = query.toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
    if (!q) return null;
    const now = parseIso(today);

    if (q in RELATIVE) {
        const d = new Date(now);
        d.setDate(d.getDate() + RELATIVE[q]);
        return iso(d);
    }

    // "в пн", "on monday" — the preposition changes nothing.
    const bare = q.replace(/^(в|во|on)\s+/, '');
    const weekday = WEEKDAYS.find(([, names]) => names.includes(bare));
    if (weekday) {
        const d = new Date(now);
        d.setDate(d.getDate() - ((now.getDay() - weekday[0] + 7) % 7));
        return iso(d);
    }

    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
    if (m) {
        const d = valid(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d ? iso(d) : null;
    }

    m = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2}|\d{4}))?$/.exec(q);
    if (m) {
        const d = dayMonth(now, Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : undefined);
        return d ? iso(d) : null;
    }

    // "12 сентября", "12 sep 2025"
    m = /^(\d{1,2}) (\p{L}+)(?: (\d{4}))?$/u.exec(q);
    if (m) {
        const month = monthOf(m[2]);
        if (month === null) return null;
        const d = dayMonth(now, Number(m[1]), month, m[3] ? Number(m[3]) : undefined);
        return d ? iso(d) : null;
    }

    // "sep 12", "september 12 2025"
    m = /^(\p{L}+) (\d{1,2})(?:,? (\d{4}))?$/u.exec(q);
    if (m) {
        const month = monthOf(m[1]);
        if (month === null) return null;
        const d = dayMonth(now, Number(m[2]), month, m[3] ? Number(m[3]) : undefined);
        return d ? iso(d) : null;
    }

    return null;
}
