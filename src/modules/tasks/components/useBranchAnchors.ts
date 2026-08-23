import { useLayoutEffect, type RefObject } from 'react';

/**
 * useBranchAnchors — makes every subtask branch start at its parent's checkbox.
 *
 * The tree connectors are pure CSS, drawn per list item, so a branch can only
 * begin at the top of its own `<ul>`. For a nested list that's a couple of
 * pixels below the parent row and looks fine; for the top level the `<ul>` sits
 * under the task's title *and* its meta pills, so the trunk began floating in
 * mid-air with a visible gap above it.
 *
 * There's no fixed offset to correct for — the gap depends on how the title
 * wraps and which pills (dates, tags, recurrence) that task happens to have. So
 * measure it: for each list, the distance from its parent checkbox's bottom
 * edge down to the list's top becomes `--zenith-branch-rise`, and CSS pulls the
 * first connector up by exactly that much. Anchoring to the checkbox's *bottom*
 * rather than its centre keeps the line from being drawn across the checkbox,
 * which paints below these pseudo-elements.
 *
 * A ResizeObserver re-measures on anything that moves the list: subtasks added
 * or removed, the row rewrapping, the pane resizing.
 */
export function useBranchAnchors(rowRef: RefObject<HTMLElement | null>): void {
    useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row || typeof ResizeObserver === 'undefined') return;

        const measure = () => {
            row.querySelectorAll<HTMLElement>('.zenith-subtasks').forEach((list) => {
                const parent = list.parentElement;
                // A nested list hangs off its own subtask row; the top-level one
                // hangs off the task row itself.
                const anchor = parent?.classList.contains('zenith-subtask-group')
                    ? parent.querySelector<HTMLElement>(':scope > .zenith-subtask .zenith-status__btn')
                    : row.querySelector<HTMLElement>(':scope > .zenith-status > .zenith-status__btn');
                if (!anchor) return;

                const rise = list.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;
                // Only ever pulls the connector *up*; a negative rise would mean
                // the list starts above its own parent, which can't happen.
                list.style.setProperty('--zenith-branch-rise', `${Math.max(0, Math.round(rise))}px`);
            });
        };

        measure();
        // Writing the custom property only moves absolutely-positioned pseudo
        // elements, so this can't feed back into the observer.
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => observer.disconnect();
    }, [rowRef]);
}
