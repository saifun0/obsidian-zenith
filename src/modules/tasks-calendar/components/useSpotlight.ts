import { useCallback, useRef, type PointerEvent } from 'react';

/**
 * Hovering a task lights every piece of it and fades everything else.
 *
 * "Every piece" is the point. A 🛫→📅 bar that crosses three weeks is three
 * ribbons in three rows, and one task can also stand on several days as chips
 * — its start, its due date. Lighting only the element under the pointer made
 * the other two thirds of the bar look like different tasks. Every piece
 * carries its task's id in `data-task`, so all of them can be found at once.
 *
 * Done on the DOM, not through state. A month run holds hundreds of chips, and
 * sweeping the pointer across a week crosses a dozen of them a second; routing
 * each crossing through React would re-render the whole run to change two
 * attributes. The container gets `data-spotlit` while a task is lit, the task's
 * pieces get `data-lit`, and the stylesheet does the rest. React never renders
 * either attribute, so a re-render leaves them where they are.
 *
 * Mouse only: a touch has no hover, and a tap that faded the month for the
 * instant before the note opened would read as a flicker.
 */
export function useSpotlight<T extends HTMLElement>(): {
    onPointerOver: (e: PointerEvent<T>) => void;
    onPointerLeave: (e: PointerEvent<T>) => void;
} {
    const lit = useRef<string | null>(null);

    const light = useCallback((box: HTMLElement, id: string | null) => {
        if (lit.current === id) return;
        lit.current = id;
        box.querySelectorAll('[data-lit]').forEach((el) => el.removeAttribute('data-lit'));
        if (id === null) {
            box.removeAttribute('data-spotlit');
            return;
        }
        box.setAttribute('data-spotlit', '');
        box.querySelectorAll(`[data-task="${CSS.escape(id)}"]`).forEach((el) =>
            el.setAttribute('data-lit', '')
        );
    }, []);

    const onPointerOver = useCallback(
        (e: PointerEvent<T>) => {
            if (e.pointerType !== 'mouse') return;
            // The gap between two chips is part of the day, not of either task,
            // so crossing it puts the month back to normal.
            const piece = (e.target as HTMLElement).closest<HTMLElement>('[data-task]');
            light(e.currentTarget, piece?.dataset.task ?? null);
        },
        [light]
    );

    const onPointerLeave = useCallback(
        (e: PointerEvent<T>) => light(e.currentTarget, null),
        [light]
    );

    return { onPointerOver, onPointerLeave };
}
