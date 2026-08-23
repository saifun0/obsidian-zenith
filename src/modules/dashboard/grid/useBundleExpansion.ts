import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EASE, useReducedMotion } from './useBundleSwitch';
import { MAX_ROWS, dimsOf, type WidgetLayoutItem } from './gridTypes';
import type { WidgetBundle } from './bundleTypes';

/**
 * Expanding a bundle in place.
 *
 * The design is explicit that expansion happens *in the grid*, not over it: no
 * overlay, no modality, several bundles may be open at once. So the cell simply
 * grows taller and the neighbours below make room — which means the grid engine
 * does the layout and this hook only has to (a) say how much taller, and (b)
 * make the neighbours' journey visible.
 *
 * The expansion is deliberately **not** persisted. It's a way of looking at a
 * bundle, not a property of it; a dashboard that reopened yesterday's expansions
 * on every launch would be a dashboard that slowly fills with them.
 */

/** Minimum height of one member's section when expanded, in px. */
const SECTION_MIN_PX = 76;

/** Tallest an expanded bundle may get. Beyond this its sections scroll. */
const EXPANDED_MAX_ROWS = 8;

/** Extra rows a bundle needs to show its other members below the active one. */
export function expansionRows(
    bundle: WidgetBundle,
    currentRows: number,
    rowHeight: number,
    gap: number
): number {
    const others = Math.max(0, bundle.members.length - 1);
    if (others === 0) return 0;
    const needed = Math.ceil((others * SECTION_MIN_PX) / (rowHeight + gap));
    const capped = Math.min(EXPANDED_MAX_ROWS, currentRows + needed) - currentRows;
    return Math.max(0, Math.min(capped, MAX_ROWS - currentRows));
}

interface ExpansionOptions {
    /** The grid element whose children are animated. */
    containerRef: React.RefObject<HTMLElement>;
}

export interface BundleExpansion {
    isExpanded: (bundleId: string) => boolean;
    toggle: (bundleId: string) => void;
    /** Drop expansions for bundles that no longer exist. */
    prune: (validIds: Set<string>) => void;
    /** Grow the expanded bundles' items. Returns the same array when idle. */
    apply: (
        layout: WidgetLayoutItem[],
        bundles: WidgetBundle[],
        rowHeight: number,
        gap: number,
        columns: number
    ) => WidgetLayoutItem[];
}

export function useBundleExpansion({ containerRef }: ExpansionOptions): BundleExpansion {
    const reduced = useReducedMotion();
    const [expanded, setExpanded] = useState<string[]>([]);

    /** Card tops measured just before a toggle, keyed by layout id. */
    const before = useRef<Map<string, number> | null>(null);

    const measure = useCallback(() => {
        const host = containerRef.current;
        if (!host) return null;
        const tops = new Map<string, number>();
        host.querySelectorAll<HTMLElement>('[data-widget-id]').forEach((el) => {
            const id = el.dataset.widgetId;
            if (id) tops.set(id, el.getBoundingClientRect().top);
        });
        return tops;
    }, [containerRef]);

    const toggle = useCallback(
        (bundleId: string) => {
            before.current = measure();
            setExpanded((prev) =>
                prev.includes(bundleId) ? prev.filter((id) => id !== bundleId) : [...prev, bundleId]
            );
        },
        [measure]
    );

    /**
     * FLIP: the new layout is already committed (heights and positions are set
     * in one frame — animating `height`/`top` on a grid of absolutely placed
     * cards is what makes it judder), so every card that moved is put back where
     * it was with a transform and released.
     */
    useLayoutEffect(() => {
        const previous = before.current;
        before.current = null;
        if (!previous) return;
        const host = containerRef.current;
        if (!host) return;

        host.querySelectorAll<HTMLElement>('[data-widget-id]').forEach((el) => {
            const id = el.dataset.widgetId;
            if (!id) return;
            const was = previous.get(id);
            if (was === undefined) return;
            const delta = was - el.getBoundingClientRect().top;
            if (Math.abs(delta) < 1) return;

            el.getAnimations().forEach((a) => a.cancel());
            if (reduced) return; // The move is instant; nothing to soften.
            el.animate(
                [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0px)' }],
                { duration: delta > 0 ? 200 : 350, easing: EASE.std, composite: 'add' }
            );
        });
    }, [expanded, containerRef, reduced]);

    const isExpanded = useCallback((id: string) => expanded.includes(id), [expanded]);

    const prune = useCallback((validIds: Set<string>) => {
        setExpanded((prev) => {
            const next = prev.filter((id) => validIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, []);

    const apply = useCallback<BundleExpansion['apply']>(
        (layout, bundles, rowHeight, gap, columns) => {
            if (expanded.length === 0) return layout;
            const byId = new Map(bundles.map((b) => [b.id, b]));
            let changed = false;
            const next = layout.map((item) => {
                const bundle = expanded.includes(item.id) ? byId.get(item.id) : undefined;
                if (!bundle) return item;
                const rows = dimsOf(item, columns).h;
                const extra = expansionRows(bundle, rows, rowHeight, gap);
                if (extra === 0) return item;
                changed = true;
                return { ...item, h: rows + extra };
            });
            return changed ? next : layout;
        },
        [expanded]
    );

    // Stable identity: the grid depends on this object in a memo and an effect,
    // and a fresh one each render would re-run both on every keystroke.
    return useMemo(
        () => ({ isExpanded, toggle, prune, apply }),
        [isExpanded, toggle, prune, apply]
    );
}
