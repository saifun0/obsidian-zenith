import { describe, it, expect } from 'vitest';
import type { ModuleFs } from '../src/core/moduleFs';
import {
    SyncEngine,
    buildExcluder,
    isSafeKey,
    remoteBytesAfter,
    settingsOwner,
} from '../src/modules/sync/services/SyncEngine';
import { PrevSyncStore } from '../src/modules/sync/services/prevSyncStore';
import type { SyncRemote } from '../src/modules/sync/services/remotes/types';
import type { FileEntity } from '../src/modules/sync/fileSyncTypes';
import type { SyncPaths } from '../src/modules/sync/syncTypes';

// ── Fakes ────────────────────────────────────────────

interface FakeFile {
    data: string;
    mtime: number;
}

/** `trash` collects what `trashFile` moved there, in order. */
function fakeFs(files: Record<string, FakeFile>, trash: string[] = []): ModuleFs {
    const under = (path: string) =>
        Object.keys(files).filter((f) => path === '/' || f === path || f.startsWith(`${path}/`));

    return {
        exists: async (path) => Object.hasOwn(files, path) || under(path).length > 0,
        read: async (path) => files[path]?.data ?? '',
        write: async (path, data) => {
            files[path] = { data, mtime: files[path]?.mtime ?? 0 };
        },
        listFolders: async () => [],
        listFiles: async () => [],
        mkdirp: async () => undefined,
        removeDir: async () => undefined,
        removeFile: async (path) => {
            delete files[path];
        },
        stat: async (path) =>
            Object.hasOwn(files, path)
                ? {
                      type: 'file' as const,
                      ctime: 0,
                      mtime: files[path].mtime,
                      size: files[path].data.length,
                  }
                : null,
        readBinary: async (path) => new TextEncoder().encode(files[path]?.data ?? '').buffer,
        writeBinary: async (path, data) => {
            files[path] = { data: new TextDecoder().decode(data), mtime: files[path]?.mtime ?? 0 };
        },
        trashFile: async (path) => {
            if (!Object.hasOwn(files, path)) return;
            delete files[path];
            trash.push(path);
        },
        walk: async (path) => under(path),
    };
}

interface FakeRemoteState {
    objects: Record<string, { data: string; mtimeSvr: number }>;
    calls: string[];
    failOn?: string;
}

function fakeRemote(state: FakeRemoteState): SyncRemote {
    return {
        kind: 'webdav',
        id: 'remote-1',
        checkConnection: async () => ({ ok: true }),
        list: async () =>
            Object.entries(state.objects).map(
                ([key, o]): FileEntity => ({
                    key,
                    size: o.data.length,
                    mtimeCli: o.mtimeSvr,
                    mtimeSvr: o.mtimeSvr,
                })
            ),
        stat: async (key) => {
            state.calls.push(`stat:${key}`);
            const object = state.objects[key];
            return object
                ? { key, size: object.data.length, mtimeCli: object.mtimeSvr, mtimeSvr: object.mtimeSvr }
                : null;
        },
        readBinary: async (key) => new TextEncoder().encode(state.objects[key]?.data ?? '').buffer,
        write: async (key, data, mtimeCli) => {
            state.calls.push(`write:${key}`);
            if (state.failOn === key) throw new Error('server said no');
            const text = new TextDecoder().decode(data);
            // A server that stamps its own clock — the awkward case.
            state.objects[key] = { data: text, mtimeSvr: mtimeCli + 500_000 };
            return {
                key,
                size: text.length,
                mtimeCli,
                mtimeSvr: state.objects[key].mtimeSvr,
            };
        },
        remove: async (key) => {
            state.calls.push(`remove:${key}`);
            if (state.failOn === key) throw new Error('server said no');
            delete state.objects[key];
        },
    };
}

const paths: SyncPaths = {
    root: '.obsidian/plugins/zenith/sync',
    outboxDir: '.obsidian/plugins/zenith/sync/outbox',
    outbox: (id) => `.obsidian/plugins/zenith/sync/outbox/${id}.json`,
    baseDir: (self) => `.obsidian/plugins/zenith/sync/base/${self}`,
    base: (self, peer) => `.obsidian/plugins/zenith/sync/base/${self}/${peer}.json`,
    local: (id) => `.obsidian/plugins/zenith/sync/local/${id}.json`,
    prev: (device, remote) => `.obsidian/plugins/zenith/sync/prev/${device}/${remote}.json`,
    journal: (id) => `.obsidian/plugins/zenith/sync/journal/${id}.jsonl`,
};

const ENGINE_OPTS = {
    localRoot: '',
    includeConfigDir: false,
    configDir: '.obsidian',
    userExcludes: [],
    pluginDir: '.obsidian/plugins/zenith',
    carrySettings: false,
    conflictAction: 'keep_newer' as const,
    protectModifyRatio: 0.5,
    maxFileSize: 0,
    concurrency: 4,
    deviceLabel: 'desktop',
};

function makeEngine(
    files: Record<string, FakeFile>,
    remoteState: FakeRemoteState,
    optsPatch: Partial<typeof ENGINE_OPTS> = {}
) {
    const trash: string[] = [];
    const fs = fakeFs(files, trash);
    const prevStore = new PrevSyncStore(fs, paths);
    const engine = new SyncEngine(fs, fakeRemote(remoteState), prevStore, 'devA', {
        ...ENGINE_OPTS,
        ...optsPatch,
    });
    return { engine, fs, prevStore, trash };
}

// ── Exclusions ───────────────────────────────────────

describe('buildExcluder', () => {
    const base = {
        includeConfigDir: false,
        configDir: '.obsidian',
        userExcludes: [],
        pluginDir: '.obsidian/plugins/zenith',
        localRoot: '',
    };

    it("never carries Zenith's own sync state, whatever the config setting says", () => {
        // Two writers on one file is the exact bug this module exists to fix;
        // letting the file engine carry these would reintroduce it a level down.
        for (const includeConfigDir of [false, true]) {
            const ex = buildExcluder({ ...base, includeConfigDir });
            expect(ex('.obsidian/plugins/zenith/sync/outbox/devA.json')).toBe(true);
            expect(ex('.obsidian/plugins/zenith/sync')).toBe(true);
            expect(ex('.obsidian/plugins/zenith/data.json')).toBe(true);
            // Fetched per device (the prayer year tables) and fetched again anywhere.
            expect(ex('.obsidian/plugins/zenith/cache/prayer/aladhan-2026.json')).toBe(true);
        }
    });

    it('skips the config folder by default', () => {
        const ex = buildExcluder(base);
        expect(ex('.obsidian/workspace.json')).toBe(true);
        expect(ex('.obsidian/themes/x.css')).toBe(true);
    });

    it('knows the config folder by the name the vault gives it', () => {
        const ex = buildExcluder({ ...base, configDir: '.config', pluginDir: '.config/plugins/zenith' });
        expect(ex('.config/workspace.json')).toBe(true);
        expect(ex('.obsidian/workspace.json')).toBe(false);
    });

    it('lets the config folder through when asked, minus our own files', () => {
        const ex = buildExcluder({ ...base, includeConfigDir: true });
        expect(ex('.obsidian/workspace.json')).toBe(false);
        expect(ex('.obsidian/plugins/zenith/main.js')).toBe(false);
        expect(ex('.obsidian/plugins/zenith/data.json')).toBe(true);
    });

    it('honours user prefixes', () => {
        const ex = buildExcluder({ ...base, userExcludes: ['Archive', '/temp/'] });
        expect(ex('Archive/old.md')).toBe(true);
        expect(ex('Archive')).toBe(true);
        expect(ex('temp/scratch.md')).toBe(true);
        expect(ex('Notes/keep.md')).toBe(false);
    });

    it('is not fooled by a sibling folder with a matching prefix', () => {
        const ex = buildExcluder({ ...base, userExcludes: ['Archive'] });
        expect(ex('Archive-2024/old.md')).toBe(false);
    });

    it('leaves ordinary notes alone', () => {
        const ex = buildExcluder(base);
        expect(ex('10 Tasks/inbox.md')).toBe(false);
        expect(ex('attachments/photo.png')).toBe(false);
    });

    it('resolves our own paths relative to a narrowed sync root', () => {
        // Syncing only `Notes` puts the plugin folder outside the root entirely,
        // so nothing there can be reached in the first place.
        const ex = buildExcluder({ ...base, localRoot: 'Notes' });
        expect(ex('a.md')).toBe(false);
    });

    it('refuses a path that climbs past the rules or out of the vault', () => {
        // Each of these could come back from a server — a WebDAV href decodes
        // to whatever it likes, an S3 key is any string — and none of them
        // starts with a prefix the rules above know.
        const ex = buildExcluder({ ...base, includeConfigDir: true });
        for (const key of [
            'a/../.obsidian/plugins/evil/main.js',
            '../outside.md',
            'Notes/../../outside.md',
            '/etc/passwd',
            'a\\..\\..\\outside.md',
            './a.md',
            'a//b.md',
            'a/',
            'C:/Windows/evil.dll',
            'line\nbreak.md',
            'nul\u0000.md',
        ]) {
            expect(ex(key), key).toBe(true);
        }
    });

    it('leaves names that only look unusual alone', () => {
        const ex = buildExcluder(base);
        for (const key of ['..notes.md', 'Notes/v1.2/a.md', 'A: a list.md', 'Ёлка/запись.md']) {
            expect(ex(key), key).toBe(false);
        }
    });

    it('is not walked around by spelling a folder in another case', () => {
        // Windows, macOS and Dropbox all take `.OBSIDIAN` for `.obsidian`.
        const ex = buildExcluder(base);
        expect(ex('.OBSIDIAN/plugins/evil/main.js')).toBe(true);
        expect(ex('.Obsidian/workspace.json')).toBe(true);

        const open = buildExcluder({ ...base, includeConfigDir: true });
        expect(open('.obsidian/plugins/ZENITH/data.json')).toBe(true);
        expect(open('.Obsidian/Plugins/Zenith/sync/prev/devA/r.json')).toBe(true);

        const user = buildExcluder({ ...base, userExcludes: ['Archive'] });
        expect(user('archive/old.md')).toBe(true);
    });

    it('never carries a repository, the trash, or what other tools leave behind', () => {
        for (const includeConfigDir of [false, true]) {
            const ex = buildExcluder({ ...base, includeConfigDir });
            for (const key of [
                '.git/config',
                '.git/objects/ab/cdef',
                'Projects/site/.git/HEAD',
                '.trash/old note.md',
                '.stfolder',
                '.stversions/a~20260101.md',
                'Photos/.DS_Store',
                'Photos/Thumbs.db',
                'desktop.ini',
            ]) {
                expect(ex(key), key).toBe(true);
            }
            // Only those exact names: a file that merely mentions one goes.
            expect(ex('.gitignore')).toBe(false);
            expect(ex('Notes/git.md')).toBe(false);
            expect(ex('trash.md')).toBe(false);
        }
    });
});

describe('isSafeKey', () => {
    it('accepts ordinary nested paths', () => {
        expect(isSafeKey('a.md')).toBe(true);
        expect(isSafeKey('10 Tasks/Inbox.md')).toBe(true);
        expect(isSafeKey('.obsidian/workspace.json')).toBe(true);
    });

    it('refuses anything that could move a path elsewhere', () => {
        for (const key of ['', '..', '.', 'a/..', 'a/./b', '/a', 'a\\b', 'D:', 'a\u0007b']) {
            expect(isSafeKey(key), JSON.stringify(key)).toBe(false);
        }
    });
});

// ── Carrying settings sync ───────────────────────────

describe('what the server holds after a run', () => {
    it('adds what was written, what was left, and what is outside the scope', async () => {
        const remoteState: FakeRemoteState = {
            objects: {
                'b.md': { data: 'world!!', mtimeSvr: 1 },
                '.obsidian/workspace.json': { data: '{}', mtimeSvr: 1 },
            },
            calls: [],
        };
        const { engine } = makeEngine({ 'a.md': { data: 'hello', mtime: 1 } }, remoteState);

        const result = await engine.apply(await engine.plan(), { force: true });
        const onServer = Object.values(remoteState.objects).reduce((n, o) => n + o.data.length, 0);
        expect(result.remoteBytes).toBe(onServer);
        expect(result.remoteBytes).toBe(5 + 7 + 2);
    });

    it('counts a carried-out file by its record, a deleted one as nothing, the rest as listed', () => {
        const entity = (key: string, size: number) => ({ key, size, mtimeCli: 1 });
        const items = [
            {
                key: 'pushed',
                decision: 'local_is_modified_then_push',
                local: entity('pushed', 9),
                remote: entity('pushed', 4),
            },
            {
                key: 'deleted',
                decision: 'local_is_deleted_thus_also_delete_remote',
                remote: entity('deleted', 50),
            },
            {
                key: 'failed',
                decision: 'local_is_modified_then_push',
                local: entity('failed', 30),
                remote: entity('failed', 3),
            },
            { key: 'same', decision: 'equal', local: entity('same', 6), remote: entity('same', 6) },
        ] as Parameters<typeof remoteBytesAfter>[0];
        const settled = new Map([
            ['pushed', { key: 'pushed', local: { size: 9, mtime: 1 }, remote: { size: 9, mtime: 2 } }],
            ['deleted', null],
        ]);
        expect(remoteBytesAfter(items, settled)).toBe(9 + 0 + 3 + 6);
    });
});

describe('carrying settings sync', () => {
    const base = {
        includeConfigDir: false,
        configDir: '.obsidian',
        userExcludes: [] as string[],
        pluginDir: '.obsidian/plugins/zenith',
        localRoot: '',
        carrySettings: true,
    };

    it('lets outboxes and history through while settings sync is on, config folder or not', () => {
        const ex = buildExcluder(base);
        expect(ex('.obsidian/plugins/zenith/sync/outbox/devA.json')).toBe(false);
        expect(ex('.obsidian/plugins/zenith/sync/outbox/devB.json')).toBe(false);
        expect(ex('.obsidian/plugins/zenith/sync/journal/devB.jsonl')).toBe(false);
        // The config folder itself is still left alone.
        expect(ex('.obsidian/workspace.json')).toBe(true);
    });

    it('keeps the rest of the sync folder home: bases, the layout with its tokens, file records', () => {
        const ex = buildExcluder(base);
        expect(ex('.obsidian/plugins/zenith/sync/base/devA/devB.json')).toBe(true);
        expect(ex('.obsidian/plugins/zenith/sync/local/devA.json')).toBe(true);
        expect(ex('.obsidian/plugins/zenith/sync/prev/devA/remote-1.json')).toBe(true);
        expect(ex('.obsidian/plugins/zenith/sync/outbox-old/devA.json')).toBe(true);
        expect(ex('.obsidian/plugins/zenith/data.json')).toBe(true);
    });

    it('still honours what the user excluded', () => {
        const ex = buildExcluder({ ...base, userExcludes: ['.obsidian'] });
        expect(ex('.obsidian/plugins/zenith/sync/outbox/devA.json')).toBe(true);
    });

    it('carries nothing when settings sync is off', () => {
        const ex = buildExcluder({ ...base, carrySettings: false });
        expect(ex('.obsidian/plugins/zenith/sync/outbox/devA.json')).toBe(true);
    });

    it('carries only the spelling settings sync writes, not a variant of it', () => {
        // The exception is for our own outboxes. A differently cased copy is not
        // one, and it lands on the rule for our own state instead.
        const ex = buildExcluder(base);
        expect(ex('.OBSIDIAN/plugins/zenith/sync/outbox/devB.json')).toBe(true);
        expect(ex('.obsidian/plugins/zenith/sync/outbox/../local/devA.json')).toBe(true);
    });

    it('knows each file by the device that writes it', () => {
        const owner = settingsOwner({ ...base, deviceId: 'devA' });
        expect(owner('.obsidian/plugins/zenith/sync/outbox/devA.json')).toBe('local');
        expect(owner('.obsidian/plugins/zenith/sync/journal/devA.jsonl')).toBe('local');
        expect(owner('.obsidian/plugins/zenith/sync/outbox/devB.json')).toBe('remote');
        expect(owner('.obsidian/plugins/zenith/sync/journal/devB.jsonl')).toBe('remote');
        expect(owner('.obsidian/plugins/zenith/sync/outbox/devB.jsonl')).toBe(null);
        expect(owner('notes/devA.json')).toBe(null);
        expect(settingsOwner({ ...base, carrySettings: false, deviceId: 'devA' })(
            '.obsidian/plugins/zenith/sync/outbox/devB.json'
        )).toBe(null);
    });

    it("sends this device's outbox, takes the others', and says settings arrived", async () => {
        // Both sides hold both files and nothing is on record: a vault copied
        // by hand. Each file has one writer, so neither is a conflict.
        const files: Record<string, FakeFile> = {
            '.obsidian/plugins/zenith/sync/outbox/devA.json': { data: '{"mine":2}', mtime: 5000 },
            '.obsidian/plugins/zenith/sync/outbox/devB.json': { data: '{"old":1}', mtime: 9000 },
        };
        const remoteState: FakeRemoteState = {
            objects: {
                '.obsidian/plugins/zenith/sync/outbox/devA.json': { data: '{"mine":1}', mtimeSvr: 9000 },
                '.obsidian/plugins/zenith/sync/outbox/devB.json': { data: '{"new":22}', mtimeSvr: 3000 },
            },
            calls: [],
        };
        const { engine } = makeEngine(files, remoteState, { carrySettings: true });

        const plan = await engine.plan();
        const byKey = Object.fromEntries(plan.items.map((i) => [i.key, i.decision]));
        expect(byKey['.obsidian/plugins/zenith/sync/outbox/devA.json']).toBe(
            'local_is_modified_then_push'
        );
        expect(byKey['.obsidian/plugins/zenith/sync/outbox/devB.json']).toBe(
            'remote_is_modified_then_pull'
        );
        expect(plan.stats.conflict).toBe(0);

        const result = await engine.apply(plan, { force: true });
        expect(result.settingsArrived).toBe(true);
        expect(remoteState.objects['.obsidian/plugins/zenith/sync/outbox/devA.json'].data).toBe(
            '{"mine":2}'
        );
        expect(files['.obsidian/plugins/zenith/sync/outbox/devB.json'].data).toBe('{"new":22}');
    });

    it('does not report settings arriving when only notes came down', async () => {
        const { engine } = makeEngine(
            {},
            { objects: { 'b.md': { data: 'x', mtimeSvr: 1 } }, calls: [] },
            { carrySettings: true }
        );
        const result = await engine.apply(await engine.plan(), { force: true });
        expect(result.applied).toBe(1);
        expect(result.settingsArrived).toBe(false);
    });
});

// ── Planning ─────────────────────────────────────────

describe('plan', () => {
    it('sees local files and remote objects as two sides of one path', async () => {
        const { engine } = makeEngine(
            { 'a.md': { data: 'hello', mtime: 1000 } },
            { objects: { 'b.md': { data: 'world', mtimeSvr: 2000 } }, calls: [] }
        );

        const plan = await engine.plan();
        const byKey = Object.fromEntries(plan.items.map((i) => [i.key, i.decision]));

        expect(byKey['a.md']).toBe('local_is_created_then_push');
        expect(byKey['b.md']).toBe('remote_is_created_then_pull');
    });

    it('never offers to upload the plugin own state', async () => {
        // Caught while walking the disk, so these never even enter the plan.
        const { engine } = makeEngine(
            {
                'a.md': { data: 'x', mtime: 1 },
                '.obsidian/plugins/zenith/data.json': { data: '{}', mtime: 1 },
                '.obsidian/plugins/zenith/sync/outbox/devA.json': { data: '{}', mtime: 1 },
            },
            { objects: {}, calls: [] }
        );

        const plan = await engine.plan();
        expect(plan.items.map((i) => i.key)).toEqual(['a.md']);
    });

    it('refuses to pull the plugin own state back down from a remote that has it', async () => {
        // The second layer of the same rule, and the one that matters after a
        // config change: an older setup may have pushed these already, and
        // pulling them would let the file engine fight the settings layer over
        // the same file — the exact bug this module exists to fix.
        const { engine } = makeEngine(
            { 'a.md': { data: 'x', mtime: 1 } },
            {
                objects: {
                    '.obsidian/plugins/zenith/data.json': { data: '{}', mtimeSvr: 9 },
                    '.obsidian/plugins/zenith/sync/outbox/devB.json': { data: '{}', mtimeSvr: 9 },
                    '.obsidian/workspace.json': { data: '{}', mtimeSvr: 9 },
                },
                calls: [],
            }
        );

        const plan = await engine.plan();
        const excluded = plan.items
            .filter((i) => i.decision === 'skipped_excluded')
            .map((i) => i.key)
            .sort();

        expect(excluded).toEqual([
            '.obsidian/plugins/zenith/data.json',
            '.obsidian/plugins/zenith/sync/outbox/devB.json',
            '.obsidian/workspace.json',
        ]);
        expect(plan.stats.pull).toBe(0);
    });

    it('never writes a path a server tried to steer outside the rules', async () => {
        // What a hostile or broken WebDAV server can hand back: a key that
        // decodes to a climb into the plugins folder.
        const files: Record<string, FakeFile> = {};
        const { engine } = makeEngine(files, {
            objects: {
                'a/../.obsidian/plugins/evil/main.js': { data: 'alert(1)', mtimeSvr: 9 },
                '../outside.md': { data: 'x', mtimeSvr: 9 },
                'ok.md': { data: 'fine', mtimeSvr: 9 },
            },
            calls: [],
        });

        const plan = await engine.plan();
        const byKey = Object.fromEntries(plan.items.map((i) => [i.key, i.decision]));
        expect(byKey['a/../.obsidian/plugins/evil/main.js']).toBe('skipped_excluded');
        expect(byKey['../outside.md']).toBe('skipped_excluded');

        await engine.apply(plan, { force: true });
        expect(Object.keys(files).filter((k) => !k.includes('/sync/prev/'))).toEqual(['ok.md']);
    });

    it('sets aside a file whose name the server cannot store, and names why', async () => {
        const files: Record<string, FakeFile> = {
            'short.md': { data: 'x', mtime: 1 },
            'a very long title.md': { data: 'y', mtime: 1 },
        };
        const fs = fakeFs(files);
        const remote: SyncRemote = {
            ...fakeRemote({ objects: {}, calls: [] }),
            keyFits: (key) => !key.includes('long'),
        };
        const engine = new SyncEngine(fs, remote, new PrevSyncStore(fs, paths), 'devA', ENGINE_OPTS);

        const plan = await engine.plan();
        const byKey = Object.fromEntries(plan.items.map((i) => [i.key, i.decision]));
        expect(byKey['short.md']).toBe('local_is_created_then_push');
        expect(byKey['a very long title.md']).toBe('skipped_name_too_long');
        expect(plan.stats.skipped).toBe(1);

        await engine.apply(plan, { force: true });
        expect(files['a very long title.md']).toBeDefined();
    });

    it('flags the very first run for review', async () => {
        const { engine } = makeEngine({ 'a.md': { data: 'x', mtime: 1 } }, { objects: {}, calls: [] });
        const plan = await engine.plan();
        expect(plan.blocked).toMatchObject({ kind: 'first_run_requires_review' });
    });
});

// ── Applying ─────────────────────────────────────────

describe('apply', () => {
    it('refuses a blocked plan and touches nothing', async () => {
        const remoteState: FakeRemoteState = { objects: {}, calls: [] };
        const { engine } = makeEngine({ 'a.md': { data: 'x', mtime: 1 } }, remoteState);

        const plan = await engine.plan();
        const result = await engine.apply(plan);

        expect(result.refused).toBe(true);
        expect(result.applied).toBe(0);
        expect(remoteState.calls).toEqual([]);
    });

    it('carries out a blocked plan when the user overrides it', async () => {
        const remoteState: FakeRemoteState = { objects: {}, calls: [] };
        const { engine } = makeEngine({ 'a.md': { data: 'x', mtime: 1 } }, remoteState);

        const result = await engine.apply(await engine.plan(), { force: true });

        expect(result.refused).toBe(false);
        expect(result.applied).toBe(1);
        expect(remoteState.objects['a.md'].data).toBe('x');
    });

    it('pulls a remote file down to disk', async () => {
        const files: Record<string, FakeFile> = {};
        const { engine } = makeEngine(files, {
            objects: { 'notes/b.md': { data: 'remote text', mtimeSvr: 2000 } },
            calls: [],
        });

        await engine.apply(await engine.plan(), { force: true });
        expect(files['notes/b.md'].data).toBe('remote text');
    });

    it('reports progress for every item it works through', async () => {
        const { engine } = makeEngine(
            { 'a.md': { data: 'x', mtime: 1 }, 'b.md': { data: 'y', mtime: 1 } },
            { objects: {}, calls: [] }
        );

        const seen: number[] = [];
        await engine.apply(await engine.plan(), {
            force: true,
            onProgress: (p) => seen.push(p.done),
        });

        expect(seen).toEqual([1, 2]);
    });

    it('keeps going past a failure and reports it', async () => {
        const remoteState: FakeRemoteState = { objects: {}, calls: [], failOn: 'b.md' };
        const { engine } = makeEngine(
            { 'a.md': { data: 'x', mtime: 1 }, 'b.md': { data: 'y', mtime: 1 } },
            remoteState
        );

        const result = await engine.apply(await engine.plan(), { force: true });

        expect(result.applied).toBe(1);
        expect(result.failed).toEqual([{ key: 'b.md', error: 'server said no' }]);
        expect(remoteState.objects['a.md']).toBeDefined();
    });

    it('leaves a failed path unsettled so the next run retries it', async () => {
        const remoteState: FakeRemoteState = { objects: {}, calls: [], failOn: 'b.md' };
        const files: Record<string, FakeFile> = {
            'a.md': { data: 'x', mtime: 1 },
            'b.md': { data: 'y', mtime: 1 },
        };
        const { engine } = makeEngine(files, remoteState);

        await engine.apply(await engine.plan(), { force: true });

        // Second run: `a.md` is settled, `b.md` is still waiting to go up.
        remoteState.failOn = undefined;
        const second = await engine.plan();
        const byKey = Object.fromEntries(second.items.map((i) => [i.key, i.decision]));

        expect(byKey['a.md']).toBe('equal');
        expect(byKey['b.md']).toBe('local_is_created_then_push');
    });
});

// ── A plan carried out after the vault moved on ──────

describe('a plan that went stale before it was applied', () => {
    /** One note, already synced once, so both sides have a previous record. */
    async function synced(text = 'v1') {
        const files: Record<string, FakeFile> = { 'a.md': { data: text, mtime: 1_000 } };
        const remoteState: FakeRemoteState = { objects: {}, calls: [] };
        const made = makeEngine(files, remoteState);
        await made.engine.apply(await made.engine.plan(), { force: true });
        remoteState.calls = [];
        return { ...made, files, remoteState };
    }

    it('does not pull over a note edited after the plan was made', async () => {
        const { engine, files, remoteState } = await synced();
        remoteState.objects['a.md'] = { data: 'v2 from the phone', mtimeSvr: 900_000 };

        const plan = await engine.plan();
        expect(plan.items[0].decision).toBe('remote_is_modified_then_pull');

        // Typed into between the preview and Apply.
        files['a.md'] = { data: 'v1, and a thought', mtime: 2_000 };
        const result = await engine.apply(plan, { force: true });

        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].error).toMatch(/since the plan was made/);
        expect(files['a.md'].data).toBe('v1, and a thought');

        // Next time round both sides have moved, which is a conflict to settle,
        // not a download to make.
        const next = await engine.plan();
        expect(next.items[0].decision).toMatch(/^conflict_/);
    });

    it('does not pull over a note created after the plan was made', async () => {
        const files: Record<string, FakeFile> = {};
        const { engine } = makeEngine(files, {
            objects: { 'b.md': { data: 'from the server', mtimeSvr: 9 } },
            calls: [],
        });

        const plan = await engine.plan();
        files['b.md'] = { data: 'written here meanwhile', mtime: 5 };
        const result = await engine.apply(plan, { force: true });

        expect(result.failed.map((f) => f.key)).toEqual(['b.md']);
        expect(files['b.md'].data).toBe('written here meanwhile');
    });

    it('moves a note deleted on another device to the trash rather than out of existence', async () => {
        const { engine, files, remoteState, trash } = await synced();
        delete remoteState.objects['a.md'];

        const plan = await engine.plan();
        expect(plan.items[0].decision).toBe('remote_is_deleted_thus_also_delete_local');
        await engine.apply(plan, { force: true });

        expect(files['a.md']).toBeUndefined();
        expect(trash).toEqual(['a.md']);
    });

    it('does not delete a note edited after the plan was made', async () => {
        const { engine, files, remoteState, trash } = await synced();
        delete remoteState.objects['a.md'];

        const plan = await engine.plan();
        files['a.md'] = { data: 'still wanted', mtime: 2_000 };
        const result = await engine.apply(plan, { force: true });

        expect(result.failed.map((f) => f.key)).toEqual(['a.md']);
        expect(files['a.md'].data).toBe('still wanted');
        expect(trash).toEqual([]);
    });

    it('does not delete a newer version another device uploaded after the plan', async () => {
        const { engine, files, remoteState } = await synced();
        delete files['a.md'];

        const plan = await engine.plan();
        expect(plan.items[0].decision).toBe('local_is_deleted_thus_also_delete_remote');

        remoteState.objects['a.md'] = { data: 'rewritten on the laptop', mtimeSvr: 950_000 };
        const result = await engine.apply(plan, { force: true });

        expect(result.failed.map((f) => f.key)).toEqual(['a.md']);
        expect(remoteState.objects['a.md'].data).toBe('rewritten on the laptop');
        expect(remoteState.calls.filter((c) => c.startsWith('remove:'))).toEqual([]);
    });

    it('still deletes on the server when nothing moved', async () => {
        const { engine, files, remoteState } = await synced();
        delete files['a.md'];

        const result = await engine.apply(await engine.plan(), { force: true });

        expect(result.failed).toEqual([]);
        expect(remoteState.objects['a.md']).toBeUndefined();
    });
});

// ── The round trip that matters ──────────────────────

describe('a second run against a server that stamps its own clock', () => {
    it('settles to "equal" instead of re-uploading forever', async () => {
        // The fake remote deliberately rewrites mtime on upload. Without the
        // two-sided previous-sync record this run would push the file again, and
        // again, on every sync, forever.
        const files: Record<string, FakeFile> = { 'a.md': { data: 'x', mtime: 1000 } };
        const { engine } = makeEngine(files, { objects: {}, calls: [] });

        await engine.apply(await engine.plan(), { force: true });
        const second = await engine.plan();

        expect(second.items.map((i) => i.decision)).toEqual(['equal']);
        expect(second.actionable).toBe(0);
        expect(second.blocked).toBeNull();
    });

    it('then propagates a genuine deletion', async () => {
        const files: Record<string, FakeFile> = { 'a.md': { data: 'x', mtime: 1000 } };
        const remoteState: FakeRemoteState = { objects: {}, calls: [] };
        const { engine } = makeEngine(files, remoteState);

        await engine.apply(await engine.plan(), { force: true });

        // The user deletes it locally. Now there IS a previous record, so this
        // reads as a deletion rather than as an unknown remote file.
        delete files['a.md'];
        const plan = await engine.plan();
        expect(plan.items.map((i) => i.decision)).toEqual([
            'local_is_deleted_thus_also_delete_remote',
        ]);

        await engine.apply(plan, { force: true });
        expect(remoteState.objects['a.md']).toBeUndefined();

        // And the path is forgotten, so it does not come back next run.
        const third = await engine.plan();
        expect(third.actionable).toBe(0);
    });
});

// ── Semantic merge, end to end ───────────────────────

describe('smart conflicts', () => {
    /** Both sides hold a version of `day.md`, and both have moved since prev. */
    const divergent = (localText: string, remoteText: string) => {
        const files: Record<string, FakeFile> = { 'day.md': { data: localText, mtime: 5_000 } };
        const remoteState: FakeRemoteState = {
            objects: { 'day.md': { data: remoteText, mtimeSvr: 9_000 } },
            calls: [],
        };
        const { engine, fs, prevStore } = makeEngine(files, remoteState, {
            conflictAction: 'smart',
        });
        return { engine, fs, files, remoteState, prevStore };
    };

    /** Seed a prev record so both sides read as modified rather than as new. */
    async function seedPrev(prevStore: PrevSyncStore) {
        await prevStore.write('devA', 'remote-1', [
            {
                key: 'day.md',
                local: { size: 1, mtime: 1 },
                remote: { size: 1, mtime: 1 },
            },
        ]);
    }

    it('reconciles two trackers logged on two devices', async () => {
        const { engine, files, remoteState, prevStore } = divergent(
            '---\nmood: 4\n---\n\n- [x] Walk\n',
            '---\nfajr: ontime\n---\n\n- [ ] Walk\n- [ ] Call the bank\n'
        );
        await seedPrev(prevStore);

        const plan = await engine.plan();
        expect(plan.items[0].decision).toBe('conflict_created_then_smart_merge');

        const result = await engine.apply(plan, { force: true });

        expect(result.merges).toHaveLength(1);
        expect(result.merges[0].outcome).toBe('merged');

        const merged = files['day.md'].data;
        expect(merged).toContain('mood: 4');
        expect(merged).toContain('fajr: ontime');
        // The completed walk stayed completed, and the phone's task came across.
        expect(merged).toContain('- [x] Walk');
        expect(merged).toContain('- [ ] Call the bank');
        // And the server now holds the same reconciled note.
        expect(remoteState.objects['day.md'].data).toBe(merged);
    });

    it('keeps both copies when the prose genuinely diverged', async () => {
        const { engine, files, prevStore } = divergent(
            '# Day\n\nI went to the market.\n',
            '# Day\n\nI stayed in and read.\n'
        );
        await seedPrev(prevStore);

        const result = await engine.apply(await engine.plan(), { force: true });

        expect(result.merges[0]).toMatchObject({
            outcome: 'kept_both',
            reason: 'prose_diverged',
        });
        // The local writing is untouched, and the other version landed beside it.
        expect(files['day.md'].data).toContain('I went to the market.');
        const copy = Object.keys(files).find((k) => k.includes('.conflict-'));
        expect(copy).toBeDefined();
        expect(files[copy as string].data).toContain('I stayed in and read.');
    });

    it('keeps what was typed while the server copy was still downloading', async () => {
        const files: Record<string, FakeFile> = {
            'day.md': { data: '---\nmood: 4\n---\n\n- [x] Walk\n', mtime: 5_000 },
        };
        const remoteState: FakeRemoteState = {
            objects: { 'day.md': { data: '---\nfajr: ontime\n---\n\n- [ ] Walk\n', mtimeSvr: 9_000 } },
            calls: [],
        };
        const fs = fakeFs(files);
        const prevStore = new PrevSyncStore(fs, paths);
        await seedPrev(prevStore);

        const remote = fakeRemote(remoteState);
        const slow: SyncRemote = {
            ...remote,
            // The download is the slow part of a merge; the user keeps writing.
            readBinary: async (key) => {
                files['day.md'] = {
                    data: '---\nmood: 4\n---\n\n- [x] Walk\n- [ ] Typed during the download\n',
                    mtime: 6_000,
                };
                return remote.readBinary(key);
            },
        };
        const engine = new SyncEngine(fs, slow, prevStore, 'devA', {
            ...ENGINE_OPTS,
            conflictAction: 'smart',
        });

        const result = await engine.apply(await engine.plan(), { force: true });

        expect(result.merges[0]?.outcome).toBe('merged');
        expect(files['day.md'].data).toContain('Typed during the download');
        expect(files['day.md'].data).toContain('fajr: ontime');
    });

    it('settles to equal on the next run, so a merge does not repeat forever', async () => {
        const { engine, prevStore } = divergent(
            '---\nmood: 4\n---\n\n- [x] Walk\n',
            '---\nfajr: ontime\n---\n\n- [ ] Walk\n'
        );
        await seedPrev(prevStore);

        await engine.apply(await engine.plan(), { force: true });
        const second = await engine.plan();

        expect(second.actionable).toBe(0);
    });
});
