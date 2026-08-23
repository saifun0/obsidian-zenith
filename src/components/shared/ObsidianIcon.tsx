import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import { CustomIcon, useCustomIcon } from './CustomIcon';

interface ObsidianIconProps {
    /**
     * Icon id. Either an Obsidian id (as returned by getIconIds, e.g. "folder",
     * "lucide-book") or a Zenith custom id from a pack or module (`zi:acme/logo`).
     */
    name: string;
    size?: number;
}

/**
 * Renders an icon by id: a custom one from the registry when the id is ours,
 * otherwise Obsidian's built-in via `setIcon` into a host span.
 *
 * The registry is checked first and by prefix, so every existing caller — a
 * content type, a journal tracker, a folder — gained custom-icon support without
 * changing what it stores or passes.
 */
export const ObsidianIcon: React.FC<ObsidianIconProps> = ({ name, size = 16 }) => {
    const custom = useCustomIcon(name);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        // Skipped entirely for a custom icon — <CustomIcon> owns that branch,
        // and letting `setIcon` run first would flash the "missing icon" glyph.
        if (custom) return;
        const el = ref.current;
        if (!el) return;
        el.textContent = '';
        setIcon(el, name);
        const svg = el.querySelector('svg');
        if (svg) {
            svg.style.width = `${size}px`;
            svg.style.height = `${size}px`;
        }
    }, [name, size, custom]);

    if (custom) return <CustomIcon svg={custom} size={size} className="zenith-obsidian-icon" />;

    return <span ref={ref} className="zenith-obsidian-icon" />;
};
