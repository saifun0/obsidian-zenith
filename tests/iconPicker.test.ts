import { describe, expect, it } from 'vitest';
import { BUILT_IN_LIMIT, iconLabel, iconPickerView } from '../src/core/iconPickerView';
import type { IconSource, RegisteredIcon } from '../src/core/icons';

/**
 * What the icon picker shows for what has been typed: the packs' icons first,
 * each pack under its own name, then Obsidian's own set — as much of it as is
 * drawn at once.
 */

const icon = (source: string, name: string): RegisteredIcon =>
    ({ id: `zi:${source}/${name}`, name, source, sourceKind: 'pack', svg: '<svg/>' }) as RegisteredIcon;

const PACKS: IconSource[] = [
    { id: 'acme', kind: 'pack', label: 'Acme', author: 'A. Maker', icons: [icon('acme', 'logo'), icon('acme', 'anvil')] },
    { id: 'birds', kind: 'pack', label: 'Birds', icons: [icon('birds', 'heron')] },
] as IconSource[];
const BUILT_IN = ['alarm-clock', 'anchor', 'bird', 'lucide-bird-house', 'zap'];

describe('the icon picker', () => {
    it('shows the packs first, each under its own name, then the built-in set', () => {
        const view = iconPickerView('', PACKS, BUILT_IN);
        expect(view.custom).toEqual([
            { label: 'Acme', author: 'A. Maker', ids: ['zi:acme/logo', 'zi:acme/anvil'] },
            { label: 'Birds', author: undefined, ids: ['zi:birds/heron'] },
        ]);
        expect(view.builtIn).toEqual(BUILT_IN);
        expect(view.more).toBe(0);
    });

    it('finds an icon by its name, and a pack by its own', () => {
        expect(iconPickerView('BIRD', PACKS, BUILT_IN)).toEqual({
            // "bird" is in the pack's id, so all of the pack comes up.
            custom: [{ label: 'Birds', author: undefined, ids: ['zi:birds/heron'] }],
            builtIn: ['bird', 'lucide-bird-house'],
            more: 0,
        });
        expect(iconPickerView(' anvil ', PACKS, BUILT_IN).custom).toEqual([
            { label: 'Acme', author: 'A. Maker', ids: ['zi:acme/anvil'] },
        ]);
        // A pack with nothing that matches is not named at all.
        expect(iconPickerView('zap', PACKS, BUILT_IN)).toMatchObject({ custom: [], builtIn: ['zap'] });
    });

    it('draws only so many built-in icons, and never crowds a pack out', () => {
        const many = Array.from({ length: BUILT_IN_LIMIT + 40 }, (_, n) => `glyph-${n}`);
        const view = iconPickerView('', PACKS, many);
        expect(view.builtIn).toHaveLength(BUILT_IN_LIMIT);
        expect(view.more).toBe(40);
        expect(view.custom.flatMap((g) => g.ids)).toHaveLength(3);
        // A search that brings the set under the limit leaves nothing out.
        expect(iconPickerView('glyph-19', PACKS, many)).toMatchObject({ more: 0 });
    });

    it('names an icon by the part a person recognises', () => {
        expect(iconLabel('zi:acme/logo')).toBe('logo');
        expect(iconLabel('lucide-alarm-clock')).toBe('alarm-clock');
        expect(iconLabel('anchor')).toBe('anchor');
    });
});
