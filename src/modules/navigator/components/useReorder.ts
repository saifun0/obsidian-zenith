import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { moveItem } from '../panel';

interface Drag {
    id: string;
    from: number;
    startY: number;
    pointerId: number;
    /** Each row's middle when the drag began, in list order. */
    centers: number[];
}

/**
 * Reordering a vertical list by a handle: dragged with a mouse or a finger,
 * or moved with the arrow keys once the handle has focus.
 *
 * The rows are measured once, when the drag starts, and the dragged row's
 * place is worked out against those positions. Measuring the list as it is
 * re-rendered under the pointer would move the goalposts with every step, and
 * the row would flicker between two slots.
 */
export function useReorder(ids: readonly string[], commit: (ids: string[]) => void) {
    const rows = useRef(new Map<string, HTMLElement>());
    const drag = useRef<Drag | null>(null);
    const liveRef = useRef<string[] | null>(null);
    const [live, setLiveState] = useState<string[] | null>(null);

    const setLive = (next: string[] | null) => {
        liveRef.current = next;
        setLiveState(next);
    };

    const finish = (keep: boolean) => {
        const next = liveRef.current;
        drag.current = null;
        setLive(null);
        if (keep && next && next.some((id, i) => id !== ids[i])) commit(next);
    };

    const rowRef = (id: string) => (el: HTMLElement | null) => {
        if (el) rows.current.set(id, el);
        else rows.current.delete(id);
    };

    const handleProps = (id: string) => ({
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
            if (e.button !== 0) return;
            const from = ids.indexOf(id);
            if (from < 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
                id,
                from,
                startY: e.clientY,
                pointerId: e.pointerId,
                centers: ids.map((rowId) => {
                    const rect = rows.current.get(rowId)?.getBoundingClientRect();
                    return rect ? rect.top + rect.height / 2 : 0;
                }),
            };
            setLive([...ids]);
        },
        onPointerMove: (e: PointerEvent<HTMLElement>) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.pointerId) return;
            const middle = d.centers[d.from] + (e.clientY - d.startY);
            // Its place is the number of other rows whose middle it has passed.
            const to = d.centers.filter((c, i) => i !== d.from && c < middle).length;
            const next = moveItem(ids, d.from, to);
            if (next.some((rowId, i) => rowId !== liveRef.current?.[i])) setLive(next);
        },
        onPointerUp: (e: PointerEvent<HTMLElement>) => {
            if (drag.current?.pointerId === e.pointerId) finish(true);
        },
        onPointerCancel: (e: PointerEvent<HTMLElement>) => {
            if (drag.current?.pointerId === e.pointerId) finish(false);
        },
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const from = ids.indexOf(id);
            const to = from + (e.key === 'ArrowUp' ? -1 : 1);
            if (from < 0 || to < 0 || to >= ids.length) return;
            commit(moveItem(ids, from, to));
        },
    });

    return {
        /** The ids in the order to draw them: mid-drag, the order it would drop into. */
        order: live ?? [...ids],
        draggingId: live ? (drag.current?.id ?? null) : null,
        rowRef,
        handleProps,
    };
}
