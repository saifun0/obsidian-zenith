import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { getIcon } from 'obsidian';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { CustomIcon, useCustomIcon } from './CustomIcon';

/**
 * Obsidian's own copy of an icon, or null when it has none by that name.
 *
 * Obsidian ships Lucide, and the icon picker offers Obsidian's ids, so a name
 * the user chose and a name in the code both resolve here — the bare Lucide
 * name and the `lucide-` one alike, and Obsidian's own icons as well. Drawing
 * these through lucide-react instead meant bundling every one of its sixteen
 * hundred icons, a fifth of `main.js`, to look a handful up by name.
 */
function obsidianIcon(name: string): SVGSVGElement | null {
    try {
        return getIcon(name);
    } catch {
        return null;
    }
}

interface DynamicIconProps extends LucideProps {
    /**
     * Icon id: a Lucide name in kebab-case (e.g. "layout-dashboard"), any id
     * Obsidian knows, or a Zenith custom id from a pack or module (`zi:acme/logo`).
     */
    name?: string;
    /** Fallback icon component when the name can't be resolved. */
    fallback?: LucideIcon | null;
}

/**
 * Render an icon by name: a custom one from the registry when the id is ours,
 * otherwise Obsidian's, with an optional fallback.
 *
 * This is the second of Zenith's two icon renderers — `<ObsidianIcon>` puts
 * `setIcon` into a span, this one draws the `<svg>` itself, marked up exactly as
 * lucide-react marks its icons up, so styles written for those (`svg.lucide`)
 * and props passed to them (size, colour, stroke width, class) keep working.
 * Both consult the registry, or a custom icon would work in the settings form
 * and not on a card, which is exactly the kind of half-feature that reads as a
 * bug.
 */
export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, fallback = null, ...props }) => {
    const custom = useCustomIcon(name);
    const source = useMemo(() => (!custom && name ? obsidianIcon(name) : null), [custom, name]);

    if (custom) {
        return (
            <CustomIcon
                svg={custom}
                size={props.size ?? 16}
                className={props.className ?? 'zenith-custom-icon'}
            />
        );
    }
    if (name && source) return <BuiltInIcon name={name} source={source} {...props} />;

    const Fallback = fallback;
    return Fallback ? <Fallback {...props} /> : null;
};

/** Whether the caller already said how this icon reads to a screen reader. */
function hasA11yProp(props: object): boolean {
    return Object.keys(props).some((key) => key.startsWith('aria-') || key === 'role' || key === 'title');
}

/**
 * Obsidian's icon, as lucide-react would have drawn it.
 *
 * The geometry is Obsidian's; the element is React's, so it takes props the
 * way any component does. Obsidian's own non-Lucide icons are drawn on a
 * different grid with a different paint, which is why the frame copies the
 * source's `viewBox`, fill, stroke and stroke width rather than assuming
 * Lucide's.
 */
const BuiltInIcon: React.FC<LucideProps & { name: string; source: SVGSVGElement }> = ({
    name,
    source,
    color,
    size = 24,
    strokeWidth,
    absoluteStrokeWidth,
    className,
    children: _children,
    ...rest
}) => {
    const ref = useRef<SVGSVGElement>(null);

    useLayoutEffect(() => {
        // The shapes are moved in by hand: React renders this element with no
        // children of its own, so it leaves these alone.
        ref.current?.replaceChildren(...Array.from(source.cloneNode(true).childNodes));
    }, [source]);

    const sourceWidth = Number(source.getAttribute('stroke-width'));
    const width = strokeWidth ?? (Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 2);

    return (
        <svg
            ref={ref}
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={source.getAttribute('viewBox') ?? '0 0 24 24'}
            fill={source.getAttribute('fill') ?? 'none'}
            stroke={color ?? source.getAttribute('stroke') ?? 'currentColor'}
            strokeWidth={absoluteStrokeWidth ? (Number(width) * 24) / Number(size) : width}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={['lucide', `lucide-${name.replace(/^lucide-/, '')}`, className]
                .filter(Boolean)
                .join(' ')}
            {...(hasA11yProp(rest) ? {} : { 'aria-hidden': 'true' })}
            {...rest}
        />
    );
};
