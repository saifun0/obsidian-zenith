import { useEffect, useRef, useState } from 'react';

/**
 * A number that animates to its target instead of jumping.
 *
 * Written for the habit summary, where the figure changes as a side effect of
 * ticking a day several rows above it. A percentage that silently swaps from 62
 * to 66 is a change nobody sees; one that runs there says "that click did
 * this", which is the whole reason the grid is worth clicking. The library
 * widget wants exactly that for the same reason — pressing "+1" on a row
 * changes a count at the top of the card — which is why this sits in `shared`
 * rather than inside the journal.
 *
 * `enabled` is the user's motion setting. Off, the value is simply the target —
 * not a faster animation, none at all.
 */
export function useCountUp(target: number, enabled: boolean, duration = 650): number {
    // Starts at zero, so the figure runs up on arrival as well as on change.
    // Starting AT the target meant the first render was already the answer and
    // the effect had nothing to animate — the count-up only ever appeared
    // after you edited something, which is the one time it wasn't needed.
    const [value, setValue] = useState(enabled ? 0 : target);
    const fromRef = useRef(enabled ? 0 : target);
    const frameRef = useRef<number>();

    useEffect(() => {
        if (!enabled) {
            setValue(target);
            fromRef.current = target;
            return;
        }

        const from = fromRef.current;
        if (from === target) return;

        const started = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - started) / duration);
            // Ease out: the figure arrives gently rather than stopping dead,
            // which is what makes it read as a value settling.
            const eased = 1 - Math.pow(1 - progress, 3);
            const next = from + (target - from) * eased;
            setValue(next);
            fromRef.current = next;
            if (progress < 1) frameRef.current = window.requestAnimationFrame(step);
            else fromRef.current = target;
        };

        frameRef.current = window.requestAnimationFrame(step);
        return () => {
            if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
        };
    }, [target, enabled, duration]);

    return value;
}
