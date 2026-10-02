import { describe, it, expect } from 'vitest';
import { TFile, type App } from 'obsidian';
import { sanitizeIconSvg } from '../src/core/icons/iconSvg';
import { encode } from '../src/modules/sync/hlc';
import { emptyState, mergeSharedState, type SharedState } from '../src/modules/sync/stateMerge';
import { keysForMarker, MAX_ITERATIONS } from '../src/modules/sync/services/crypto/vaultCrypto';
import {
    DEVICE_FEATURES,
    shareableValue,
    withDeviceParts,
} from '../src/modules/sync/statePolicy';
import { externalSettingsPatch } from '../src/core/externalSettings';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import { resolveCover } from '../src/modules/content/services/coverUrl';
import { cssUrl } from '../src/core/imageSource';

/**
 * Small doors that were open: each is something an outside party — an icon
 * pack, another device's file, a remote, a note's frontmatter — could use to
 * make the plugin do what nobody asked.
 */

describe('an icon pack beacon in a presentation attribute', () => {
    const svg = (attrs: string) => {
        const result = sanitizeIconSvg(`<svg viewBox="0 0 1 1"><path d="M0 0" ${attrs}/></svg>`);
        if (!result.ok) throw new Error('refused');
        return result.svg;
    };

    it('drops a url() that points outside the icon', () => {
        expect(svg('mask="url(https://evil.example/m.svg#a)"')).not.toContain('evil');
        expect(svg('fill="url( \'//evil.example/p.svg#g\' )"')).not.toContain('evil');
        expect(svg('filter="url(data:image/svg+xml,…)"')).not.toContain('data:');
    });

    it('keeps one that points at the icon’s own defs, quoted or not', () => {
        expect(svg('fill="url(#g)"')).toContain('fill="url(#g)"');
        expect(svg("clip-path=\"url('#c')\"")).toContain('clip-path');
    });
});

describe('a "__proto__" key in another device’s settings', () => {
    it('is not taken as a prototype', () => {
        const at = (wall: number, node: string) => encode({ wall, counter: 0, node });
        const local: SharedState = { ...emptyState(), values: { features: {} }, stamps: { features: at(1, 'a') } };
        // As JSON.parse produces it: an own property named "__proto__".
        const features = JSON.parse('{"__proto__": {"polluted": true}, "tasks.timer": false}') as Record<string, boolean>;
        const remote: SharedState = { ...emptyState(), values: { features }, stamps: { features: at(2, 'b') } };

        const merged = mergeSharedState(null, local, remote, { node: 'a' }).state.values.features as Record<string, unknown>;

        expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
        expect((merged as { polluted?: unknown }).polluted).toBeUndefined();
        expect(merged['tasks.timer']).toBe(false);
    });
});

describe('an encryption marker asking for an absurd amount of work', () => {
    it('is refused before any of it is done', async () => {
        const marker = { version: 1, iterations: MAX_ITERATIONS + 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==', check: 'x' };
        await expect(keysForMarker('pw', marker)).rejects.toThrow(/rounds of key stretching/);
        await expect(keysForMarker('pw', { ...marker, iterations: 1.5 })).rejects.toThrow();
    });
});

describe('the obsidian:// door stays per device', () => {
    const on = { 'tasks.uriCapture': true, 'tasks.timer': true };

    it('is left out of what is published', () => {
        expect(DEVICE_FEATURES).toContain('tasks.uriCapture');
        expect(shareableValue('features', on)).toEqual({ 'tasks.timer': true });
        expect(shareableValue('tasksFolderPath', 'x')).toBe('x');
    });

    it('is kept as this device has it, whatever arrives', () => {
        expect(withDeviceParts('features', { 'tasks.uriCapture': true, 'tasks.timer': false }, {}))
            .toEqual({ 'tasks.timer': false });
        expect(withDeviceParts('features', { 'tasks.timer': false }, on))
            .toEqual({ 'tasks.timer': false, 'tasks.uriCapture': true });
    });

    it('is not switched by a data.json from elsewhere', () => {
        const ours = { ...DEFAULT_SETTINGS, features: { ...DEFAULT_SETTINGS.features, 'tasks.uriCapture': false } };
        const theirs = { settings: { ...ours, features: { ...ours.features, 'tasks.uriCapture': true } } };
        expect(externalSettingsPatch(ours, theirs)).toEqual({});
    });
});

describe('a cover from a note’s frontmatter', () => {
    const file = new TFile();
    file.path = 'covers/a.jpg';
    const app = {
        metadataCache: { getFirstLinkpathDest: (p: string) => (p === 'covers/a.jpg' ? file : null) },
        vault: {
            getAbstractFileByPath: () => null,
            adapter: { getResourcePath: (p: string) => `app://local/vault/${p}` },
        },
    } as unknown as App;

    it('is a picture address or nothing', () => {
        expect(resolveCover(app, 'https://img.example/a.jpg')).toBe('https://img.example/a.jpg');
        expect(resolveCover(app, 'covers/a.jpg')).toBe('app://local/vault/covers/a.jpg');
        expect(resolveCover(app, 'javascript:alert(1)')).toBeUndefined();
        expect(resolveCover(app, 'data:text/html,<script>x</script>')).toBeUndefined();
        expect(resolveCover(app, 'missing.jpg')).toBeUndefined();
        expect(resolveCover(app, '  ')).toBeUndefined();
    });

    it('cannot close the url() it is put in', () => {
        const css = cssUrl('https://img.example/a.jpg"), url("https://track.example/');
        expect(css.startsWith('url("')).toBe(true);
        expect(css.slice(5, -2)).not.toMatch(/["()]/);
    });
});
