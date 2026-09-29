import { useRef } from 'react';
import type React from 'react';

/** How long a finger has to rest before it counts as a long press. */
const LONG_PRESS_MS = 500;
/** How far it may drift and still be resting — past this it is a scroll. */
const SLOP = 8;
/** A native `contextmenu` this soon after a long press is the same gesture again. */
const ECHO_MS = 800;

export interface LongPressHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    /**
     * Wraps the element's own right-click handler: a mouse right-click goes to
     * it; the `contextmenu` Android sends after a long press, which this hook
     * has already answered, is swallowed so the menu does not open twice.
     */
    onContextMenu: (e: React.MouseEvent) => void;
    /**
     * True once, for the click that ends a long press — so the element's own
     * click (open the editor, say) does not also fire under the menu.
     */
    swallowClick: () => boolean;
}

/**
 * A long press on touch, as the "right-click" of a phone.
 *
 * Obsidian's views get no long-press of their own, and iOS never turns one
 * into a `contextmenu` event, so the menu a right-click opens on a desktop
 * would be out of reach on an iPhone. Mouse input is left alone: there, the
 * right button already says it.
 */
export function useLongPress(
    onLongPress: (x: number, y: number) => void,
    onRightClick: (e: React.MouseEvent) => void
): LongPressHandlers {
    const latest = useRef({ onLongPress, onRightClick });
    latest.current = { onLongPress, onRightClick };
    const state = useRef({ timer: 0, x: 0, y: 0, fired: 0, swallow: false });

    const clear = () => {
        if (state.current.timer) window.clearTimeout(state.current.timer);
        state.current.timer = 0;
    };

    return {
        onPointerDown: (e) => {
            if (e.pointerType === 'mouse') return;
            clear();
            const s = state.current;
            s.x = e.clientX;
            s.y = e.clientY;
            s.swallow = false;
            s.timer = window.setTimeout(() => {
                s.timer = 0;
                s.fired = Date.now();
                s.swallow = true;
                latest.current.onLongPress(s.x, s.y);
            }, LONG_PRESS_MS);
        },
        onPointerMove: (e) => {
            const s = state.current;
            if (s.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) clear();
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onContextMenu: (e) => {
            if (Date.now() - state.current.fired < ECHO_MS) {
                e.preventDefault();
                return;
            }
            latest.current.onRightClick(e);
        },
        swallowClick: () => {
            if (!state.current.swallow) return false;
            state.current.swallow = false;
            return true;
        },
    };
}
