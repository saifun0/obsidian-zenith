import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * What unload is allowed to do.
 *
 * `Plugin.onunload()` is declared `void` in Obsidian's API and is not awaited.
 * That is easy to forget, because writing `async onunload()` compiles, reads
 * naturally and appears to work — right up to a disable-then-enable, where
 * everything after the first `await` resumes AFTER the next instance has
 * already called `onload()`.
 *
 * This plugin had exactly that, and it cost settings rather than frames: the
 * save yielded, the new instance restored the user's settings, the old
 * continuation woke up and reset the shared store to defaults, and the new
 * instance's own subscriber — live by then — wrote those defaults to
 * `data.json`.
 *
 * Checked by reading the source rather than by running the plugin: booting it
 * needs the whole Obsidian surface, and what is defended here is a property of
 * how the method is DECLARED. The same approach `uiVocabulary` takes with the
 * stylesheets.
 */

const MAIN = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');
const LINES = MAIN.split('\n');

/**
 * The body of a method of the plugin class, by name.
 *
 * Line-based, because the file is formatted: a method of this class opens at
 * exactly four spaces of indent and closes on a line that is exactly four
 * spaces and a brace. Anything looser would also match the word inside the
 * comments that discuss these methods.
 */
function methodBody(name: string): string {
    const open = LINES.findIndex(
        (l) => l.startsWith(`    ${name}(`) || l.startsWith(`    async ${name}(`)
    );
    expect(open, `${name}() not found in main.ts`).toBeGreaterThan(-1);

    const close = LINES.findIndex((l, i) => i > open && l === '    }');
    expect(close, `${name}() never closes`).toBeGreaterThan(open);

    return LINES.slice(open, close).join('\n');
}

describe('plugin teardown', () => {
    it('declares onunload synchronously, because Obsidian will not await it', () => {
        expect(LINES.some((l) => l === '    onunload(): void {')).toBe(true);
        expect(LINES.some((l) => l.startsWith('    async onunload'))).toBe(false);
    });

    /**
     * The point of the rule above: an `await` in there is not a pause, it is a
     * detachment — whatever is left to do is now racing the next instance.
     */
    it('never awaits inside onunload', () => {
        expect(methodBody('onunload')).not.toContain('await ');
    });

    /**
     * Cleaning the singleton store is ordering-sensitive — it must not happen
     * while a newer instance is already using it — so it belongs to the method
     * Obsidian actually waits for.
     */
    it('cleans the shared store on the way in, not on the way out', () => {
        expect(methodBody('onload')).toContain('resetZenithStore()');
        expect(methodBody('onunload')).not.toContain('resetZenithStore()');
    });

    /**
     * Subscriptions go first whatever else changes: a store write landing
     * after teardown has begun would otherwise be persisted by a plugin on its
     * way out.
     */
    it('disposes its subscriptions before saving', () => {
        const body = methodBody('onunload');
        const disposed = body.indexOf('this.disposers.forEach');
        const saved = body.indexOf('this.saveData');
        expect(disposed).toBeGreaterThan(-1);
        expect(saved).toBeGreaterThan(disposed);
    });
});
