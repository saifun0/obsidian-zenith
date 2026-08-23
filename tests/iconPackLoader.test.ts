import { describe, it, expect } from 'vitest';
import type { ModuleFs } from '../src/core/moduleFs';
import { IconRegistry } from '../src/core/icons/iconRegistry';
import {
    iconNameFromFile,
    loadIconPacks,
    loadIconsFromFolder,
} from '../src/core/icons/iconPackLoader';

const LOGO = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

/** A fake vault: a flat map of path → contents, folders implied by the keys. */
function fakeFs(files: Record<string, string>): ModuleFs {
    const has = (path: string) => Object.keys(files).some((f) => f === path || f.startsWith(`${path}/`));
    const children = (path: string) => {
        const prefix = `${path}/`;
        const direct = new Set<string>();
        for (const key of Object.keys(files)) {
            if (!key.startsWith(prefix)) continue;
            direct.add(key.slice(prefix.length).split('/')[0]);
        }
        return [...direct];
    };

    return {
        exists: async (path) => Object.hasOwn(files, path) || has(path),
        read: async (path) => {
            if (!Object.hasOwn(files, path)) throw new Error(`missing ${path}`);
            return files[path];
        },
        write: async () => undefined,
        listFolders: async (path) =>
            has(path) ? children(path).filter((c) => !Object.hasOwn(files, `${path}/${c}`)) : [],
        listFiles: async (path) =>
            has(path) ? children(path).filter((c) => Object.hasOwn(files, `${path}/${c}`)) : [],
        mkdirp: async () => undefined,
        removeDir: async () => undefined,
        removeFile: async () => undefined,

        // The icon loader reads text only. These exist so the fake still
        // satisfies `ModuleFs` after the sync engine widened it; reaching one
        // from an icon-pack test would be a bug worth failing on, not a case
        // worth faking.
        stat: async (path) =>
            Object.hasOwn(files, path)
                ? { type: 'file' as const, ctime: 0, mtime: 0, size: files[path].length }
                : null,
        readBinary: async () => {
            throw new Error('icon packs are read as text');
        },
        writeBinary: async () => {
            throw new Error('icon packs are read as text');
        },
        walk: async (path) => Object.keys(files).filter((f) => f === path || f.startsWith(`${path}/`)),
    };
}

describe('iconNameFromFile', () => {
    it('takes the basename of an svg', () => {
        expect(iconNameFromFile('logo.svg')).toBe('logo');
        expect(iconNameFromFile('my-logo_2.svg')).toBe('my-logo_2');
    });

    it('ignores non-svg files', () => {
        expect(iconNameFromFile('README.md')).toBeNull();
        expect(iconNameFromFile('logo.png')).toBeNull();
    });

    it('refuses names that could escape the folder', () => {
        expect(iconNameFromFile('../evil.svg')).toBeNull();
        expect(iconNameFromFile('my logo.svg')).toBeNull();
    });
});

describe('loadIconPacks', () => {
    it('loads every svg in every pack', async () => {
        const fs = fakeFs({
            'icons/acme/pack.json': JSON.stringify({ name: 'Acme Icons', author: 'Acme Inc' }),
            'icons/acme/logo.svg': LOGO,
            'icons/acme/mark.svg': LOGO,
            'icons/other/glyph.svg': LOGO,
        });
        const registry = new IconRegistry();

        const reports = await loadIconPacks(fs, 'icons', registry);

        expect(registry.size).toBe(3);
        expect(registry.has('zi:acme/logo')).toBe(true);
        expect(registry.has('zi:other/glyph')).toBe(true);

        const acme = reports.find((r) => r.id === 'acme');
        expect(acme?.label).toBe('Acme Icons');
        expect(acme?.author).toBe('Acme Inc');
        expect(acme?.loaded).toBe(2);
    });

    it('treats a missing icons folder as normal, not an error', async () => {
        const registry = new IconRegistry();
        await expect(loadIconPacks(fakeFs({}), 'icons', registry)).resolves.toEqual([]);
        expect(registry.size).toBe(0);
    });

    it('falls back to the folder name when pack.json is absent or broken', async () => {
        const fs = fakeFs({
            'icons/nomanifest/logo.svg': LOGO,
            'icons/broken/pack.json': '{ not json',
            'icons/broken/logo.svg': LOGO,
        });
        const registry = new IconRegistry();

        const reports = await loadIconPacks(fs, 'icons', registry);

        expect(reports.find((r) => r.id === 'nomanifest')?.label).toBe('nomanifest');
        // A broken manifest costs the pack its label, not its icons.
        expect(reports.find((r) => r.id === 'broken')?.label).toBe('broken');
        expect(registry.has('zi:broken/logo')).toBe(true);
    });

    it('skips a bad icon but keeps the rest of the pack', async () => {
        const fs = fakeFs({
            'icons/acme/good.svg': LOGO,
            'icons/acme/evil.svg': '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
            'icons/acme/README.md': 'hello',
        });
        const registry = new IconRegistry();

        const [report] = await loadIconPacks(fs, 'icons', registry);

        expect(report.loaded).toBe(1);
        expect(registry.has('zi:acme/good')).toBe(true);
        expect(registry.has('zi:acme/evil')).toBe(false);
        expect(report.skipped).toHaveLength(1);
        expect(report.skipped[0].file).toBe('evil.svg');
        expect(report.skipped[0].reason).toContain('script');
    });

    it('does not report non-svg files as failures', async () => {
        const fs = fakeFs({ 'icons/acme/logo.svg': LOGO, 'icons/acme/LICENSE': 'MIT' });
        const registry = new IconRegistry();
        const [report] = await loadIconPacks(fs, 'icons', registry);
        expect(report.skipped).toHaveLength(0);
    });

    it('ignores a pack folder whose name is not a safe id', async () => {
        const fs = fakeFs({ 'icons/../escape/logo.svg': LOGO, 'icons/ok/logo.svg': LOGO });
        const registry = new IconRegistry();

        await loadIconPacks(fs, 'icons', registry);

        expect(registry.listSources().map((s) => s.id)).toEqual(['ok']);
    });

    it('notifies once for the whole sweep, not once per icon', async () => {
        const fs = fakeFs({
            'icons/a/one.svg': LOGO,
            'icons/a/two.svg': LOGO,
            'icons/b/three.svg': LOGO,
        });
        const registry = new IconRegistry();
        let calls = 0;
        registry.subscribe(() => calls++);

        await loadIconPacks(fs, 'icons', registry);

        expect(registry.size).toBe(3);
        expect(calls).toBe(1);
    });
});

describe('loadIconsFromFolder', () => {
    it('registers a module folder under the module id', async () => {
        const fs = fakeFs({ 'modules/my-mod/icons/logo.svg': LOGO });
        const registry = new IconRegistry();

        const report = await loadIconsFromFolder(
            fs,
            'modules/my-mod/icons',
            registry,
            'my-mod',
            'module',
            { label: 'My Module' }
        );

        expect(report.loaded).toBe(1);
        expect(registry.has('zi:my-mod/logo')).toBe(true);
        expect(registry.listSources()[0].kind).toBe('module');
        expect(registry.listSources()[0].label).toBe('My Module');
    });

    it('records the source even when the folder has no icons', async () => {
        const registry = new IconRegistry();
        const report = await loadIconsFromFolder(fakeFs({}), 'nope', registry, 'empty', 'module');
        expect(report.loaded).toBe(0);
        expect(registry.listSources()).toHaveLength(1);
    });
});
