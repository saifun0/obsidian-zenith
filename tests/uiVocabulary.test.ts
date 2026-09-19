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
