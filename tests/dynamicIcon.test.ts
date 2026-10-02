// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Compass } from 'lucide-react';
import { mockIcons } from './mocks/obsidian';
import { DynamicIcon } from '../src/components/shared/DynamicIcon';

/**
 * Icons drawn from Obsidian's set instead of lucide-react's.
 *
 * The point of the change was to stop bundling all of lucide-react; the point
 * of this file is that nothing on screen noticed. Every caller styles and
 * sizes these as lucide-react `<svg>`s, so the element has to come out the
 * same: same tag, same classes, same attributes, the shapes inside.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SVG = 'http://www.w3.org/2000/svg';

/** What Obsidian's `getIcon` hands back for a Lucide icon. */
function lucideSource(): SVGSVGElement {
    const svg = document.createElementNS(SVG, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('class', 'svg-icon lucide-book');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5');
    svg.appendChild(path);
    return svg;
}

let host: HTMLElement;
let root: Root;

function render(element: React.ReactElement): SVGSVGElement | null {
    act(() => root.render(element));
    return host.querySelector('svg');
}

describe('DynamicIcon', () => {
    beforeEach(() => {
        mockIcons.clear();
        mockIcons.set('book', lucideSource);
        mockIcons.set('lucide-book', lucideSource);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('draws Obsidian’s icon as lucide-react drew its own', () => {
        const svg = render(React.createElement(DynamicIcon, { name: 'book', size: 14, className: 'zenith-x' }));

        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('class')).toBe('lucide lucide-book zenith-x');
        expect(svg?.getAttribute('width')).toBe('14');
        expect(svg?.getAttribute('height')).toBe('14');
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg?.getAttribute('fill')).toBe('none');
        expect(svg?.getAttribute('stroke')).toBe('currentColor');
        expect(svg?.getAttribute('stroke-width')).toBe('2');
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
        expect(svg?.querySelector('path')?.getAttribute('d')).toContain('M4 19.5');
    });

    it('takes a colour, a stroke width, a style and an accessible name', () => {
        const svg = render(
            React.createElement(DynamicIcon, {
                name: 'lucide-book',
                color: 'red',
                strokeWidth: 1.5,
                style: { opacity: 0.5 },
                'aria-label': 'Book',
            })
        );

        expect(svg?.getAttribute('class')).toBe('lucide lucide-book');
        expect(svg?.getAttribute('stroke')).toBe('red');
        expect(svg?.getAttribute('stroke-width')).toBe('1.5');
        expect(svg?.style.opacity).toBe('0.5');
        expect(svg?.getAttribute('aria-label')).toBe('Book');
        expect(svg?.hasAttribute('aria-hidden')).toBe(false);
    });

    it('falls back when Obsidian has no icon by that name', () => {
        const svg = render(React.createElement(DynamicIcon, { name: 'no-such-icon', fallback: Compass }));
        expect(svg?.getAttribute('class')).toContain('lucide-compass');
    });

    it('draws nothing for an unknown name without a fallback', () => {
        expect(render(React.createElement(DynamicIcon, { name: 'no-such-icon' }))).toBeNull();
        expect(render(React.createElement(DynamicIcon, {}))).toBeNull();
    });
});
