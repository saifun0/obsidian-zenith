import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { iconRegistry } from '../../core/icons';
import { isCustomIconId, type IconSource } from '../../core/icons/iconRegistry';

/**
 * Resolve an icon id against the custom registry.
 *
 * Subscribed rather than read once: packs load asynchronously off disk and a
 * module can register a logo at any point after its `onload`, so a component
 * that rendered before the pack arrived has to re-render when it does. The
 * revision counter is the snapshot — cheap to compare, and it changes exactly
 * when the registry does.
 */
export function useCustomIcon(name: string | undefined): string | undefined {
    const revision = useIconRegistryRevision();

    return useMemo(
        // `revision` is the dependency that matters; the lookup itself is a map hit.
        () => (name && isCustomIconId(name) ? iconRegistry.svg(name) : undefined),
        [name, revision]
    );
}

/** Re-render whenever the registry changes. The revision is the snapshot. */
export function useIconRegistryRevision(): number {
    return useSyncExternalStore(
        iconRegistry.subscribe,
        iconRegistry.getRevision,
        iconRegistry.getRevision
    );
}

/** Installed packs and module-supplied icons, grouped by source. */
export function useIconSources(): IconSource[] {
    const revision = useIconRegistryRevision();
    return useMemo(() => iconRegistry.listSources(), [revision]);
}

interface CustomIconProps {
    /** Sanitized markup from the registry. */
    svg: string;
    size?: number | string;
    className?: string;
}

/**
 * Mount registry markup as a real SVG node.
 *
 * Parsed and adopted rather than assigned through `innerHTML`. The string was
 * already sanitized on the way into the registry, so this is belt-and-braces —
 * but it also means a malformed icon degrades to "nothing renders" instead of
 * to a half-open tag that swallows the rest of the surrounding markup.
 */
export const CustomIcon: React.FC<CustomIconProps> = ({ svg, size = 16, className }) => {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        host.textContent = '';

        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const root = parsed.documentElement;
        // A parse failure yields a <parsererror> document rather than throwing.
        if (!root || root.tagName.toLowerCase() !== 'svg') return;

        const node = document.importNode(root, true) as unknown as SVGElement;
        const dimension = typeof size === 'number' ? `${size}px` : size;
        node.style.width = dimension;
        node.style.height = dimension;
        // Keeps a logo from spilling out of the box the caller reserved for it.
        node.setAttribute('preserveAspectRatio', node.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet');
        host.appendChild(node);

        return () => {
            host.textContent = '';
        };
    }, [svg, size]);

    return <span ref={ref} className={className ?? 'zenith-custom-icon'} aria-hidden="true" />;
};
