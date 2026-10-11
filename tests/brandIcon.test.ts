import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZENITH_ICON, registerZenithIcon } from '../src/core/brandIcon';
import { mockAddedIcons } from './mocks/obsidian';

/**
 * Zenith's mark is drawn three times: for the ribbon, as a line icon in the
 * docs, and on the logo's tile. They are one drawing, and this is what keeps
 * them one — a shape moved in one file and not the others fails here.
 */

const IMAGES = join(__dirname, '..', 'docs', 'images');

/** Every `d` of a path and every circle, as written. */
function shapes(svg: string): string[] {
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => `path ${m[1]}`);
    const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)].map(
        (m) => `circle ${m[1]} ${m[2]} ${m[3]}`
    );
    return [...paths, ...circles];
}

describe("Zenith's own icon", () => {
    registerZenithIcon();
    const drawing = mockAddedIcons.get(ZENITH_ICON) ?? '';

    it('is registered with Obsidian under its id', () => {
        expect(drawing).toContain('<path');
    });

    it('is a ring, a point and a Z', () => {
        expect(shapes(drawing)).toHaveLength(3);
    });

    it('fits the box Obsidian gives a registered icon', () => {
        // Drawn on 24 units and scaled to 100.
        expect(drawing).toContain('scale(4.16667)');
        expect(24 * 4.16667).toBeCloseTo(100, 2);
    });

    it("leaves the stroke width to Obsidian's own setting", () => {
        expect(drawing).not.toContain('stroke-width');
    });

    it('carries no aria-label, which Obsidian cannot take on an SVG', () => {
        expect(drawing).not.toContain('aria-label=');
    });

    it('is the drawing in docs/images/icon.svg', () => {
        const icon = readFileSync(join(IMAGES, 'icon.svg'), 'utf8');
        expect(shapes(icon)).toEqual(shapes(drawing));
    });

    it('is the drawing on the logo', () => {
        const logo = shapes(readFileSync(join(IMAGES, 'logo.svg'), 'utf8'));
        for (const shape of shapes(drawing)) expect(logo).toContain(shape);
    });
});
