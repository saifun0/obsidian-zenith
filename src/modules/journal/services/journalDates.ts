/**
 * Date ↔ file-path arithmetic for the Journal module.
 *
 * A daily note's identity is its date, and the only thing linking the two is the
 * filename pattern. Both directions are needed: the calendar asks "where does
 * 2026-07-28 live?", and the parser asks "which day is this file?".
 *
 * Month and weekday **names are always English**, regardless of the interface
 * language. A file path is not UI — deriving it from the UI locale would make
 * every note written under one language unreachable under another. The calendar
 * renders localized names separately, from `Intl`.
 */

const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Supported tokens, longest-first so `MMMM` wins over `MM` at the same position.
 * `[…]` escapes a literal run, as in moment's format strings.
 */
const TOKEN_RE = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDDD|DD|D|dddd|ddd/g;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Format a date with the journal's filename pattern (English names). */
export function formatJournalDate(date: Date, format: string): string {
    return format.replace(TOKEN_RE, (token, literal?: string) => {
        if (literal !== undefined) return literal;
        switch (token) {
            case 'YYYY': return String(date.getFullYear());
            case 'YY': return pad(date.getFullYear() % 100);
            case 'MMMM': return MONTHS_LONG[date.getMonth()];
            case 'MMM': return MONTHS_LONG[date.getMonth()].slice(0, 3);
            case 'MM': return pad(date.getMonth() + 1);
            case 'M': return String(date.getMonth() + 1);
            case 'DDDD':
            case 'DD': return pad(date.getDate());
            case 'D': return String(date.getDate());
            case 'dddd': return DAYS_LONG[date.getDay()];
            case 'ddd': return DAYS_LONG[date.getDay()].slice(0, 3);
            default: return token;
        }
    });
}

/** Strip leading/trailing slashes from a configured folder path. */
export function normalizeFolder(folder: string): string {
    return folder.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * Vault path of the daily note for a date.
 *
 * The pattern may contain `/`, which produces nested folders (`YYYY/MM/DD`);
 * the writer creates them on demand.
 */
export function journalNotePath(folder: string, format: string, date: Date): string {
    const name = formatJournalDate(date, format || 'YYYY-MM-DD');
    const base = normalizeFolder(folder);
    return `${base ? `${base}/` : ''}${name}.md`;
}

// ── Path → date ──────────────────────────────────────

/** Which calendar field a capture group in the built matcher carries. */
type Capture = 'year4' | 'year2' | 'month' | 'monthName' | 'day' | 'ignore';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a function that recovers the ISO date from a note's path.
 *
 * Patterns that don't pin down a year, month and day (say `MMMM` alone, or a
 * pattern of pure literals) can't be inverted; the matcher then returns null for
 * everything and the parser falls back to the note's own `date:` frontmatter.
 */
export function buildDateMatcher(format: string): (relativePath: string) => string | null {
    const captures: Capture[] = [];
    let source = '';

    let lastIndex = 0;
    const re = new RegExp(TOKEN_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(format)) !== null) {
        source += escapeRe(format.slice(lastIndex, m.index));
        lastIndex = m.index + m[0].length;

        if (m[1] !== undefined) {
            source += escapeRe(m[1]); // [literal]
            continue;
        }
        switch (m[0]) {
            case 'YYYY': source += '(\\d{4})'; captures.push('year4'); break;
            case 'YY': source += '(\\d{2})'; captures.push('year2'); break;
            case 'MMMM':
            case 'MMM': source += '([A-Za-z]+)'; captures.push('monthName'); break;
            case 'MM': source += '(\\d{2})'; captures.push('month'); break;
            case 'M': source += '(\\d{1,2})'; captures.push('month'); break;
            case 'DDDD':
            case 'DD': source += '(\\d{2})'; captures.push('day'); break;
            case 'D': source += '(\\d{1,2})'; captures.push('day'); break;
            case 'dddd':
            case 'ddd': source += '[A-Za-z]+'; break; // weekday adds nothing
            default: source += escapeRe(m[0]);
        }
    }
    source += escapeRe(format.slice(lastIndex));

    const hasYear = captures.includes('year4') || captures.includes('year2');
    const hasMonth = captures.includes('month') || captures.includes('monthName');
    const hasDay = captures.includes('day');
    if (!hasYear || !hasMonth || !hasDay) return () => null;

    const pattern = new RegExp(`^${source}$`);

    return (relativePath: string): string | null => {
        const match = pattern.exec(relativePath);
        if (!match) return null;

        let year: number | null = null;
        let month: number | null = null;
        let day: number | null = null;

        captures.forEach((kind, i) => {
            const raw = match[i + 1];
            if (raw === undefined) return;
            switch (kind) {
                case 'year4': year = Number(raw); break;
                case 'year2': year = 2000 + Number(raw); break;
                case 'month': month = Number(raw); break;
                case 'monthName': {
                    const idx = MONTHS_LONG.findIndex((name) =>
                        name.toLowerCase().startsWith(raw.toLowerCase().slice(0, 3))
                    );
                    if (idx >= 0) month = idx + 1;
                    break;
                }
                case 'day': day = Number(raw); break;
            }
        });

        if (year === null || month === null || day === null) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    };
}

/**
 * The part of a note's vault path that the filename pattern describes: the
 * journal folder prefix and the `.md` extension removed. Returns null when the
 * file isn't under the journal folder at all.
 */
export function relativeNotePath(path: string, folder: string): string | null {
    const base = normalizeFolder(folder);
    if (base) {
        if (!path.startsWith(`${base}/`)) return null;
        path = path.slice(base.length + 1);
    }
    return path.replace(/\.md$/i, '');
}

// ── Calendar arithmetic ──────────────────────────────
// Lives in `core/calendarDates` — the Tasks Calendar draws the same grid, and
// neither module owns the Gregorian calendar. Re-exported here so the journal's
// own imports keep reading as one module.

export {
    isoToDate,
    addDays,
    addMonths,
    sameMonth,
    startOfWeek,
    monthGrid,
    weekGrid,
    isoWeek,
    weekdayLabels,
    monthLabel,
    dayLabel,
    shortDayLabel,
    type WeekStart,
} from '../../../core/calendarDates';
