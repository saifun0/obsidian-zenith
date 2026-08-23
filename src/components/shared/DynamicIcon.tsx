import React from 'react';
import * as Lucide from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { CustomIcon, useCustomIcon } from './CustomIcon';

/** Resolve a kebab/snake-case lucide icon name to its component. */
export function resolveLucideIcon(name?: string): LucideIcon | null {
    if (!name) return null;
    const pascal = name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
    const icon = (Lucide as unknown as Record<string, LucideIcon>)[pascal];
    return icon ?? null;
}

interface DynamicIconProps extends LucideProps {
    /**
     * Lucide icon name in kebab-case (e.g. "layout-dashboard"), or a Zenith
     * custom id from a pack or module (`zi:acme/logo`).
     */
    name?: string;
    /** Fallback icon component when the name can't be resolved. */
    fallback?: LucideIcon | null;
}

/**
 * Render an icon by name: a custom one from the registry when the id is ours,
 * otherwise the lucide component, with an optional fallback.
 *
 * This is the second of Zenith's two icon renderers — `<ObsidianIcon>` goes
 * through `setIcon`, this one through lucide-react components. Both have to
 * consult the registry, or a custom icon would work in the settings form and
 * not on a card, which is exactly the kind of half-feature that reads as a bug.
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, fallback = null, ...props }) => {
    const custom = useCustomIcon(name);

    if (custom) {
        return (
            <CustomIcon
                svg={custom}
                size={props.size ?? 16}
                className={props.className ?? 'zenith-custom-icon'}
            />
        );
    }

    const Icon = resolveLucideIcon(name) ?? fallback;
    return Icon ? <Icon {...props} /> : null;
};
