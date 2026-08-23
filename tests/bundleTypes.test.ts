import { describe, it, expect } from 'vitest';
import {
    BUNDLE_MAX_MEMBERS,
    addMember,
    bundleSizes,
    bundleOf,
    bundledWidgetIds,
    isBundleId,
    newBundleId,
    normalizeBundles,
    removeMember,
    renameBundle,
    reorderMembers,
    setActive,
    supportsSize,
    type WidgetBundle,
} from '../src/modules/dashboard/grid/bundleTypes';
import type { WidgetSize } from '../src/modules/dashboard/grid/gridTypes';

const bundle = (over: Partial<WidgetBundle> = {}): WidgetBundle => ({
    id: 'bundle:1',
    members: ['a', 'b'],
    activeId: 'a',
    ...over,
});

const sizes = (map: Record<string, WidgetSize[]>) =>
    new Map(
        Object.entries(map).map(([id, list]) => [id, { sizes: list, defaultSize: list[0] }])
    );

describe('isBundleId / newBundleId', () => {
    it('separates bundle ids from widget ids', () => {
        expect(isBundleId('bundle:1')).toBe(true);
        expect(isBundleId('tasks.overview')).toBe(false);
    });

    it('picks an id that is not taken', () => {
        expect(newBundleId([])).toBe('bundle:1');
        expect(newBundleId([bundle({ id: 'bundle:1' }), bundle({ id: 'bundle:2' })])).toBe('bundle:3');
    });

    it('fills a gap left by a dissolved bundle', () => {
        expect(newBundleId([bundle({ id: 'bundle:2' })])).toBe('bundle:1');
    });
});

describe('bundleSizes', () => {
    it('offers only what every member supports', () => {
        const map = sizes({ clock: ['sm', 'md'], tasks: ['md', 'lg'] });
        expect(bundleSizes(['clock', 'tasks'], map).sizes).toEqual(['md']);
    });

    it('falls back to every preset when nothing is shared', () => {
        const map = sizes({ clock: ['sm'], tasks: ['lg'] });
        // Forbidding the pairing outright would make exactly the combination
        // someone wants — a small widget beside a big one — impossible.
        expect(bundleSizes(['clock', 'tasks'], map).sizes).toEqual(['sm', 'md', 'lg']);
    });

    it('prefers md as the default when it survives the intersection', () => {
        const map = sizes({ a: ['sm', 'md', 'lg'], b: ['md', 'lg'] });
        expect(bundleSizes(['a', 'b'], map).defaultSize).toBe('md');
    });

    it('ignores members the registry does not know', () => {
        const map = sizes({ a: ['sm', 'md'] });
        expect(bundleSizes(['a', 'gone'], map).sizes).toEqual(['sm', 'md']);
    });
});

describe('supportsSize', () => {
    it('reports what a widget can render', () => {
        const map = sizes({ clock: ['sm', 'md'] });
        expect(supportsSize('clock', 'md', map)).toBe(true);
        expect(supportsSize('clock', 'lg', map)).toBe(false);
    });

    it('assumes an unknown widget copes, rather than showing a false warning', () => {
        expect(supportsSize('mystery', 'lg', sizes({}))).toBe(true);
    });
});

describe('normalizeBundles', () => {
    const registered = new Set(['a', 'b', 'c', 'd']);

    it('keeps a well-formed bundle', () => {
        const { bundles } = normalizeBundles([bundle()], registered);
        expect(bundles).toEqual([bundle()]);
    });

    it('drops members whose module was disabled', () => {
        const { bundles } = normalizeBundles([bundle({ members: ['a', 'b', 'gone'] })], registered);
        expect(bundles[0].members).toEqual(['a', 'b']);
    });

    it('dissolves a bundle that drops to one member, releasing it', () => {
        const { bundles, released } = normalizeBundles(
            [bundle({ members: ['a', 'gone'] })],
            registered
        );
        expect(bundles).toEqual([]);
        expect(released).toEqual(['a']);
    });

    it('never lets two bundles claim the same widget', () => {
        const { bundles } = normalizeBundles(
            [bundle({ id: 'bundle:1', members: ['a', 'b'] }), bundle({ id: 'bundle:2', members: ['b', 'c'] })],
            registered
        );
        expect(bundles).toHaveLength(1);
        expect(bundles[0].members).toEqual(['a', 'b']);
    });

    it('repairs an activeId that is not a member', () => {
        const { bundles } = normalizeBundles([bundle({ activeId: 'gone' })], registered);
        expect(bundles[0].activeId).toBe('a');
    });

    it('survives junk from a hand-edited data.json', () => {
        expect(normalizeBundles('nonsense', registered).bundles).toEqual([]);
        expect(normalizeBundles([null, 42, { id: 'no-prefix', members: ['a', 'b'] }], registered).bundles)
            .toEqual([]);
    });

    it('drops a blank name rather than storing an empty string', () => {
        const { bundles } = normalizeBundles([bundle({ name: '   ' })], registered);
        expect(bundles[0].name).toBeUndefined();
    });

    it('caps membership', () => {
        const many = Array.from({ length: 20 }, (_, i) => `w${i}`);
        const { bundles } = normalizeBundles(
            [bundle({ members: many })],
            new Set(many)
        );
        expect(bundles[0].members).toHaveLength(BUNDLE_MAX_MEMBERS);
    });
});

describe('membership', () => {
    it('appends a member and makes it active — otherwise it seems to vanish', () => {
        const next = addMember([bundle()], 'bundle:1', 'c');
        expect(next[0].members).toEqual(['a', 'b', 'c']);
        expect(next[0].activeId).toBe('c');
    });

    it('ignores a widget already in the bundle', () => {
        expect(addMember([bundle()], 'bundle:1', 'a')[0].members).toEqual(['a', 'b']);
    });

    it('removes a member and keeps the bundle when two remain', () => {
        const { bundles, dissolvedInto } = removeMember([bundle({ members: ['a', 'b', 'c'] })], 'bundle:1', 'b');
        expect(bundles[0].members).toEqual(['a', 'c']);
        expect(dissolvedInto).toBeUndefined();
    });

    it('dissolves the bundle when one member would be left', () => {
        const { bundles, dissolvedInto } = removeMember([bundle()], 'bundle:1', 'b');
        expect(bundles).toEqual([]);
        expect(dissolvedInto).toBe('a');
    });

    it('moves the active flag when the active member is removed', () => {
        const { bundles } = removeMember(
            [bundle({ members: ['a', 'b', 'c'], activeId: 'b' })],
            'bundle:1',
            'b'
        );
        expect(bundles[0].activeId).toBe('a');
    });

    it('reorders within the rail', () => {
        const next = reorderMembers([bundle({ members: ['a', 'b', 'c'] })], 'bundle:1', 'c', 0);
        expect(next[0].members).toEqual(['c', 'a', 'b']);
    });

    it('only activates an actual member', () => {
        expect(setActive([bundle()], 'bundle:1', 'zz')[0].activeId).toBe('a');
        expect(setActive([bundle()], 'bundle:1', 'b')[0].activeId).toBe('b');
    });

    it('clears the name when renamed to blank', () => {
        const named = renameBundle([bundle()], 'bundle:1', 'Morning');
        expect(named[0].name).toBe('Morning');
        expect(renameBundle(named, 'bundle:1', '  ')[0].name).toBeUndefined();
    });
});

describe('lookups', () => {
    it('finds the bundle holding a widget', () => {
        expect(bundleOf([bundle()], 'b')?.id).toBe('bundle:1');
        expect(bundleOf([bundle()], 'zz')).toBeUndefined();
    });

    it('lists every bundled widget', () => {
        const all = bundledWidgetIds([bundle(), bundle({ id: 'bundle:2', members: ['c', 'd'] })]);
        expect([...all].sort()).toEqual(['a', 'b', 'c', 'd']);
    });
});
