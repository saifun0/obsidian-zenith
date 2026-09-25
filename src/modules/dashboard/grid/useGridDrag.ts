import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { dropTargetCell, moveItem, reorderIds, stackDropIndex } from './gridEngine';
import { dimsOf, type WidgetLayoutItem } from './gridTypes';

/** How long to hold before the dashboard flips into edit mode. */
const LONG_PRESS_MS = 550;
/** Movement past this many px cancels a long press (it was a scroll/drag). */
const LONG_PRESS_SLOP = 8;
/** Dragging within this many px of an edge starts auto-scrolling. */
const EDGE_ZONE = 76;
/** Peak auto-scroll speed, px per animation frame. */
const EDGE_SPEED = 20;
/**
 * How long a dragged card must rest over another before they'd merge.
 *
 * Without a dwell, bundles would form by accident every time a card was carried
 * across a neighbour on its way somewhere else — and merging is the one drag
 * outcome that isn't undone by dragging back.
 */
const MERGE_DWELL_MS = 400;

/**
 * Don't hijack presses that land on something the widget itself handles —
 * checkboxes, refresh buttons, links. Long-press on the card's empty space is
 * still how you get into edit mode.
 */
function isInteractive(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest('button, a, input, select, textarea, [role="button"]');
}

/** Nearest scrollable ancestor — what auto-scroll drives while dragging. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
    let node = el?.parentElement ?? null;
    while (node) {
        const overflowY = getComputedStyle(node).overflowY;
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
            return node;
        }
        node = node.parentElement;
    }
    return (document.scrollingElement as HTMLElement) ?? null;
}

interface DragOptions {
    /** Committed grid layout. */
    layout: WidgetLayoutItem[];
    /** Committed one-column order, with each card's pixel top and height. */
    stackItems: WidgetLayoutItem[];
    stackTops: number[];
    stackHeights: number[];
    colWidth: number;
    /** Live grid geometry — the drag snaps against the user's configuration. */
    cols: number;
    rowHeight: number;
    gap: number;
    editing: boolean;
    stacked: boolean;
    onCommitLayout: (layout: WidgetLayoutItem[]) => void;
    onCommitStackOrder: (ids: string[]) => void;
    onLongPress: () => void;
    /** The grid element, for mapping pointer position onto cells. */
    containerRef: React.RefObject<HTMLElement>;
    /** Whether dropping `sourceId` onto `targetId` would form a bundle. */
    canMerge: (sourceId: string, targetId: string) => boolean;
    onMerge: (sourceId: string, targetId: string) => void;
}

export interface GridDragApi {
    dragId: string | null;
    /** Pixel offset of the dragged widget from its committed position. */
    offset: { dx: number; dy: number };
    /** Live grid layout while dragging (grid mode), else null. */
    preview: WidgetLayoutItem[] | null;
    /** Live one-column order while dragging (stacked mode), else null. */
    stackPreview: string[] | null;
    /**
     * The card the drag has been resting on long enough to merge with. While
     * this is set the drop placeholder is suppressed: one hover, one meaning.
     */
    mergeTargetId: string | null;
    getItemProps: (id: string) => {
        onPointerDown: (e: React.PointerEvent) => void;
        onPointerMove: (e: React.PointerEvent) => void;
        onPointerUp: (e: React.PointerEvent) => void;
        onPointerCancel: (e: React.PointerEvent) => void;
    };
}

/**
 * Pointer-driven dragging for the dashboard, in both layouts.
 *
 * Grid mode moves a widget between cells; the one-column (narrow) mode reorders
 * the stack instead. Both re-run their layout maths on every move, so what you
 * see mid-drag is exactly what gets committed on release.
 *
 * Dragging near the top or bottom edge auto-scrolls the pane, and the scroll
 * delta is folded back into the drag offset — without that, a widget would slide
 * out from under the pointer as the page moved and you could never drag a card
 * from the top of a long dashboard to the bottom.
 */
export function useGridDrag(opts: DragOptions): GridDragApi {
    const [dragId, setDragId] = useState<string | null>(null);
    const [offset, setOffset] = useState({ dx: 0, dy: 0 });
    const [preview, setPreview] = useState<WidgetLayoutItem[] | null>(null);
    const [stackPreview, setStackPreview] = useState<string[] | null>(null);
    const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

    // Mutable drag bookkeeping — read by handlers without re-subscribing.
    const drag = useRef({
        id: null as string | null,
        pointerId: -1,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        stackIndex: 0,
        lastX: 0,
        lastY: 0,
        scrollEl: null as HTMLElement | null,
        startScrollTop: 0,
        raf: 0,
        longPressTimer: 0,
        pressX: 0,
        pressY: 0,
        /** Card the pointer is currently over, and when it arrived there. */
        hoverId: null as string | null,
        dwellTimer: 0,
        /** Removes this drag's window listeners. Null when not dragging. */
        teardown: null as (() => void) | null,
    });

    // Keep handlers reading fresh values without being re-created mid-drag.
    const latest = useRef(opts);
    latest.current = opts;

    /**
     * Mirror of the three pieces of drag state the drop needs to commit.
     *
     * The listeners that finish a drag are attached to `window` once, at drag
     * start, so they close over whatever these were at that moment — which is
     * `null`. Reading them from a ref instead is what lets those listeners see
     * the live preview when the pointer is finally released.
     */
    const live = useRef({
        preview: null as WidgetLayoutItem[] | null,
        stackPreview: null as string[] | null,
        mergeTargetId: null as string | null,
    });

    const cancelLongPress = useCallback(() => {
        if (drag.current.longPressTimer) {
            window.clearTimeout(drag.current.longPressTimer);
            drag.current.longPressTimer = 0;
        }
    }, []);

    const cancelDwell = useCallback(() => {
        if (drag.current.dwellTimer) {
            window.clearTimeout(drag.current.dwellTimer);
            drag.current.dwellTimer = 0;
        }
    }, []);

    /**
     * Which committed card the pointer is over, by grid coordinates rather than
     * by hit-testing: the dragged card is under the pointer the whole time, so
     * `elementFromPoint` would only ever answer "itself".
     */
    const cardUnderPointer = useCallback((clientX: number, clientY: number): string | null => {
        const d = drag.current;
        const { layout, colWidth, cols, rowHeight, gap, containerRef } = latest.current;
        const host = containerRef.current;
        if (!host || colWidth <= 0) return null;

        const rect = host.getBoundingClientRect();
        const gx = Math.floor((clientX - rect.left) / (colWidth + gap));
        const gy = Math.floor((clientY - rect.top) / (rowHeight + gap));

        for (const item of layout) {
            if (item.id === d.id) continue;
            const { w, h } = dimsOf(item, cols);
            if (gx >= item.x && gx < item.x + w && gy >= item.y && gy < item.y + h) return item.id;
        }
        return null;
    }, []);

    /** Recompute offset + preview from the last pointer position. */
    const update = useCallback(() => {
        const d = drag.current;
        if (!d.id) return;
        const {
            layout,
            stackItems,
            stackTops,
            stackHeights,
            colWidth,
            cols,
            rowHeight,
            gap,
            stacked,
        } = latest.current;

        // Fold in how far the pane has scrolled since the drag began, so the
        // widget stays glued to the pointer while auto-scrolling.
        const scrolled = d.scrollEl ? d.scrollEl.scrollTop - d.startScrollTop : 0;
        const dx = d.lastX - d.startX;
        const dy = d.lastY - d.startY + scrolled;
        setOffset({ dx, dy });

        if (stacked) {
            const index = stackDropIndex(stackTops, stackHeights, d.stackIndex, dy);
            const next = reorderIds(
                stackItems.map((i) => i.id),
                d.id,
                index
            );
            live.current.stackPreview = next;
            setStackPreview(next);
            return;
        }

        // Merging is a grid-mode gesture only: in one column there are no
        // neighbours to hover, just an order to rearrange.
        const over = cardUnderPointer(d.lastX, d.lastY);
        const mergeable = over && latest.current.canMerge(d.id, over) ? over : null;
        if (mergeable !== d.hoverId) {
            d.hoverId = mergeable;
            cancelDwell();
            live.current.mergeTargetId = null;
            setMergeTargetId(null);
            if (mergeable) {
                d.dwellTimer = window.setTimeout(() => {
                    d.dwellTimer = 0;
                    if (drag.current.hoverId === mergeable) {
                        live.current.mergeTargetId = mergeable;
                        setMergeTargetId(mergeable);
                    }
                }, MERGE_DWELL_MS);
            }
        }

        const target = dropTargetCell(
            { x: d.originX, y: d.originY },
            { dx, dy },
            colWidth,
            rowHeight,
            gap
        );
        const next = moveItem(layout, d.id, target.x, target.y, cols);
        live.current.preview = next;
        setPreview(next);
    }, [cancelDwell, cardUnderPointer]);

    /** Scroll the pane while the pointer sits in an edge zone. */
    const step = useCallback(() => {
        const d = drag.current;
        const el = d.scrollEl;
        if (!d.id || !el) return;

        const rect =
            el === document.scrollingElement
                ? { top: 0, bottom: window.innerHeight }
                : el.getBoundingClientRect();

        let speed = 0;
        if (d.lastY < rect.top + EDGE_ZONE) {
            speed = -((rect.top + EDGE_ZONE - d.lastY) / EDGE_ZONE) * EDGE_SPEED;
        } else if (d.lastY > rect.bottom - EDGE_ZONE) {
            speed = ((d.lastY - (rect.bottom - EDGE_ZONE)) / EDGE_ZONE) * EDGE_SPEED;
        }

        if (speed !== 0) {
            const before = el.scrollTop;
            el.scrollTop = Math.max(0, Math.min(before + speed, el.scrollHeight - el.clientHeight));
            if (el.scrollTop !== before) update();
        }
        d.raf = window.requestAnimationFrame(step);
    }, [update]);

    /** Detach whatever this drag put on `window`. Safe to call twice. */
    const detach = useCallback(() => {
        const teardown = drag.current.teardown;
        drag.current.teardown = null;
        teardown?.();
    }, []);

    const endDrag = useCallback(() => {
        const d = drag.current;
        if (d.raf) window.cancelAnimationFrame(d.raf);
        d.raf = 0;
        d.id = null;
        d.pointerId = -1;
        d.scrollEl = null;
        d.hoverId = null;
        cancelDwell();
        detach();
        live.current = { preview: null, stackPreview: null, mergeTargetId: null };
        setDragId(null);
        setPreview(null);
        setStackPreview(null);
        setMergeTargetId(null);
        setOffset({ dx: 0, dy: 0 });
    }, [cancelDwell, detach]);

    /** Commit the drop (or throw it away) and clear the drag. */
    const finishDrag = useCallback(
        (commit: boolean) => {
            const source = drag.current.id;
            if (commit && source) {
                const { stacked, onCommitLayout, onCommitStackOrder, onMerge } = latest.current;
                const { preview: p, stackPreview: sp, mergeTargetId: merge } = live.current;
                if (merge) {
                    // A merge replaces the move entirely — the card doesn't land
                    // in a cell, it goes inside another one.
                    onMerge(source, merge);
                } else if (stacked) {
                    if (sp) onCommitStackOrder(sp);
                } else if (p) {
                    onCommitLayout(p);
                }
            }
            endDrag();
        },
        [endDrag]
    );

    /**
     * Listen on `window` for the rest of the drag.
     *
     * `setPointerCapture` alone is not enough. Capture lives on a DOM node, and
     * every pointer move recomputes the preview and can have React swap that
     * node out — at which point the browser silently drops the capture and the
     * release is delivered nowhere. The drag then never ends: the card sits
     * frozen at its last offset, which is exactly the bug this fixes.
     *
     * Window listeners survive all of that, and they also cover releasing the
     * button outside the dashboard, outside the pane, or outside the app.
     */
    const attach = useCallback(() => {
        detach();

        const onMove = (e: PointerEvent) => {
            if (drag.current.pointerId !== e.pointerId || !drag.current.id) return;
            drag.current.lastX = e.clientX;
            drag.current.lastY = e.clientY;
            update();
        };
        const onUp = (e: PointerEvent) => {
            if (drag.current.pointerId !== e.pointerId) return;
            finishDrag(true);
        };
        const onCancel = (e: PointerEvent) => {
            if (drag.current.pointerId !== e.pointerId) return;
            finishDrag(false);
        };
        // Alt-tabbing away mid-drag means the release will never be seen; drop
        // what's held rather than leaving the card stuck to the pointer.
        const onBlur = () => finishDrag(false);

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('blur', onBlur);

        drag.current.teardown = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('blur', onBlur);
        };
    }, [detach, finishDrag, update]);

    // Never leave an animation frame, a window listener OR a timer behind if
    // the view unmounts mid-drag.
    //
    // The two timers were the gap. Both fire into `useState` setters, which
    // React 18 turns into a silent no-op once the component is gone — so
    // nothing was visibly wrong, and the cleanup quietly depended on that
    // rather than on doing what its own first line claims.
    useEffect(
        () => () => {
            if (drag.current.raf) window.cancelAnimationFrame(drag.current.raf);
            if (drag.current.dwellTimer) window.clearTimeout(drag.current.dwellTimer);
            if (drag.current.longPressTimer) window.clearTimeout(drag.current.longPressTimer);
            drag.current.teardown?.();
            drag.current.teardown = null;
        },
        []
    );

    const getItemProps = useCallback(
        (id: string) => ({
            onPointerDown: (e: React.PointerEvent) => {
                const { editing, layout, stackItems } = latest.current;
                if (e.button !== 0) return;

                if (!editing) {
                    // Hold on empty card space to enter edit mode.
                    if (isInteractive(e.target)) return;
                    drag.current.pressX = e.clientX;
                    drag.current.pressY = e.clientY;
                    cancelLongPress();
                    drag.current.longPressTimer = window.setTimeout(() => {
                        drag.current.longPressTimer = 0;
                        latest.current.onLongPress();
                    }, LONG_PRESS_MS);
                    return;
                }

                const item = layout.find((i) => i.id === id);
                if (!item) return;

                const el = e.currentTarget as HTMLElement;
                e.preventDefault();
                // Capture is a nicety here, not the mechanism — it suppresses
                // text selection and hover on whatever the pointer crosses. The
                // drag itself is driven from `window`, so losing this is fine.
                try {
                    el.setPointerCapture(e.pointerId);
                } catch {
                    /* capture is unavailable on some inputs; the drag still works */
                }

                const d = drag.current;
                d.id = id;
                d.pointerId = e.pointerId;
                d.startX = e.clientX;
                d.startY = e.clientY;
                d.lastX = e.clientX;
                d.lastY = e.clientY;
                d.originX = item.x;
                d.originY = item.y;
                d.stackIndex = Math.max(
                    0,
                    stackItems.findIndex((i) => i.id === id)
                );
                d.scrollEl = findScrollParent(el);
                d.startScrollTop = d.scrollEl?.scrollTop ?? 0;

                setDragId(id);
                setOffset({ dx: 0, dy: 0 });
                attach();
                if (d.raf) window.cancelAnimationFrame(d.raf);
                d.raf = window.requestAnimationFrame(step);
            },

            // Movement and release during a drag are handled on `window`; what
            // is left here is only the long-press that gets you into edit mode
            // in the first place.
            onPointerMove: (e: React.PointerEvent) => {
                // A press that turns into a swipe is a scroll, not a long press.
                if (!drag.current.longPressTimer) return;
                const moved =
                    Math.abs(e.clientX - drag.current.pressX) > LONG_PRESS_SLOP ||
                    Math.abs(e.clientY - drag.current.pressY) > LONG_PRESS_SLOP;
                if (moved) cancelLongPress();
            },

            onPointerUp: () => cancelLongPress(),
            onPointerCancel: () => cancelLongPress(),
        }),
        [attach, cancelLongPress, step]
    );

    return { dragId, offset, preview, stackPreview, mergeTargetId, getItemProps };
}
