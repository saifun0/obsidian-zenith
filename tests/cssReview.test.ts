import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What Obsidian's review reads the stylesheets for.
 *
 * A plugin in the community directory has its source linted on every release,
 * and each kind of finding puts a warning on the plugin's page. These are the
 * four kinds it found here, kept out for good:
 *
 *  - `!important`. A rule that has to outrank Obsidian's own styles for a
 *    control does it with an id's weight on the selector instead — `:not(#_)`,
 *    explained in variables.css.
 *  - `:has()`. What a stylesheet worked out from an element's children, the
 *    component that draws them says with a class.
 *  - A property said twice in one rule, as a fallback. The second goes under
 *    `@supports`.
 *  - Properties the review's browser data calls partly supported: multi-column
 *    layout (which includes `column-gap`, even on a grid — `gap` says the
 *    same), `clip-path`, `display: contents`, the longhands of
 *    `text-decoration`, `box-decoration-break`.
 *
 * The review's own tool is stylelint with a browser-support plugin; this is
 * the same list by plainer means, so it runs with the rest of the tests and
 * needs nothing installed.
 */

const SRC = join(__dirname, '..', 'src');

function sheets(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sheets(path);
        return name.endsWith('.css') ? [path] : [];
    });
}

interface Declaration {
    file: string;
    /** Which block it stands in: two rules may share a selector. */
    block: number;
    selector: string;
    prop: string;
    value: string;
}

/** Every declaration, with the selector of the innermost block it is in. */
function declarations(): { decls: Declaration[]; selectors: Array<{ file: string; selector: string }> } {
    const decls: Declaration[] = [];
    const selectors: Array<{ file: string; selector: string }> = [];
    let block = 0;
    for (const path of sheets(SRC)) {
        const file = relative(SRC, path).split('\\').join('/');
        const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        // Innermost blocks only: a block with no brace inside it is a rule's own.
        for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
            const selector = rule[1].trim().replace(/\s+/g, ' ');
            if (selector.startsWith('@') && !selector.startsWith('@font-face')) continue;
            selectors.push({ file, selector });
            block++;
            for (const raw of rule[2].split(';')) {
                const at = raw.indexOf(':');
                if (at < 0) continue;
                const prop = raw.slice(0, at).trim().toLowerCase();
                if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(prop)) continue;
                decls.push({ file, block, selector, prop, value: raw.slice(at + 1).trim() });
            }
        }
    }
    return { decls, selectors };
}

const where = (d: { file: string; selector: string }, more = '') =>
    `${d.file}: ${d.selector.slice(0, 80)}${more ? ' — ' + more : ''}`;

describe('what the review reads the stylesheets for', () => {
    const { decls, selectors } = declarations();

    it('finds the stylesheets it is meant to read', () => {
        expect(decls.length).toBeGreaterThan(5000);
    });

    it('has no !important', () => {
        const found = decls.filter((d) => /!\s*important/i.test(d.value)).map((d) => where(d, d.prop));
        expect(found).toEqual([]);
    });

    it('has no :has()', () => {
        const found = selectors.filter((s) => /:has\(/.test(s.selector)).map((s) => where(s));
        expect(found).toEqual([]);
    });

    it('says no property twice in one rule', () => {
        const found: string[] = [];
        let block = 0;
        let props = new Set<string>();
        for (const d of decls) {
            // Declarations arrive block by block; a new block starts a new tally.
            if (d.block !== block) {
                block = d.block;
                props = new Set();
            }
            if (props.has(d.prop)) found.push(where(d, d.prop));
            props.add(d.prop);
        }
        expect(found).toEqual([]);
    });

    it('uses no property the review calls partly supported', () => {
        const PARTLY =
            /^(-webkit-)?(clip-path|box-decoration-break)$|^columns$|^column-(width|gap|count|span|fill|rule(-color|-style|-width)?)$|^break-(before|after|inside)$|^text-decoration-(style|line|color|thickness|skip|skip-ink)$/;
        const found = decls
            .filter(
                (d) =>
                    PARTLY.test(d.prop) ||
                    (d.prop === 'display' && /^contents\b/.test(d.value)) ||
                    // The shorthand with more than the line is the longhands by another name.
                    (d.prop === 'text-decoration' && /\w \w/.test(d.value))
            )
            .map((d) => where(d, `${d.prop}: ${d.value.slice(0, 40)}`));
        expect(found).toEqual([]);
    });
});
