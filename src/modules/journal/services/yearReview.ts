import { coerceTrackerValue, type JournalTracker } from '../../../core/journalConfig';
import type { JournalEntry } from '../../../store/journalSlice';
import { summarize, type HabitLine, type Summary, type SummaryData } from './summary';
import type { SummarySection } from './reviewPeriods';

/**
 * The year in review: the year's summary, and the two things only a year has
 * room for — each habit's best run, and the mood month by month.
 *
 * Offered from 1 December for the year that is ending, and for any year before
 * it on request. Earlier than December it would be a review of most of a year
 * presented as the year.
 */

export function reviewAvailable(year: number, today: string): boolean {
    const [y, m] = today.split('-').map(Number);
    return year < y || (year === y && m === 12);
}

/** The year a review opens on: this one in December, last year before it. */
export function defaultReviewYear(today: string): number {
    const [y, m] = today.split('-').map(Number);
    return m === 12 ? y : y - 1;
}

export interface YearReview {
    year: number;
    summary: Summary;
    /** Habits by their longest run, best first; runs of a day or less left out. */
    bestRuns: HabitLine[];
    /** The mood tracker's average per month, null for a month with none. */
    moodByMonth: Array<number | null>;
    mood?: JournalTracker;
}

export function moodByMonth(
    entries: ReadonlyArray<JournalEntry>,
    tracker: JournalTracker,
    year: number
): Array<number | null> {
    const sums = Array.from({ length: 12 }, () => ({ total: 0, n: 0 }));
    const prefix = `${year}-`;
    for (const entry of entries) {
        if (!entry.date.startsWith(prefix)) continue;
        const value = coerceTrackerValue(tracker.kind, entry.values[tracker.id]);
        if (typeof value !== 'number') continue;
        const month = Number(entry.date.slice(5, 7)) - 1;
        sums[month].total += value;
        sums[month].n += 1;
    }
    return sums.map((s) => (s.n ? s.total / s.n : null));
}

export function yearReview(
    data: SummaryData,
    year: number,
    today: string,
    sections: readonly SummarySection[]
): YearReview {
    const summary = summarize(data, `${year}-01-01`, `${year}-12-31`, today, sections);
    const mood = data.trackers.find((t) => t.kind === 'scale');
    return {
        year,
        summary,
        bestRuns: [...(summary.habits ?? [])]
            .filter((h) => h.bestRun > 1)
            .sort((a, b) => b.bestRun - a.bestRun),
        moodByMonth: mood ? moodByMonth(data.entries, mood, year) : [],
        mood,
    };
}

// ── The picture ──────────────────────────────────────

/** Sections a picture may carry. Prayer and health are the user's to add. */
export const IMAGE_SECTIONS = [
    'tasks',
    'words',
    'content',
    'habits',
    'mood',
    'prayer',
    'fasting',
] as const;
export type ImageSection = (typeof IMAGE_SECTIONS)[number];
export const IMAGE_DEFAULTS: readonly ImageSection[] = ['tasks', 'words', 'content'];

export interface ImageLine {
    section: ImageSection;
    /** The big figure. */
    value: string;
    /** What it counts. */
    label: string;
}

const escapeXml = (s: string) =>
    s.replace(
        /[<>&'"]/g,
        (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c
    );

/**
 * The card to share, as SVG: the year, and a figure per chosen section. Plain
 * shapes and system fonts only, so turning it into a PNG needs nothing but a
 * canvas — no fonts to fetch, nothing to load from the network.
 */
export function yearCardSvg(
    year: number,
    title: string,
    lines: readonly ImageLine[],
    colors: { bg: string; fg: string; muted: string; accent: string }
): string {
    const width = 1080;
    const rowHeight = 150;
    const top = 330;
    const height = Math.max(1080, top + lines.length * rowHeight + 120);
    const font = 'font-family="-apple-system, \'Segoe UI\', Roboto, sans-serif"';
    const rows = lines
        .map((line, i) => {
            const y = top + i * rowHeight;
            return [
                `<text x="96" y="${y + 70}" ${font} font-size="84" font-weight="700" fill="${colors.fg}">${escapeXml(line.value)}</text>`,
                `<text x="96" y="${y + 116}" ${font} font-size="34" fill="${colors.muted}">${escapeXml(line.label)}</text>`,
            ].join('');
        })
        .join('');
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="${colors.bg}"/>`,
        `<rect x="96" y="120" width="96" height="10" rx="5" fill="${colors.accent}"/>`,
        `<text x="96" y="236" ${font} font-size="112" font-weight="800" fill="${colors.fg}">${year}</text>`,
        `<text x="${width - 96}" y="236" text-anchor="end" ${font} font-size="36" fill="${colors.muted}">${escapeXml(title)}</text>`,
        rows,
        '</svg>',
    ].join('');
}
