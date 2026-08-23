import { setIcon } from 'obsidian';
import { iconRegistry } from './index';
import { isCustomIconId } from './iconRegistry';

/**
 * Put an icon into an element, custom or built-in.
 *
 * The imperative twin of `<ObsidianIcon>`, for the places that are not React:
 * the file-explorer decorator and the icon picker both build DOM by hand. They
 * called `setIcon` directly, which resolves only Obsidian's registry — so
 * without this a pack icon could be chosen for a folder and then render as
 * nothing at all.
 */
export function applyIcon(el: HTMLElement, iconId: string, size?: number): void {
    el.textContent = '';

    const custom = isCustomIconId(iconId) ? iconRegistry.svg(iconId) : undefined;
    if (!custom) {
        setIcon(el, iconId);
        if (size != null) {
            const svg = el.querySelector('svg');
            if (svg) {
                svg.style.width = `${size}px`;
                svg.style.height = `${size}px`;
            }
        }
        return;
    }

    // Already sanitized on the way into the registry; parsed rather than
    // assigned so a malformed icon renders nothing instead of breaking out.
    const parsed = new DOMParser().parseFromString(custom, 'image/svg+xml');
    const root = parsed.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'svg') return;

    const node = document.importNode(root, true) as unknown as SVGElement;
    if (size != null) {
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
    }
    el.appendChild(node);
}
