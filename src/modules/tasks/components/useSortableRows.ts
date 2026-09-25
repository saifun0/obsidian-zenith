import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { DropPosition } from '../services/taskMove';

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_SLOP = 5;
/** Dragging within this many px of an edge starts auto-scrolling. */
const EDGE_ZONE = 72;
/** Peak auto-scroll speed, px per animation frame. */
const EDGE_SPEED = 18;

export interface SortableRow {
    /** Stable key — usually `${filePath}:${lineNumber}`. */
    key: string;
    filePath: string;
    lineNumber: number;
    /** Which zone (group / bucket) the row currently belongs to. */
    zone?: string;
}

/**
 * Where a drag would land: on a specific row, or in a zone's empty space.
 *
 * The zone case is what makes an *empty* bucket a valid destination — with only
 * row targets, "Today" with nothing in it could never be dropped into, which is
 * exactly when you most want to.
 */
export type DropTarget =
    | { kind: 'row'; key: string; position: DropPosition }
    | { kind: 'zone'; zone: string };

export interface SortableApi {
    /** Key of the row being dragged, or null. */
    dragKey: string | null;
    /** Where the row would land, or null when there's no valid target. */
    dropTarget: DropTarget | null;
    /** Props for each row's drag handle. */
    handleProps: (key: string) => {
        onPointerDown: (e: React.PointerEvent) => void;
        onPointerMove: (e: React.PointerEvent) => void;
        onPointerUp: (e: React.PointerEvent) => void;
        onPointerCancel: (e: React.PointerEvent) => void;
        onKeyDown: (e: React.KeyboardEvent) => void;
    };
    /** Ref for each row element, so the hook can measure it. */
    registerRow: (key: string) => (el: HTMLElement | null) => void;
    /** Ref for each zone container, so a drop can land in its empty space. */
    registerZone: (zone: string) => (el: HTMLElement | null) => void;
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

interface Options {
    rows: SortableRow[];
    /** Commit a move. Resolves when the file write is done. */
    onMove: (source: SortableRow, target: SortableRow, position: DropPosition) => void | Promise<void>;
    /** Commit a drop into a zone's empty space (append / re-bucket). */
    onDropInZone?: (source: SortableRow, zone: string) => void | Promise<void>;
    /** Zones the drag may not land in, e.g. "Overdue" — you can't schedule backwards. */
    isZoneDroppable?: (zone: string, source: SortableRow) => boolean;
    /** Turn dragging off entirely (e.g. the list is sorted, so order is derived). */
    disabled?: boolean;
}

/**
 * useSortableRows — pointer-driven reordering for one list of task rows.
 *
 * Uses pointer events rather than HTML5 drag-and-drop: the same code then works
 * with a mouse, a pen and a finger, and Obsidian's own editor drag handling
 * never competes for the gesture. Modelled on the dashboard's `useGridDrag`,
 * including edge auto-scroll — without it you can't drag a task from the top of
 * a long list to the bottom, because the list never scrolls.
 *
 * The hook only decides *where* a row would land; writing that to the vault is
 * the caller's job via `onMove`.
 */
export function useSortableRows({
    rows,
    onMove,
    onDropInZone,
    isZoneDroppable,
    disabled = false,
}: Options): SortableApi {
    const [dragKey, setDragKey] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

    const elements = useRef(new Map<string, HTMLElement>());
    const zones = useRef(new Map<string, HTMLElement>());
    // Mirrors `dropTarget` for the pointerup handler: reading state there would
    // capture whatever value existed when the handler was created.
    const dropRef = useRef<DropTarget | null>(null);
    // One stable ref callback per row, so a re-render doesn't detach and
    // re-attach every row element mid-drag.
    const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
    const zoneCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
    const drag = useRef({
        key: null as string | null,
        pointerId: -1,
        startX: 0,
        startY: 0,
        lastY: 0,
        active: false,
        scrollEl: null as HTMLElement | null,
        raf: 0,
    });

    // Handlers read the freshest rows without being torn down mid-drag.
    const latest = useRef({ rows, onMove, onDropInZone, isZoneDroppable, disabled });
    latest.current = { rows, onMove, onDropInZone, isZoneDroppable, disabled };

    const registerRow = useCallback((key: string) => {
        let cb = refCallbacks.current.get(key);
        if (!cb) {
            cb = (el: HTMLElement | null) => {
                if (el) elements.current.set(key, el);
                else elements.current.delete(key);
            };
            refCallbacks.current.set(key, cb);
        }
        return cb;
    }, []);

    const registerZone = useCallback((zone: string) => {
        let cb = zoneCallbacks.current.get(zone);
        if (!cb) {
            cb = (el: HTMLElement | null) => {
                if (el) zones.current.set(zone, el);
                else zones.current.delete(zone);
            };
            zoneCallbacks.current.set(zone, cb);
        }
        return cb;
    }, []);

    /** Single place that keeps the state and the ref in step. */
    const applyDropTarget = useCallback((next: DropTarget | null) => {
        dropRef.current = next;
        setDropTarget(next);
    }, []);

    /** Look the rows up by key and hand the drop to the caller. */
    const commitMove = useCallback((sourceKey: string, target: DropTarget) => {
        const { rows: current, onMove: commit, onDropInZone } = latest.current;
        const source = current.find((r) => r.key === sourceKey);
        if (!source) return;

        if (target.kind === 'zone') {
            void onDropInZone?.(source, target.zone);
            return;
        }
        if (target.key === sourceKey) return;
        const dest = current.find((r) => r.key === target.key);
        if (dest) void commit(source, dest, target.position);
    }, []);

    /** Whether a zone will accept the row currently being dragged. */
    const zoneAccepts = useCallback((zone: string, source: SortableRow) => {
        const guard = latest.current.isZoneDroppable;
        return guard ? guard(zone, source) : true;
    }, []);

    /** Which row the pointer is over, and which half of it — else which zone. */
    const resolveTarget = useCallback(
        (y: number): DropTarget | null => {
            const d = drag.current;
            if (!d.key) return null;
            const source = latest.current.rows.find((r) => r.key === d.key);
            if (!source) return null;

            for (const row of latest.current.rows) {
                if (row.key === d.key) continue;
                const el = elements.current.get(row.key);
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (y < rect.top || y > rect.bottom) continue;
                if (row.zone && !zoneAccepts(row.zone, source)) return null;
                return {
                    kind: 'row',
                    key: row.key,
                    position: y < rect.top + rect.height / 2 ? 'before' : 'after',
                };
            }

            // Not over a row: fall back to whichever zone contains the pointer,
            // which covers group headers, the gaps between rows, and empty
            // buckets that have no rows to aim at.
            for (const [zone, el] of zones.current) {
                const rect = el.getBoundingClientRect();
                if (y < rect.top || y > rect.bottom) continue;
                return zoneAccepts(zone, source) ? { kind: 'zone', zone } : null;
            }

            // No zones registered (a flat, ungrouped list): clamp past the ends
            // so the very top and bottom stay reachable.
            if (zones.current.size === 0) {
                const others = latest.current.rows.filter((r) => r.key !== d.key);
                if (others.length === 0) return null;
                const firstEl = elements.current.get(others[0].key);
                const lastEl = elements.current.get(others[others.length - 1].key);
                if (firstEl && y < firstEl.getBoundingClientRect().top) {
                    return { kind: 'row', key: others[0].key, position: 'before' };
                }
                if (lastEl && y > lastEl.getBoundingClientRect().bottom) {
                    return { kind: 'row', key: others[others.length - 1].key, position: 'after' };
                }
            }
            return null;
        },
        [zoneAccepts]
    );

    const step = useCallback(() => {
        const d = drag.current;
        const el = d.scrollEl;
        if (!d.active || !el) return;

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
            if (el.scrollTop !== before) applyDropTarget(resolveTarget(d.lastY));
        }
        d.raf = window.requestAnimationFrame(step);
    }, [resolveTarget, applyDropTarget]);

    const endDrag = useCallback(() => {
        const d = drag.current;
        if (d.raf) window.cancelAnimationFrame(d.raf);
        d.raf = 0;
        d.key = null;
        d.pointerId = -1;
        d.active = false;
        d.scrollEl = null;
        setDragKey(null);
        dropRef.current = null;
        setDropTarget(null);
        document.body.classList.remove('zenith-is-dragging');
    }, []);

    useEffect(
        () => () => {
            if (drag.current.raf) window.cancelAnimationFrame(drag.current.raf);
            document.body.classList.remove('zenith-is-dragging');
        },
        []
    );

    const handleProps = useCallback(
        (key: string) => ({
            onPointerDown: (e: React.PointerEvent) => {
                if (latest.current.disabled || e.button !== 0) return;
                const d = drag.current;
                d.key = key;
                d.pointerId = e.pointerId;
                d.startX = e.clientX;
                d.startY = e.clientY;
                d.lastY = e.clientY;
                d.active = false;
                d.scrollEl = findScrollParent(e.currentTarget as HTMLElement);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
            },

            onPointerMove: (e: React.PointerEvent) => {
                const d = drag.current;
                if (d.pointerId !== e.pointerId || d.key !== key) return;
                d.lastY = e.clientY;

                if (!d.active) {
                    // Wait for real movement so a click on the handle isn't a drag.
                    const moved =
                        Math.abs(e.clientX - d.startX) > DRAG_SLOP ||
                        Math.abs(e.clientY - d.startY) > DRAG_SLOP;
                    if (!moved) return;
                    d.active = true;
                    setDragKey(key);
                    // Suppresses text selection and the I-beam cursor everywhere.
                    document.body.classList.add('zenith-is-dragging');
                    if (d.raf) window.cancelAnimationFrame(d.raf);
                    d.raf = window.requestAnimationFrame(step);
                }

                applyDropTarget(resolveTarget(e.clientY));
            },

            onPointerUp: (e: React.PointerEvent) => {
                const d = drag.current;
                if (d.pointerId !== e.pointerId) return;
                const wasActive = d.active;
                const sourceKey = d.key;
                const target = dropRef.current;
                endDrag();

                if (!wasActive || !sourceKey || !target) return;
                commitMove(sourceKey, target);
            },

            onPointerCancel: () => endDrag(),

            /**
             * Keyboard equivalent — the handle is focusable, so ↑/↓ move the row
             * one place. Dragging is otherwise unreachable without a pointer.
             */
            onKeyDown: (e: React.KeyboardEvent) => {
                if (latest.current.disabled) return;
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                const list = latest.current.rows;
                const index = list.findIndex((r) => r.key === key);
                if (index < 0) return;

                const neighbour = e.key === 'ArrowUp' ? list[index - 1] : list[index + 1];
                if (!neighbour) return;
                e.preventDefault();
                commitMove(key, {
                    kind: 'row',
                    key: neighbour.key,
                    position: e.key === 'ArrowUp' ? 'before' : 'after',
                });
            },
        }),
        [applyDropTarget, endDrag, resolveTarget, step, commitMove]
    );

    return { dragKey, dropTarget, handleProps, registerRow, registerZone };
}
