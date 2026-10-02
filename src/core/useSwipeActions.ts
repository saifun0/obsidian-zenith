import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

/**
 * Within this many px of either side of the window, a swipe is Obsidian's.
 *
 * Obsidian opens its sidebars with a horizontal swipe that may start anywhere
 * in the workspace, and it decides at `touchstart` whether to follow one:
 * walking up from the touched element, it lets go at the first that carries
 * `data-ignore-swipe` — its own sliders, table handles and canvas do. So a row
 * that swipes marks itself, touch by touch, and leaves the mark off when the
 * finger lands at the very edge, where reaching for a sidebar is what that
 * gesture has always meant.
 */
export const EDGE_PX = 24;

/** Mark `el` as ours for the swipe this touch starts, or not, by where it starts. */
export function claimSwipes(el: HTMLElement): () => void {
    const onStart = (e: TouchEvent) => {
        const x = e.touches[0]?.clientX ?? 0;
        const width = el.ownerDocument.defaultView?.innerWidth ?? Infinity;
        if (x < EDGE_PX || x > width - EDGE_PX) delete el.dataset.ignoreSwipe;
        else el.dataset.ignoreSwipe = 'true';
    };
    // Listening on the element itself runs before Obsidian's listener on the
    // workspace further up, which is the whole point.
    el.addEventListener('touchstart', onStart, { passive: true });
    return () => {
        el.removeEventListener('touchstart', onStart);
        delete el.dataset.ignoreSwipe;
    };
}

/** Travel before a touch counts as a horizontal swipe rather than a tap or a scroll. */
const SLOP = 10;
/** Travel that commits the action when the finger lifts. */
const COMMIT_PX = 88;
/** Past the commit point the row keeps following, but reluctantly. */
const DRAG = 0.35;

export type SwipeSide = 'right' | 'left';

export interface SwipeOptions {
    enabled: boolean;
    /** A swipe towards the right — the row slides right. */
    onRight?: () => void;
    onLeft?: () => void;
}

export interface SwipeApi {
    /** For the row: claims the gesture from Obsidian, touch by touch. */
    rowRef: (el: HTMLElement | null) => void;
    /** For the layer that slides. */
    sheetRef: (el: HTMLElement | null) => void;
    handlers: {
        onPointerDown: (e: React.PointerEvent) => void;
        onPointerMove: (e: React.PointerEvent) => void;
        onPointerUp: (e: React.PointerEvent) => void;
        onPointerCancel: () => void;
    };
    /** The side the row is pulled towards, once far enough to act on lifting. */
    armed: SwipeSide | null;
    /** The side the row is pulled towards at all, for what shows beneath it. */
    pulling: SwipeSide | null;
    /** True once for the click that ends a swipe, so it does not also open the task. */
    swallowClick: () => boolean;
}

/**
 * Swipe a row sideways to act on it — touch only; a mouse drags text.
 *
 * The row follows the finger, what the swipe will do shows underneath, and
 * lifting past the commit point does it. Vertical intent wins: the list
 * scrolls, and a swipe that was meant as a scroll does nothing at all. The
 * row's CSS needs `touch-action: pan-y` for the browser to hand horizontal
 * movement to the page at all.
 */
export function useSwipeActions({ enabled, onRight, onLeft }: SwipeOptions): SwipeApi {
    const sheet = useRef<HTMLElement | null>(null);
    const row = useRef<HTMLElement | null>(null);
    const release = useRef<(() => void) | null>(null);
    const start = useRef<{ x: number; y: number; id: number; engaged: boolean } | null>(null);
    const swallow = useRef(false);
    const [pulling, setPulling] = useState<SwipeSide | null>(null);
    const [armed, setArmed] = useState<SwipeSide | null>(null);
    const latest = useRef({ onRight, onLeft });
    latest.current = { onRight, onLeft };

    const rowRef = useCallback(
        (el: HTMLElement | null) => {
            release.current?.();
            release.current = null;
            row.current = el;
            if (el && enabled) release.current = claimSwipes(el);
        },
        [enabled]
    );
    useEffect(() => () => release.current?.(), []);

    const sheetRef = useCallback((el: HTMLElement | null) => {
        sheet.current = el;
    }, []);

    const place = (dx: number, animate: boolean) => {
        const el = sheet.current;
        if (!el) return;
        el.style.transition = animate ? 'transform 0.22s cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none';
        el.style.transform = dx ? `translateX(${dx}px)` : '';
    };

    const reset = () => {
        start.current = null;
        setPulling(null);
        setArmed(null);
        place(0, true);
    };

    const allowed = (side: SwipeSide) =>
        side === 'right' ? !!latest.current.onRight : !!latest.current.onLeft;

    return {
        rowRef,
        sheetRef,
        armed,
        pulling,
        swallowClick: () => {
            if (!swallow.current) return false;
            swallow.current = false;
            return true;
        },
        handlers: {
            onPointerDown: (e) => {
                if (!enabled || e.pointerType !== 'touch' || !e.isPrimary) return;
                swallow.current = false;
                start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, engaged: false };
            },
            onPointerMove: (e) => {
                const s = start.current;
                if (!s || e.pointerId !== s.id) return;
                const dx = e.clientX - s.x;
                const dy = e.clientY - s.y;
                if (!s.engaged) {
                    if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
                        start.current = null;
                        return;
                    }
                    if (Math.abs(dx) < SLOP) return;
                    if (!allowed(dx > 0 ? 'right' : 'left')) {
                        start.current = null;
                        return;
                    }
                    s.engaged = true;
                    try {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    } catch {
                        /* Capture keeps the gesture when the finger leaves the row; it works without. */
                    }
                }
                const side: SwipeSide = dx > 0 ? 'right' : 'left';
                const travel = Math.abs(dx);
                const eased =
                    travel <= COMMIT_PX ? travel : COMMIT_PX + (travel - COMMIT_PX) * DRAG;
                const shown = allowed(side) ? eased : 0;
                place(side === 'right' ? shown : -shown, false);
                setPulling(shown > 0 ? side : null);
                setArmed(shown >= COMMIT_PX ? side : null);
            },
            onPointerUp: (e) => {
                const s = start.current;
                if (!s || e.pointerId !== s.id) return;
                if (!s.engaged) {
                    start.current = null;
                    return;
                }
                const dx = e.clientX - s.x;
                swallow.current = true;
                const side: SwipeSide = dx > 0 ? 'right' : 'left';
                const commit = Math.abs(dx) >= COMMIT_PX && allowed(side);
                reset();
                if (commit) (side === 'right' ? latest.current.onRight : latest.current.onLeft)?.();
            },
            onPointerCancel: () => {
                if (start.current) reset();
            },
        },
    };
}
