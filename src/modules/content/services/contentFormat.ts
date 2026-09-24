import { toIsoDate, toStringArray } from '../../../services/vaultService';
import type { ContentItem } from '../../../store/contentSlice';
import { CONTENT_STATUSES } from '../../../core/constants';
import type { ContentStatus } from '../../../core/constants';
import { parseProgress, statusForProgress } from './progress';
import { parseReadingList } from './readings';

/**
 * Build a normalized {@link ContentItem} from a file's frontmatter + body.
 * Pure (no Obsidian), so it's unit-testable and reused by the parser.
 *
 * Returns null for files without a `title` or `type` (not a content note).
 */
export function normalizeContentItem(
    fm: Record<string, unknown>,
    basename: string,
    filePath: string,
    body: string,
    /** `TFile.stat` — optional so tests and callers without a file can omit it. */
    stat?: { ctime?: number; mtime?: number }
): ContentItem | null {
    if (!fm.title && !fm.type) return null;

    const rawStatus = fm.status as string;
    const writtenStatus: ContentStatus = CONTENT_STATUSES.includes(rawStatus as ContentStatus)
        ? (rawStatus as ContentStatus)
        : 'backlog';

    const year = Number(fm.year);
    const genres = toStringArray(fm.genres);
    // `progress` is a number in current notes and free text in older ones
    // ("Ep 5/12"); both parse into the same {current,total} shape.
    const progress = parseProgress(fm.progress, fm.progressTotal);

    // "5 of 12 pages" and "backlog" contradict each other. The plugin's own rule
    // — begun means in progress, finished means completed — is applied on every
    // edit already, so applying it on read as well stops imported and
    // hand-written notes from displaying a status their own numbers deny. This
    // only affects what's shown; the file is untouched until something else
    // writes it.
    const status = statusForProgress(progress, writtenStatus);

    return {
        id: filePath,
        title: (fm.title as string) || basename,
        status,
        rating: Math.min(10, Math.max(0, Number(fm.rating) || 0)),
        coverImage: (fm.cover as string) || undefined,
        tags: toStringArray(fm.tags),
        type: (fm.type as string) || 'other',
        filePath,
        // Keep the full body as the description; cards clamp it in CSS, the detail
        // view shows it whole. A `description` frontmatter key overrides the body.
        description: ((fm.description as string) || body).trim() || undefined,
        year: Number.isFinite(year) && year > 0 ? year : undefined,
        creator: (fm.creator as string)?.trim() || undefined,
        genres: genres.length > 0 ? genres : undefined,
        progress: fm.progress != null ? String(fm.progress).trim() || undefined : undefined,
        progressCurrent: progress?.current,
        progressTotal: progress?.total,
        started: toIsoDate(fm.started),
        finished: toIsoDate(fm.finished),
        readings: parseReadingList(fm.readings),
        createdAt: stat?.ctime || undefined,
        updatedAt: stat?.mtime || undefined,
    };
}
