import type { ContentStatus } from '../../../core/constants';

/**
 * Structured progress ("88 of 100 pages", "Ep 5/12").
 *
 * Progress used to be a free-text frontmatter string, which looked fine but
 * couldn't be measured — no bar, no "+1", no completion detection. It is now
 * stored as two numbers (`progress` + `progressTotal`) and rendered with the
 * type's unit. Legacy free-text values are still understood on read, so old
 * notes keep working and get upgraded the first time they're edited.
 */
export interface ProgressValue {
    /** Units consumed so far (>= 0). */
    current: number;
    /** Total units, when known (> 0). */
    total?: number;
}

/** Fallback unit when a type doesn't declare one. */
export const DEFAULT_PROGRESS_UNIT = 'units';

function toPositiveInt(value: unknown): number | undefined {
    if (value == null) return undefined;
    if (typeof value === 'number') {
        return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
    }
    // Blank strings must read as "absent", not 0 — otherwise an empty
    // `progressTotal` would pass as a real total of zero.
    const text = String(value).replace(/[\s,]/g, '');
    if (!text) return undefined;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/**
 * Parse a progress value from frontmatter.
 *
 * Accepts the canonical numeric form (`progress: 88`, `progressTotal: 100`) and
 * the legacy free-text forms: `"88/100"`, `"Ep 5 / 12"`, `"12 of 24"`, `"45%"`,
 * `"p. 120"`. Returns undefined when nothing numeric can be recovered.
 */
export function parseProgress(raw: unknown, totalRaw?: unknown): ProgressValue | undefined {
    const explicitTotal = toPositiveInt(totalRaw);

    if (raw == null || raw === '') {
        return explicitTotal ? { current: 0, total: explicitTotal } : undefined;
    }

    if (typeof raw === 'number') {
        const current = toPositiveInt(raw);
        return current == null ? undefined : { current, total: explicitTotal };
    }

    const text = String(raw).trim();
    if (!text) return explicitTotal ? { current: 0, total: explicitTotal } : undefined;

    // "45%" — represent as a 0–100 scale so it still renders a bar.
    const pct = text.match(/^(\d{1,3})\s*%$/);
    if (pct) {
        return { current: Math.min(100, Number(pct[1])), total: explicitTotal ?? 100 };
    }

    // "5/12", "Ep 5 / 12", "12 of 24", "chapter 30 из 100"
    const pair = text.match(/(\d[\d\s,]*)\s*(?:\/|of|из)\s*(\d[\d\s,]*)/i);
    if (pair) {
        const current = toPositiveInt(pair[1]);
        const total = toPositiveInt(pair[2]);
        if (current != null) return { current, total: total || explicitTotal };
    }

    // A bare number somewhere in the text: "p. 120", "Ch 30".
    const single = text.match(/(\d[\d\s,]*)/);
    if (single) {
        const current = toPositiveInt(single[1]);
        if (current != null) return { current, total: explicitTotal };
    }

    return explicitTotal ? { current: 0, total: explicitTotal } : undefined;
}

/** Completion ratio 0–100, or undefined when the total is unknown. */
export function progressPercent(value: ProgressValue | undefined): number | undefined {
    if (!value?.total || value.total <= 0) return undefined;
    return Math.min(100, Math.max(0, (value.current / value.total) * 100));
}

/** Whether progress has reached (or passed) a known total. */
export function isProgressComplete(value: ProgressValue | undefined): boolean {
    return !!value?.total && value.current >= value.total;
}

/** Shorten a unit for compact spots: "episodes" → "ep", "pages" → "p". */
export function shortUnit(unit: string | undefined): string {
    const u = (unit ?? DEFAULT_PROGRESS_UNIT).trim().toLowerCase();
    const SHORT: Record<string, string> = {
        episodes: 'ep',
        episode: 'ep',
        chapters: 'ch',
        chapter: 'ch',
        pages: 'p',
        page: 'p',
        volumes: 'vol',
        tracks: 'tr',
        hours: 'h',
        minutes: 'min',
        seasons: 'S',
    };
    return SHORT[u] ?? u;
}

/** "88 / 100 pages" · "Ep 5 of 12" · "120 pages". */
export function formatProgress(
    value: ProgressValue | undefined,
    unit: string | undefined,
    opts: { short?: boolean } = {}
): string {
    if (!value) return '';
    const label = opts.short ? shortUnit(unit) : (unit ?? DEFAULT_PROGRESS_UNIT);
    const head = value.total ? `${value.current} / ${value.total}` : String(value.current);
    return label ? `${head} ${label}` : head;
}

/**
 * The status an item should move to after a progress edit.
 *
 * Keeps the library honest without nagging: starting something pulls it out of
 * the backlog, finishing it marks it completed. A dropped item is left alone —
 * that's a deliberate user decision.
 */
export function statusForProgress(
    value: ProgressValue | undefined,
    current: ContentStatus
): ContentStatus {
    if (current === 'dropped' || !value) return current;
    if (isProgressComplete(value)) return 'completed';
    if (value.current > 0 && current === 'backlog') return 'in-progress';
    return current;
}
