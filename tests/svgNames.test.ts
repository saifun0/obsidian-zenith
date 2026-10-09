import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No `aria-label` on an SVG element.
 *
 * Obsidian shows a tooltip for every element that carries `aria-label`, and
 * the first thing its handler does is call `isShown()` on the element — a
 * method Obsidian adds to `HTMLElement` and an `<svg>` therefore lacks. So a
 * labelled graphic threw "isShown is not a function" into the console each
 * time the pointer crossed it, and a dashboard is crossed a great deal.
 *
 * A graphic is named through `aria-labelledby` and a `<desc>` inside it; an
 * icon from lucide — which hands every prop to its `<svg>` — is named on a
 * `<span role="img">` around it.
 */

const SRC = join(__dirname, '..', 'src');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return name.endsWith('.tsx') ? [path] : [];
    });
}

const SVG_TAGS = 'svg|g|path|rect|circle|ellipse|line|polyline|polygon|text|use';

describe('graphics and their names', () => {
    const files = sources(SRC).map((path) => ({
        name: relative(SRC, path).replace(/\\/g, '/'),
        text: readFileSync(path, 'utf8'),
    }));

    it('finds the sources it is meant to read', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('puts no aria-label on an SVG element', () => {
        const tag = new RegExp(`<(?:${SVG_TAGS})\\b[^>]*?\\baria-label=`, 'g');
        const found = files.flatMap((f) => (f.text.match(tag) ? [f.name] : []));
        expect(found).toEqual([]);
    });

    it('puts no aria-label on a lucide icon, which is an SVG element', () => {
        const found: string[] = [];
        for (const f of files) {
            const imports = [...f.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g)];
            const icons = imports
                .flatMap((m) => m[1].split(','))
                .map(
                    (s) =>
                        s
                            .trim()
                            .split(/\s+as\s+/)
                            .pop() ?? ''
                )
                .filter((s) => /^[A-Z]\w*$/.test(s));
            for (const icon of icons) {
                if (new RegExp(`<${icon}\\b[^>]*?\\baria-label=`).test(f.text)) {
                    found.push(`${f.name}: <${icon}>`);
                }
            }
        }
        expect(found).toEqual([]);
    });
});
