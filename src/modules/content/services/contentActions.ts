import type { App } from 'obsidian';
import type { ContentStatus } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import type { ContentItem } from '../../../store/contentSlice';
import { ContentWriter } from './contentWriter';
import { transitionFor } from './readings';
import { featureEnabled } from '../../../core/features';
import { useZenithStore } from '../../../store';

/** Whether re-reads are kept as a list — the `content.readings` feature. */
function keepsReadings(): boolean {
    return featureEnabled(useZenithStore.getState().settings, 'content.readings');
}
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
    const dates = await new ContentWriter(app).setStatus(
        item.filePath,
        next,
        { started: item.started, finished: item.finished, readings: item.readings },
        keepsReadings()
    );
    return { status: next, ...(dates ?? {}) };
}

/** Mark or unmark a favourite. */
export async function setItemFavorite(
    app: App,
    item: ContentItem,
    favorite: boolean
): Promise<ItemPatch> {
    await new ContentWriter(app).setFavorite(item.filePath, favorite);
    return { favorite: favorite || undefined };
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
            ? transitionFor(
                  status,
                  { started: item.started, finished: item.finished, readings: item.readings },
                  getTodayString(),
                  keepsReadings()
              )
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

/**
 * Put items into one series, or take them out of theirs (no name). The store
 * follows each write, so the list regroups as it goes. Items already in that
 * series are left as they are — with the place they have in it. Returns how
 * many notes were written.
 */
export async function setItemsSeries(
    app: App,
    items: readonly ContentItem[],
    series: string | undefined
): Promise<number> {
    const writer = new ContentWriter(app);
    const patchContentItem = useZenithStore.getState().patchContentItem;
    const name = series?.trim() || undefined;
    let written = 0;
    for (const item of items) {
        if (name && item.series?.trim() === name) continue;
        if (!name && !item.series) continue;
        try {
            await writer.setSeries(item.filePath, name);
            patchContentItem(item.id, { series: name, seriesOrder: undefined });
            written++;
        } catch (err) {
            console.error('Zenith: Failed to set series:', item.filePath, err);
        }
    }
    return written;
}

/** Give a series a new name, keeping every part where it stands in it. */
export async function renameSeries(app: App, parts: readonly ContentItem[], name: string): Promise<void> {
    const writer = new ContentWriter(app);
    const patchContentItem = useZenithStore.getState().patchContentItem;
    const next = name.trim();
    if (!next) return;
    // The whole series moves in the store at once, so it never shows split
    // between two names while the notes are written one by one.
    const changed = parts.filter((item) => item.series !== next);
    for (const item of changed) patchContentItem(item.id, { series: next });
    for (const item of changed) await writer.patch(item.filePath, { series: next });
}

/**
 * Number the parts 1…n in the order given — the order a drag left them in.
 * The store moves first, so the row lands where it was dropped at once; only
 * the notes whose number changed are written.
 */
export async function setSeriesOrder(app: App, parts: readonly ContentItem[]): Promise<void> {
    const writer = new ContentWriter(app);
    const patchContentItem = useZenithStore.getState().patchContentItem;
    const changed = parts
        .map((item, index) => ({ item, order: index + 1 }))
        .filter(({ item, order }) => item.seriesOrder !== order);
    for (const { item, order } of changed) patchContentItem(item.id, { seriesOrder: order });
    for (const { item, order } of changed) await writer.patch(item.filePath, { seriesOrder: order });
}
