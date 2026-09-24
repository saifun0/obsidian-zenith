import {
    addDays,
    isoToDate,
    isoWeek,
    startOfWeek,
    type WeekStart,
} from '../../../core/calendarDates';
import { toLocalIsoDate } from '../../../core/dateUtils';
import { formatJournalDate, normalizeFolder } from './journalDates';

/**
 * Weeks, months, quarters and years: the periods a review looks back over,
 * and where each one's note lives.
 *
 * A review note is an ordinary Markdown note like a daily one — its own
 * folder, name pattern and template, all in settings — and Zenith only ever
 * creates one when asked (a command, the week number in the calendar), never
 * on its own.
 */

export const REVIEW_PERIODS = ['week', 'month', 'quarter', 'year'] as const;
export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];

export interface PeriodRange {
    period: ReviewPeriod;
    /** First day, `YYYY-MM-DD`. */
    start: string;
    /** Last day, included. */
    end: string;
}

/** The period of the given kind that `date` falls in. */
export function periodRange(period: ReviewPeriod, date: string, weekStart: WeekStart): PeriodRange {
    const d = isoToDate(date);
    const y = d.getFullYear();
    switch (period) {
        case 'week': {
            const start = startOfWeek(date, weekStart);
            return { period, start, end: addDays(start, 6) };
        }
        case 'month':
            return {
                period,
                start: toLocalIsoDate(new Date(y, d.getMonth(), 1)),
                end: toLocalIsoDate(new Date(y, d.getMonth() + 1, 0)),
            };
        case 'quarter': {
            const first = Math.floor(d.getMonth() / 3) * 3;
            return {
                period,
                start: toLocalIsoDate(new Date(y, first, 1)),
                end: toLocalIsoDate(new Date(y, first + 3, 0)),
            };
        }
        case 'year':
            return { period, start: `${y}-01-01`, end: `${y}-12-31` };
    }
}

/**
 * The ISO week a range is named by: the one its Thursday falls in, which is
 * how ISO numbers a week that straddles a new year — and, for a week starting
 * on Sunday, still the Monday-to-Sunday week that shares most of its days.
 */
export function weekOfRange(start: string): { year: number; week: number } {
    const date = isoToDate(start);
    const toThursday = (4 - date.getDay() + 7) % 7;
    return isoWeek(addDays(start, toThursday));
}

const PERIOD_TOKENS = /\[([^\]]*)\]|GGGG|WW|W|Q/g;

/**
 * A period's note name from its pattern. On top of the daily-note tokens:
 * `GGGG` the ISO week-year, `WW`/`W` the ISO week, `Q` the quarter — the
 * names Periodic Notes and moment use, so a pattern copied from there works.
 * The rest (`YYYY`, `MM`…) is read from the period's first day.
 */
export function formatPeriodName(format: string, range: PeriodRange): string {
    const week = weekOfRange(range.start);
    const quarter = Math.floor(isoToDate(range.start).getMonth() / 3) + 1;
    // Resolve the extra tokens into escaped literals first, so the daily
    // formatter sees them as text and never as its own tokens.
    const resolved = format.replace(PERIOD_TOKENS, (token, literal?: string) => {
        if (literal !== undefined) return token;
        switch (token) {
            case 'GGGG':
                return `[${week.year}]`;
            case 'WW':
                return `[${String(week.week).padStart(2, '0')}]`;
            case 'W':
                return `[${week.week}]`;
            case 'Q':
                return `[${quarter}]`;
            default:
                return token;
        }
    });
    return formatJournalDate(isoToDate(range.start), resolved);
}

export interface ReviewNoteConfig {
    /** Empty: the journal's own folder. */
    folder: string;
    format: string;
    /** A note to copy as the body; empty for the built-in one. */
    template: string;
}

export type ReviewNotes = Record<ReviewPeriod, ReviewNoteConfig>;

export const DEFAULT_REVIEW_NOTES: ReviewNotes = {
    week: { folder: '', format: 'GGGG-[W]WW', template: '' },
    month: { folder: '', format: 'YYYY-MM', template: '' },
    quarter: { folder: '', format: 'YYYY-[Q]Q', template: '' },
    year: { folder: '', format: 'YYYY', template: '' },
};

/** Whatever `data.json` holds, as a full set: a missing or broken entry is the default. */
export function normalizeReviewNotes(raw: unknown): ReviewNotes {
    const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out = {} as ReviewNotes;
    for (const period of REVIEW_PERIODS) {
        const entry = src[period];
        const e = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
        const def = DEFAULT_REVIEW_NOTES[period];
        const text = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
        out[period] = {
            folder: text(e.folder, def.folder),
            format: text(e.format, def.format).trim() || def.format,
            template: text(e.template, def.template),
        };
    }
    return out;
}

/** Vault path of a period's note — whether or not it exists yet. */
export function reviewNotePath(
    notes: ReviewNotes,
    journalFolder: string,
    range: PeriodRange
): string {
    const config = notes[range.period];
    const folder = normalizeFolder(config.folder || journalFolder);
    const name = formatPeriodName(config.format, range);
    return `${folder ? `${folder}/` : ''}${name}.md`;
}

// ── The block's own parameters ──────────────────────

export const SUMMARY_SECTIONS = [
    'tasks',
    'habits',
    'content',
    'prayer',
    'fasting',
    'words',
] as const;
export type SummarySection = (typeof SUMMARY_SECTIONS)[number];

export interface SummaryParams {
    period?: ReviewPeriod;
    date?: string;
    show?: SummarySection[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What a `zenith-summary` block asks for: `period`, `date` and `show`, one per
 * line or on one line, as `key=value` or `key: value`. Anything unknown is
 * ignored rather than refused — a block that renders nothing because of a
 * typo in one word is worse than one that shows its default.
 */
export function parseSummaryParams(source: string): SummaryParams {
    const out: SummaryParams = {};
    // A value runs to the next `key=` on its line, or to the line's end — so
    // `show: tasks, habits` keeps the spaces after its commas.
    const pairs = source.matchAll(/([a-z]+)\s*[=:]\s*(.*?)(?=\s+[a-z]+\s*[=:]|\s*$)/gim);
    for (const [, key, value] of pairs) {
        const k = key.toLowerCase();
        const v = value.trim();
        if (k === 'period' && (REVIEW_PERIODS as readonly string[]).includes(v)) {
            out.period = v as ReviewPeriod;
        } else if (k === 'date' && ISO.test(v)) {
            out.date = v;
        } else if (k === 'show') {
            const show = v
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter((s): s is SummarySection =>
                    (SUMMARY_SECTIONS as readonly string[]).includes(s)
                );
            if (show.length) out.show = [...new Set(show)];
        }
    }
    return out;
}
