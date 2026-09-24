import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleInstaller } from '../src/core/moduleInstaller';
import { useZenithStore, resetZenithStore } from '../src/store';
import { fnv1a, moduleCodeHash } from '../src/core/hash';
import type ZenithPlugin from '../src/main';

/** Just enough plugin for the installer's constructor. */
const fakePlugin = {
    app: { vault: { adapter: {} } },
    manifest: { dir: '.obsidian/plugins/zenith', version: '0.1.0' },
} as unknown as ZenithPlugin;

const CODE = 'module.exports = class { constructor() { this.id = "a"; } };';

function record(overrides: Record<string, unknown> = {}) {
    return {
        id: 'a',
        name: 'A',
        version: '1.0.0',
        source: { kind: 'vault' as const, ref: 'a.js' },
        installedAt: 1,
        codeHash: moduleCodeHash(CODE),
        consentedAt: 1,
        consentedOrigin: 'vault: a.js',
        ...overrides,
    };
}

beforeEach(() => {
    resetZenithStore();
});

describe('isApproved', () => {
    const installer = new ModuleInstaller(fakePlugin);

    it('is synchronous', () => {
        // THE regression this guards. An earlier version opened the consent
        // dialog here and awaited it — from inside plugin `onload`, before the
        // workspace exists. Obsidian sat at "plugin is taking too long to load"
        // forever, waiting on a click for a modal nobody could see, and because
        // the plugin never finished loading its stylesheet was never applied
        // either. Nothing on the startup path may wait for a human.
        const result = installer.isApproved('a', CODE);
        expect(typeof result).toBe('boolean');
        expect(result).not.toBeInstanceOf(Promise);
    });

    it('refuses a module with no install record', () => {
        // Dropped into the folder by hand, or arrived through vault sync — it
        // has never been approved on this device.
        expect(installer.isApproved('a', CODE)).toBe(false);
    });

    it('approves code whose hash matches the record', () => {
        useZenithStore.getState().updateSettings({ installedModules: [record()] });
        expect(installer.isApproved('a', CODE)).toBe(true);
    });

    it('refuses code that changed after it was approved', () => {
        useZenithStore.getState().updateSettings({ installedModules: [record()] });
        expect(installer.isApproved('a', `${CODE}\n// edited`)).toBe(false);
    });

    it('keeps modules apart', () => {
        useZenithStore.getState().updateSettings({ installedModules: [record()] });
        expect(installer.isApproved('b', CODE)).toBe(false);
    });

    it('asks once more for a module approved under the old checksum', () => {
        // FNV-1a is 32 bits: a different file with the same value is easy to
        // make. Keeping the old match would keep that weakness.
        useZenithStore
            .getState()
            .updateSettings({ installedModules: [record({ codeHash: fnv1a(CODE) })] });
        expect(installer.isApproved('a', CODE)).toBe(false);
    });

    it('asks again when the permissions change', () => {
        useZenithStore.getState().updateSettings({
            installedModules: [record({ consentedPermissions: ['tasks:read'] })],
        });
        expect(installer.isApproved('a', CODE, ['tasks:read'])).toBe(true);
        expect(installer.isApproved('a', CODE, ['tasks:read', 'tasks:write'])).toBe(false);
        expect(installer.isApproved('a', CODE, [])).toBe(false);
    });
});
