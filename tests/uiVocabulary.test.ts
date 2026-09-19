import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shared control layer, kept shared.
 *
 * `src/styles/ui.css` and `components/shared/Popover.tsx` exist because every
 * module had been inventing its own: 109 `button.zenith-*` rules, fourteen
 * track/fill pairs for one progress bar, seven hand-written click-outside
 * handlers, five view titles at five sizes. Nothing about that was decided; it
 * is what a codebase does when each new surface starts from an empty file.
 *
 * A shared layer only stays shared if reinventing it is harder than using it,
 * and in CSS it never is — writing forty lines of your own popover is the path
 * of least resistance every single time. These tests are the friction: a new
 * private copy of something that already exists fails here, with the name of
 * the thing to use instead.
 *
 * Each list below is an exception that was looked at and kept. Adding to one is
 * allowed; doing it by accident is not.
 */

const SRC = join(__dirname, '..', 'src');

function walk(dir: string, match: RegExp): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full, match));
        else if (match.test(name)) out.push(full);
    }
    return out;
}

const rel = (f: string) => relative(SRC, f).split(sep).join('/');
const tsx = walk(SRC, /\.tsx$/);
const css = walk(SRC, /\.css$/);
const read = (f: string) => readFileSync(f, 'utf8');

describe('one popover, not seven', () => {
    /**
     * A menu rendered where it was opened is clipped by the first ancestor
     * with `overflow: hidden`, and in this plugin every widget card, task row
     * and grid cell is one. `Popover` portals; a hand-rolled one usually does
     * not, and the bug only shows up near the edge of a card.
     */
    const PORTAL_OK = [
        'components/shared/Popover.tsx',
        // A modal is a portal by definition, and it is the other primitive.
        'components/shared/Modal.tsx',
        // Full-screen image viewer: not a menu, no anchor, nothing to align to.
        'modules/tasks/components/ImageLightbox.tsx',
    ];

    it('routes anchored menus through the shared one', () => {
        const rogue = tsx.filter((f) => read(f).includes('createPortal')).map(rel);
        expect(rogue.sort()).toEqual(PORTAL_OK.sort());
    });

    /**
     * Dismissal is three listeners, not one: a click outside, Escape, and a
     * scroll — a menu anchored to a row that has scrolled away is pointing at
     * something else. Of the seven versions that existed, all seven had the
     * first, three had the second and one had the third.
     */
    const OUTSIDE_CLICK_OK = [
        'components/shared/Popover.tsx',
        // Positioned against the habit grid's own box from an (x, y) rather
        // than from an element, and it has no anchor to hand Popover.
        'modules/journal/components/HabitValuePicker.tsx',
        // Lives inside a dialog and takes Escape before the dialog does; that
        // ordering is the feature, and Popover would take the key first.
        'modules/content/components/MetadataPicker.tsx',
    ];

    it('does not re-implement dismissal', () => {
        const rogue = tsx
            .filter((f) => /addEventListener\(\s*['"](?:mousedown|pointerdown)['"]/.test(read(f)))
            .map(rel);
        expect(rogue.sort()).toEqual(OUTSIDE_CLICK_OK.sort());
    });

    it('styles the surface once, in native theme variables', () => {
        // A portalled element is outside `.zenith-root`, where every
        // `--zenith-*` is declared — read from the body they resolve to
        // nothing and the menu comes out unstyled. This is the failure that
        // keeps being rediscovered, so the rule that draws the surface is
        // asserted to use the theme's own variables with a literal fallback.
        const ui = read(join(SRC, 'styles', 'ui.css'));
        const block = ui.slice(ui.indexOf('.zenith-pop {'), ui.indexOf('.zenith-pop__title'));
        expect(block).toContain('var(--background-secondary, #');
        expect(block).not.toMatch(/var\(--zenith-/);
    });
});

describe('one meter, not fourteen', () => {
    /** Bars that are a different instrument, not a different copy of this one. */
    const OWN_BAR = [
        // A sparkline: an area under a curve, not a fraction of a track.
        'zenith-weather__spark-fill',
        // Arcs and rings, drawn in SVG.
        'zenith-weather__arc-track',
        // A star rating's partial fill — clipped glyphs, not a track.
        'zenith-stars__fill',
        // A poster's tinted underline, sized to the artwork.
        'zenith-poster__line-fill',
    ];

    it('has no new private track/fill pair', () => {
        const found = new Set<string>();
        for (const f of css) {
            for (const m of read(f).matchAll(/\.(zenith-[a-z0-9_-]*(?:__|-)(?:track|fill))\b/g)) {
                found.add(m[1]);
            }
        }
        for (const ok of OWN_BAR) found.delete(ok);
        // Whatever is left has to be a placement rule for `.zenith-meter`
        // rather than a second definition of it: no height, no track colour.
        for (const cls of found) {
            const owner = css.find((f) => read(f).includes(`.${cls} {`));
            if (!owner) continue;
            const body = read(owner).split(`.${cls} {`)[1].split('}')[0];
            expect(
                /border-radius:\s*999px/.test(body) && /background:\s*color-mix/.test(body),
                `.${cls} redraws the shared meter — use <Meter> instead`
            ).toBe(false);
        }
    });
});

describe('one target scale', () => {
    it('states the sizes once and grows them for a finger', () => {
        const ui = read(join(SRC, 'styles', 'ui.css'));
        // WCAG 2.2 SC 2.5.8 sets the floor at 24; 2.5.5 and Apple's HIG ask 44
        // once the pointer is coarse. Both numbers live here and nowhere else.
        expect(ui).toContain('--zenith-ctl-sm: 24px');
        const coarse = ui.slice(ui.indexOf('@media (pointer: coarse)'));
        expect(coarse).toContain('--zenith-ctl-lg: 44px');
    });
});

describe('one view header', () => {
    it('leaves no module with a private copy', () => {
        // A module view's header is `<ViewHeader>`. The five that existed
        // disagreed on the title's size (1.2 / 1.25 / 1.4 / 1.5 / 1.9rem) and
        // its weight, which told the reader they had travelled further between
        // two views than they had.
        const own = css
            .flatMap((f) =>
                [...read(f).matchAll(/\.(zenith-[a-z-]+__header(?:-title)?)\s*\{/g)].map(
                    (m) => `${rel(f)}: ${m[1]}`
                )
            )
            // Not module views, and each is its own surface with its own
            // rules: a card's title band, a card's settings back face, the
            // dashboard's greeting, a modal's title bar, the plugin settings
            // pane (Obsidian's own chrome), and one line of icon-plus-name
            // inside a journal statistic.
            .filter(
                (s) =>
                    !/widget-card|widget-settings|dashboard__header|dialog__header|settings__header|jstat__header/.test(
                        s
                    )
            );
        expect(own).toEqual([]);
    });
});

describe('a button the theme cannot repaint', () => {
    /**
     * Obsidian styles buttons in two rules, and the second one is the trap:
     *
     *     button                       { padding; height; border-radius }
     *     button:not(.clickable-icon)  { background-color; box-shadow }
     *
     * `:not()` takes the specificity of its argument, so the second is (0,1,1)
     * — which beats `.zenith-thing { background: transparent }` at (0,1,0).
     *
     * The symptom is specific and was on screen for months: the button wears
     * Obsidian's grey plate and drop shadow at rest, then snaps to the colour
     * this codebase asked for on hover, because `.zenith-thing:hover` is
     * (0,2,0) and wins. Twenty-one rules had it, including the shared icon
     * button in the header of every view — where even the variant named
     * "ghost" was drawing a plate.
     *
     * Anything at (0,2,0) or better is safe. So is (0,1,1) — a tie that plugin
     * CSS wins because it loads after the app's. So is `!important`.
     */
    const PAINTS = /(?:^|[\s;{])(background|background-color|box-shadow)\s*:([^;}]*)/g;

    /** Classes on a `<button>` tag itself, not on anything nested inside it. */
    function buttonClasses(src: string): Set<string> {
        const out = new Set<string>();
        for (const m of src.matchAll(/<button\b/g)) {
            const from = (m.index ?? 0) + m[0].length;
            const at = src.indexOf('className', from);
            if (at < 0 || at - from > 300) continue;
            let j = src.indexOf('=', at) + 1;
            while (src[j] === ' ' || src[j] === '\n') j++;
            let expr: string;
            if (src[j] === '"') {
                expr = src.slice(j + 1, src.indexOf('"', j + 1));
            } else {
                let depth = 0;
                let k = j;
                for (; k < src.length; k++) {
                    if (src[k] === '{') depth++;
                    else if (src[k] === '}' && --depth === 0) break;
                }
                expr = src.slice(j, k);
            }
            for (const c of expr.matchAll(/zenith-[a-z0-9_-]+/g)) out.add(c[0]);
        }
        return out;
    }

    /** The class/attribute/pseudo-class column of a selector's specificity. */
    function columnB(selector: string): number {
        const s = selector.replace(/::[a-z-]+/g, '');
        const n = (re: RegExp) => (s.match(re) ?? []).length;
        return n(/\.[a-zA-Z_-]/g) + n(/\[/g) + n(/(?<!:):[a-z-]+/g);
    }

    /**
     * The same rule's other half: `button { height: var(--input-height) }` is
     * 30px, and a `min-height` below it is ignored outright. A control that
     * asks for 20 and is given 30 is not obviously broken, which is how the
     * calendar's chips spent a version being half again as tall as designed.
     */
    it('hands back the height before asking for a smaller one', () => {
        const onButtons = new Set<string>();
        for (const f of tsx) for (const c of buttonClasses(read(f))) onButtons.add(c);

        const pinned: string[] = [];
        for (const f of css) {
            const body = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
            for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                const min = rule[2].match(/(?:^|[\s;{])min-height\s*:\s*([^;}]+)/);
                if (!min) continue;
                if (/(?:^|[\s;{])height\s*:/.test(rule[2])) continue;
                // A `min-height` at or above Obsidian's 30px wins on its own.
                const px = Number(min[1].match(/^(\d+(?:\.\d+)?)px/)?.[1]);
                if (!Number.isFinite(px) || px >= 30) continue;
                for (const part of rule[1].split(',').map((p) => p.trim())) {
                    const classes = [...part.matchAll(/\.(zenith-[a-z0-9_-]+)/g)].map((m) => m[1]);
                    if (classes.some((c) => onButtons.has(c))) pinned.push(`${rel(f)}: ${part}`);
                }
            }
        }
        // Both inherit `height: auto` from the rule that defines them.
        const inherited = /zenith-btn--sm|zenith-project-card__toggle|zenith-tw__link/;
        expect(pinned.filter((p) => !inherited.test(p))).toEqual([]);
    });

    it('states its own background at a specificity the theme cannot beat', () => {
        const onButtons = new Set<string>();
        for (const f of tsx) for (const c of buttonClasses(read(f))) onButtons.add(c);

        const weak: string[] = [];
        for (const f of css) {
            const body = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
            for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
                const decls = [...rule[2].matchAll(PAINTS)];
                if (decls.length === 0) continue;
                // `!important` wins whatever the specificity.
                if (decls.every((d) => d[2].includes('!important'))) continue;
                for (const part of rule[1].split(',').map((p) => p.trim())) {
                    if (part.includes('::')) continue;
                    const classes = [...part.matchAll(/\.(zenith-[a-z0-9_-]+)/g)].map((m) => m[1]);
                    if (!classes.some((c) => onButtons.has(c))) continue;
                    const hasElement = /(^|[\s>+~])[a-z]+[.\s:[]/.test(' ' + part);
                    const b = columnB(part);
                    if (b >= 2 || (b === 1 && hasElement)) continue;
                    weak.push(`${rel(f)}: ${part}`);
                }
            }
        }
        // `zenith-settings__noteBubble` is only ever on a <div>; it is in the
        // set because the name appears inside a button's className expression.
        expect(weak.filter((w) => !w.includes('noteBubble'))).toEqual([]);
    });
});
