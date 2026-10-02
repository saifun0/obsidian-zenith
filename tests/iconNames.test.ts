import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every icon the code names exists in the oldest Obsidian Zenith supports.
 *
 * Icons drawn by name come from Obsidian's own set (`DynamicIcon`, `setIcon`),
 * and Obsidian 1.8.7 — `minAppVersion` — ships the Lucide of its day. A name
 * from a newer Lucide, or one Lucide spells differently, draws nothing there.
 * `grid-3x3` was one: Obsidian 1.8.7 knows it only as `grid-3x-3` and `grid`.
 *
 * The fixture is the icon table read out of Obsidian 1.8.7's `app.js`. A
 * string in the source that is a Lucide icon's name is taken to be one; the
 * few that are only words are listed below.
 */

const ROOT = join(__dirname, '..');
const OBSIDIAN = new Set(
    readFileSync(join(__dirname, 'fixtures/obsidian-1.8.7-icons.txt'), 'utf8').split('\n').filter(Boolean)
);
const LUCIDE = new Set(
    readdirSync(join(ROOT, 'node_modules/lucide-react/dist/esm/icons'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => f.slice(0, -3))
);

/** Strings that happen to be Lucide names but are never drawn as icons. */
const NOT_ICONS = new Set(['index']);

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/i18n/.test(name) ? [path] : [];
    });
}

describe('icon names', () => {
    it('are all in Obsidian 1.8.7', () => {
        const missing = new Set<string>();
        for (const file of sources(join(ROOT, 'src'))) {
            const text = readFileSync(file, 'utf8');
            for (const m of text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)) {
                const name = m[1];
                if (LUCIDE.has(name) && !OBSIDIAN.has(name) && !NOT_ICONS.has(name)) {
                    missing.add(`${name} (${file.slice(ROOT.length + 1)})`);
                }
            }
        }
        expect([...missing]).toEqual([]);
    });
});
