import { describe, it, expect } from 'vitest';
import { compareVersions, satisfiesMin } from '../src/core/semver';
import { validateManifest } from '../src/core/moduleManifestSchema';
import { isSafeModuleId, modulePaths } from '../src/core/modulePaths';

const ctx = { pluginVersion: '0.1.0' };

describe('compareVersions', () => {
    it('compares numerically, not lexically', () => {
        // The classic bug: "1.10" sorts before "1.9" as a string.
        expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
        expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
        expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
    });

    it('treats a missing segment as zero', () => {
        expect(compareVersions('1.2', '1.2.0')).toBe(0);
        expect(compareVersions('1', '1.0.0')).toBe(0);
    });

    it('sorts a pre-release below the release it leads to', () => {
        expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
        expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
        expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    });

    it('tolerates a leading v and surrounding space', () => {
        expect(compareVersions('v1.2.0', ' 1.2.0 ')).toBe(0);
    });

    it('treats unparseable input as equal rather than throwing', () => {
        // A hand-written manifest will contain junk; refusing to install over
        // it would be worse than comparing loosely.
        expect(compareVersions('banana', '1.0.0')).toBe(0);
        expect(compareVersions('', '1.0.0')).toBe(0);
    });
});

describe('satisfiesMin', () => {
    it('accepts anything when no minimum is declared', () => {
        expect(satisfiesMin('0.1.0', undefined)).toBe(true);
        expect(satisfiesMin('0.1.0', '')).toBe(true);
    });

    it('compares against the declared minimum', () => {
        expect(satisfiesMin('1.0.0', '0.9.0')).toBe(true);
        expect(satisfiesMin('1.0.0', '1.0.0')).toBe(true);
        expect(satisfiesMin('0.9.0', '1.0.0')).toBe(false);
    });
});

describe('isSafeModuleId', () => {
    it('accepts ordinary ids', () => {
        expect(isSafeModuleId('test-module')).toBe(true);
        expect(isSafeModuleId('my_module2')).toBe(true);
    });

    it('rejects anything that could escape the modules folder', () => {
        // The id becomes a path segment, an activeModuleIds entry and a
        // moduleSettings key, so this is the guard for all three.
        for (const bad of ['../evil', 'a/b', 'a\\b', '.', '..', '', '-leading', 'a b', 'a.b']) {
            expect(isSafeModuleId(bad), bad).toBe(false);
        }
        expect(isSafeModuleId(undefined)).toBe(false);
        expect(isSafeModuleId(42)).toBe(false);
    });
});

describe('validateManifest', () => {
    const good = { id: 'cool-module', name: 'Cool', description: 'Does things', version: '1.2.0' };

    it('accepts a well-formed manifest', () => {
        const result = validateManifest(good, ctx);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.manifest.version).toBe('1.2.0');
    });

    it('defaults a missing version rather than rejecting', () => {
        const result = validateManifest({ id: 'a', name: 'A' }, ctx);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.manifest.version).toBe('0.0.0');
    });

    it('rejects an unusable id', () => {
        const result = validateManifest({ ...good, id: '../evil' }, ctx);
        expect(result).toMatchObject({ ok: false, problem: { kind: 'bad-id' } });
    });

    it('refuses ids reserved by Zenith, even future ones', () => {
        // Squatting a built-in id would surface as a collision on upgrade, in
        // the user's vault, with no warning.
        for (const id of ['weather', 'tasks', 'zenith', 'core']) {
            expect(validateManifest({ ...good, id }, ctx)).toMatchObject({
                ok: false,
                problem: { kind: 'reserved-id' },
            });
        }
    });

    it('refuses ids that collide with a currently registered built-in', () => {
        const result = validateManifest({ ...good, id: 'brand-new-builtin' }, {
            ...ctx,
            reservedIds: new Set(['brand-new-builtin']),
        });
        expect(result).toMatchObject({ ok: false, problem: { kind: 'reserved-id' } });
    });

    it('requires a name to show', () => {
        expect(validateManifest({ id: 'a', name: '  ' }, ctx)).toMatchObject({
            ok: false,
            problem: { kind: 'missing-name' },
        });
    });

    it('enforces minZenithVersion', () => {
        expect(validateManifest({ ...good, minZenithVersion: '9.0.0' }, ctx)).toMatchObject({
            ok: false,
            problem: { kind: 'incompatible', required: '9.0.0', actual: '0.1.0' },
        });
        expect(validateManifest({ ...good, minZenithVersion: '0.1.0' }, ctx).ok).toBe(true);
    });

    it('survives junk input instead of throwing', () => {
        expect(validateManifest(null, ctx).ok).toBe(false);
        expect(validateManifest('nope', ctx).ok).toBe(false);
        expect(validateManifest(42, ctx).ok).toBe(false);
    });
});

describe('modulePaths', () => {
    it('builds vault-relative paths under the plugin folder', () => {
        const paths = modulePaths({ manifest: { dir: '.obsidian/plugins/zenith' } } as never);
        expect(paths?.root).toBe('.obsidian/plugins/zenith/modules');
        expect(paths?.main('a')).toBe('.obsidian/plugins/zenith/modules/a/main.js');
        expect(paths?.manifest('a')).toBe('.obsidian/plugins/zenith/modules/a/manifest.json');
        expect(paths?.styles('a')).toBe('.obsidian/plugins/zenith/modules/a/styles.css');
    });

    it('is null when Obsidian has not said where the plugin lives', () => {
        expect(modulePaths({ manifest: {} } as never)).toBeNull();
    });
});
