import {
    GRID_COLS,
    GRID_GAP,
    ROW_HEIGHT,
    MAX_ROWS,
    dimsOf,
    rectOf,
    sizeDims,
    type GridDims,
    type GridRect,
    type WidgetLayoutItem,
    type WidgetSize,
} from './gridTypes';

/**
 * Dashboard grid engine — pure layout maths, no React.
 *
 * The grid auto-compacts vertically: items always float up into free space, so
 * removing or shrinking a widget never leaves a hole. Every function takes a
 * layout and returns a new one; nothing is mutated.
 *
 * The column count is a trailing parameter throughout rather than a module
 * constant, because it is user-configurable — and it defaults to `GRID_COLS`, so
 * a caller that doesn't care about the setting reads exactly as it did before.
 */

// ── Primitives ───────────────────────────────────────

export function collides(a: GridRect, b: GridRect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function collidesAny(items: WidgetLayoutItem[], rect: GridRect, cols: number): boolean {
    return items.some((item) => collides(rectOf(item, cols), rect));
}

/** Reading order: top-to-bottom, then left-to-right. */
export function sortItems(items: WidgetLayoutItem[]): WidgetLayoutItem[] {
    return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Keep a widget of width `w` fully inside the grid. */
export function clampX(x: number, w: number, cols: number = GRID_COLS): number {
    return Math.max(0, Math.min(x, cols - w));
}

/** First row below every placed item. */
export function bottomOf(items: WidgetLayoutItem[], cols: number = GRID_COLS): number {
    return items.reduce((max, item) => {
        const r = rectOf(item, cols);
        return Math.max(max, r.y + r.h);
    }, 0);
}

// ── Placement ────────────────────────────────────────

/**
 * Place items one by one in the given order: each is pushed down until it stops
 * overlapping, then floated back up into any gap above it. Items placed earlier
 * win their slot, which is what makes a dragged widget keep the spot it was
 * dropped on.
 */
function placeAll(order: WidgetLayoutItem[], cols: number): WidgetLayoutItem[] {
    const placed: WidgetLayoutItem[] = [];
    for (const item of order) {
        const dims = dimsOf(item, cols);
        const x = clampX(item.x, dims.w, cols);
        let y = Math.max(0, item.y);
        while (collidesAny(placed, { x, y, ...dims }, cols)) y++;
        while (y > 0 && !collidesAny(placed, { x, y: y - 1, ...dims }, cols)) y--;
        placed.push({ ...item, x, y });
    }
    return sortItems(placed);
}

/** Compact the whole layout upwards, preserving reading order. */
export function compact(items: WidgetLayoutItem[], cols: number = GRID_COLS): WidgetLayoutItem[] {
    return placeAll(sortItems(items), cols);
}

/** Topmost-leftmost free position that fits `dims`. */
export function findFreeSpot(
    items: WidgetLayoutItem[],
    dims: GridDims,
    cols: number = GRID_COLS
): { x: number; y: number } {
    const limit = bottomOf(items, cols) + dims.h + 1;
    for (let y = 0; y < limit; y++) {
        for (let x = 0; x <= cols - dims.w; x++) {
            if (!collidesAny(items, { x, y, ...dims }, cols)) return { x, y };
        }
    }
    return { x: 0, y: bottomOf(items, cols) };
}

/**
 * Convert a drag offset in pixels into the cell the widget should land on.
 *
 * Snapping is measured from the widget's leading (top-left) corner, which is how
 * a snap-to-grid drag reads: the cell flips over once you've dragged past its
 * halfway point. `x` is left unclamped — `moveItem` clamps it to the grid.
 */
export function dropTargetCell(
    origin: { x: number; y: number },
    offset: { dx: number; dy: number },
    colWidth: number,
    rowHeight: number = ROW_HEIGHT,
    gap: number = GRID_GAP
): { x: number; y: number } {
    const colStep = colWidth + gap;
    const rowStep = rowHeight + gap;
    return {
        x: Math.round((origin.x * colStep + offset.dx) / colStep),
        y: Math.max(0, Math.round((origin.y * rowStep + offset.dy) / rowStep)),
    };
}

// ── Mutations ────────────────────────────────────────

/**
 * Drop `id` at (x, y), then re-flow everything.
 *
 * Placement order is by row, with the dragged widget winning ties. That order
 * matters: placing the dragged widget unconditionally first would let it float
 * all the way to row 0 (nothing is above it yet), so it could only ever be moved
 * *up*. Sorting by row instead lets the drop position decide, so dragging a
 * widget below its neighbours actually keeps it there.
 *
 * `y` is also capped at the bottom of the other widgets — without that, dragging
 * downwards would keep extending the grid (and the scrollable area) forever.
 */
export function moveItem(
    items: WidgetLayoutItem[],
    id: string,
    x: number,
    y: number,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    const target = items.find((i) => i.id === id);
    if (!target) return items;

    const rest = items.filter((i) => i.id !== id);
    const moved: WidgetLayoutItem = {
        ...target,
        x,
        y: Math.max(0, Math.min(y, bottomOf(rest, cols))),
    };

    const order = [...rest, moved].sort(
        (a, b) => a.y - b.y || a.x - b.x || (a.id === id ? -1 : b.id === id ? 1 : 0)
    );
    return placeAll(order, cols);
}

/** Switch a widget to another size preset, keeping it anchored where it is. */
export function resizeItem(
    items: WidgetLayoutItem[],
    id: string,
    size: WidgetSize,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    const target = items.find((i) => i.id === id);
    if (!target) return items;
    // Place everything in reading order with the resized widget still in its own
    // slot. Listing it first instead (as this once did) would leave nothing above
    // it, so compaction floated it to row 0 — the widget "jumped to the top" on
    // every resize. Reading order keeps it anchored, growing down into its
    // neighbours the way a drag would.
    // Dropping `w` is deliberate: the preset defines a width, so choosing one
    // is also how you clear a manual span.
    const order = sortItems(items.map((i) => (i.id === id ? { ...i, size, w: undefined, h: undefined } : i)));
    return placeAll(order, cols);
}

/** Append a widget at the first free spot. No-op if it's already placed. */
export function addItem(
    items: WidgetLayoutItem[],
    id: string,
    size: WidgetSize,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    if (items.some((i) => i.id === id)) return items;
    const spot = findFreeSpot(items, sizeDims(size, cols), cols);
    return compact([...items, { id, size, ...spot }], cols);
}

/**
 * Set a widget's width in columns, then re-flow. Clamped to the grid.
 *
 * This is the control that gives the column setting a purpose: presets only
 * offer half-width and full-width, which look the same at any column count.
 */
export function setWidth(
    items: WidgetLayoutItem[],
    id: string,
    w: number,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    if (!items.some((i) => i.id === id)) return items;
    const clamped = Math.min(cols, Math.max(1, Math.round(w)));
    const order = sortItems(items.map((i) => (i.id === id ? { ...i, w: clamped } : i)));
    return placeAll(order, cols);
}

/** Set a widget's height in rows, then re-flow. Clamped to `MAX_ROWS`. */
export function setHeight(
    items: WidgetLayoutItem[],
    id: string,
    h: number,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    if (!items.some((i) => i.id === id)) return items;
    const clamped = Math.min(MAX_ROWS, Math.max(1, Math.round(h)));
    const order = sortItems(items.map((i) => (i.id === id ? { ...i, h: clamped } : i)));
    return placeAll(order, cols);
}

/**
 * Re-lay the whole grid at a new column count, in reading order.
 *
 * Unlike {@link compact}, this discards each widget's saved `x`. Compaction
 * only ever moves things *down*, so widening the grid would leave two
 * half-width widgets stranded on separate rows at their old columns instead of
 * pairing up in the space that just appeared.
 */
export function repack(items: WidgetLayoutItem[], cols: number): WidgetLayoutItem[] {
    const placed: WidgetLayoutItem[] = [];
    for (const item of sortItems(items)) {
        const spot = findFreeSpot(placed, dimsOf(item, cols), cols);
        placed.push({ ...item, ...spot });
    }
    return sortItems(placed);
}

export function removeItem(
    items: WidgetLayoutItem[],
    id: string,
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    if (!items.some((i) => i.id === id)) return items;
    return compact(items.filter((i) => i.id !== id), cols);
}

// ── Reconciliation with the widget registry ──────────

export interface WidgetSizeInfo {
    id: string;
    /** Presets this widget supports, in the order they should be offered. */
    sizes: readonly WidgetSize[];
    defaultSize: WidgetSize;
}

/**
 * Bring a saved layout in line with what's actually registered.
 *
 * Drops entries for widgets that no longer exist (or the user removed), repairs
 * sizes a widget no longer supports, and auto-places anything newly registered
 * so a fresh module shows up on the dashboard without the user hunting for it.
 * `available` should already be in the user's preferred order — new widgets are
 * appended in that order.
 */
export function reconcileLayout(
    saved: WidgetLayoutItem[],
    available: WidgetSizeInfo[],
    hiddenIds: string[] = [],
    cols: number = GRID_COLS
): WidgetLayoutItem[] {
    const byId = new Map(available.map((w) => [w.id, w]));
    const hidden = new Set(hiddenIds);
    const seen = new Set<string>();

    const kept: WidgetLayoutItem[] = [];
    for (const item of sortItems(saved)) {
        const info = byId.get(item.id);
        if (!info || hidden.has(item.id) || seen.has(item.id)) continue;
        seen.add(item.id);
        const size = info.sizes.includes(item.size) ? item.size : info.defaultSize;
        kept.push({ ...item, size });
    }

    let layout = compact(kept, cols);
    for (const info of available) {
        if (seen.has(info.id) || hidden.has(info.id)) continue;
        layout = addItem(layout, info.id, info.defaultSize, cols);
    }
    return layout;
}

// ── Single-column (stacked) order ────────────────────

/**
 * Order the layout for the narrow, one-column view.
 *
 * `saved` is the user's explicit stacked order; anything it doesn't mention
 * (newly added widgets) falls in afterwards in grid reading order, so the two
 * views stay sensible without being locked together.
 */
export function stackOrder(layout: WidgetLayoutItem[], saved: string[]): WidgetLayoutItem[] {
    const byId = new Map(layout.map((i) => [i.id, i]));
    const ordered: WidgetLayoutItem[] = [];
    for (const id of saved) {
        const item = byId.get(id);
        if (item) {
            ordered.push(item);
            byId.delete(id);
        }
    }
    for (const item of sortItems([...byId.values()])) ordered.push(item);
    return ordered;
}

/** Move `id` to `index`, returning a new array. Out-of-range indexes clamp. */
export function reorderIds(ids: string[], id: string, index: number): string[] {
    const from = ids.indexOf(id);
    if (from === -1) return ids;
    const rest = ids.filter((x) => x !== id);
    const to = Math.max(0, Math.min(index, rest.length));
    return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * Which slot a dragged card has been pulled to in the one-column view.
 *
 * A card swaps with a neighbour as soon as its centre crosses into that
 * neighbour's band — i.e. once they overlap by more than half. Comparing
 * centre-to-centre instead would force you to drag a card's full height before
 * anything moved, which feels sluggish.
 */
export function stackDropIndex(
    tops: number[],
    heights: number[],
    dragIndex: number,
    dy: number
): number {
    const centre = tops[dragIndex] + heights[dragIndex] / 2 + dy;
    let index = dragIndex;
    for (let i = 0; i < tops.length; i++) {
        if (i === dragIndex) continue;
        // Dragged up past a card above, or down past a card below.
        if (i < dragIndex && centre < tops[i] + heights[i]) index--;
        else if (i > dragIndex && centre > tops[i]) index++;
    }
    return index;
}

/** True when two layouts are positionally identical (cheap equality check). */
export function layoutsEqual(a: WidgetLayoutItem[], b: WidgetLayoutItem[]): boolean {
    if (a.length !== b.length) return false;
    const sa = sortItems(a);
    const sb = sortItems(b);
    return sa.every((item, i) => {
        const other = sb[i];
        return (
            item.id === other.id &&
            item.x === other.x &&
            item.y === other.y &&
            item.size === other.size
        );
    });
}
