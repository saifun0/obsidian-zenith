import { useCallback, useRef } from 'react';

/**
 * Callback ref that turns a vertical mouse wheel into horizontal scrolling on
 * the attached element — a PC wheel only scrolls vertically, so the horizontal
 * hourly strip wouldn't move otherwise. A native, non-passive listener (so
 * `preventDefault` works) attaches only while the element is mounted.
 */
export function useHorizontalWheelRef() {
    const cleanup = useRef<(() => void) | null>(null);
    return useCallback((el: HTMLDivElement | null) => {
        cleanup.current?.();
        cleanup.current = null;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (e.deltaX !== 0 || e.deltaY === 0) return; // already horizontal (trackpad)
            if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll
            el.scrollLeft += e.deltaY;
            e.preventDefault();
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        cleanup.current = () => el.removeEventListener('wheel', onWheel);
    }, []);
}
