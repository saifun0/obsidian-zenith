import type { App } from 'obsidian';
import type { ContentStatus } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import type { ContentItem } from '../../../store/contentSlice';
import { ContentWriter } from './contentWriter';
import { datesForStatus } from './contentDates';
import { statusForProgress, type ProgressValue } from './progress';

/**
 * The mutations the library performs on an item, in one place.
 *
 * These used to live inline in whichever component happened to need them, and
 * the copies drifted: the dashboard's "+1" advanced progress without stamping a
 * finish date, while the detail modal did. Each function here writes the note
 * and returns the patch to mirror into the store, so every entry point — card
 * menu, detail modal, dashboard widget, bulk bar — goes through the same rules.
 */

/** Fields to spread into `patchContentItem`. */
export type ItemPatch = Partial<ContentItem>;

/**
 * Move an item to a new status, stamping the started/finished dates the
 * transition implies.
 */
export async function setItemStatus(
    app: App,
    item: ContentItem,
    next: ContentStatus
): Promise<ItemPatch> {
    const dates = await new ContentWriter(app).setStatus(item.filePath, next, {
        started: item.started,
        finished: item.finished,
    });
    return { status: next, ...(dates ?? {}) };
}

/**
 * Advance (or rewind) progress by `delta` units.
 *
 * Returns null when the move is a no-op — already at zero, or already at a
 * known total — so callers can leave the note untouched rather than writing an
 * identical value and firing a vault event for nothing.
 */
export async function bumpProgress(
    app: App,
    item: ContentItem,
    delta: number
): Promise<ItemPatch | null> {
    const current = item.progressCurrent ?? 0;
    const next: ProgressValue = { current: current + delta, total: item.progressTotal };
    if (next.current < 0) return null;
    if (next.total && next.current > next.total) return null;
    if (next.current === current) return null;

    const status = statusForProgress(next, item.status);
    // Progress, the status it implies and that status's date stamps go out as a
    // single frontmatter write. Two writes would fire two vault events, and the
    // re-parse in between would briefly show progress against the old status.
    const dates =
        status !== item.status
            ? datesForStatus(status, { started: item.started, finished: item.finished }, getTodayString())
            : null;

    await new ContentWriter(app).patch(item.filePath, {
        progress: next.current > 0 ? next.current : undefined,
        progressTotal: next.total && next.total > 0 ? next.total : undefined,
        status,
        ...(dates ?? {}),
    });

    return {
        progressCurrent: next.current,
        progressTotal: next.total,
        status,
        ...(dates ?? {}),
    };
}

/**
 * Move several notes to the vault trash. Returns how many actually went — a
 * count the caller can report, since a partial failure shouldn't read as total
 * success.
 */
export async function deleteItems(app: App, items: ContentItem[]): Promise<number> {
    const writer = new ContentWriter(app);
    let removed = 0;
    for (const item of items) {
        try {
            if (await writer.deleteItem(item.filePath)) removed++;
        } catch (err) {
            console.error('Zenith: Failed to delete item:', item.filePath, err);
        }
    }
    return removed;
}

/** Apply one status to several items, reporting each item's patch. */
export async function setItemsStatus(
    app: App,
    items: ContentItem[],
    next: ContentStatus
): Promise<{ id: string; patch: ItemPatch }[]> {
    const out: { id: string; patch: ItemPatch }[] = [];
    for (const item of items) {
        try {
            out.push({ id: item.id, patch: await setItemStatus(app, item, next) });
        } catch (err) {
            console.error('Zenith: Failed to set status:', item.filePath, err);
        }
    }
    return out;
}
