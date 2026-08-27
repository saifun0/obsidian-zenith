import { describe, it, expect } from 'vitest';
import type { ModuleFs } from '../src/core/moduleFs';
import { SyncEngine, buildExcluder } from '../src/modules/sync/services/SyncEngine';
import { PrevSyncStore } from '../src/modules/sync/services/prevSyncStore';
import type { SyncRemote } from '../src/modules/sync/services/remotes/types';
import type { FileEntity } from '../src/modules/sync/fileSyncTypes';
import type { SyncPaths } from '../src/modules/sync/syncTypes';

// ── Fakes ────────────────────────────────────────────

interface FakeFile {
    data: string;
    mtime: number;
}

function fakeFs(files: Record<string, FakeFile>): ModuleFs {
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
    userExcludes: [],
    pluginDir: '.obsidian/plugins/zenith',
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
    const fs = fakeFs(files);
    const prevStore = new PrevSyncStore(fs, paths);
    const engine = new SyncEngine(fs, fakeRemote(remoteState), prevStore, 'devA', {
        ...ENGINE_OPTS,
        ...optsPatch,
    });
    return { engine, fs, prevStore };
}

// ── Exclusions ───────────────────────────────────────

describe('buildExcluder', () => {
    const base = {
        includeConfigDir: false,
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
        }
    });

    it('skips the config folder by default', () => {
        const ex = buildExcluder(base);
        expect(ex('.obsidian/workspace.json')).toBe(true);
        expect(ex('.obsidian/themes/x.css')).toBe(true);
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
