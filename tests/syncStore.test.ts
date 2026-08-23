import { describe, it, expect } from 'vitest';
import type { ModuleFs } from '../src/core/moduleFs';
import { SyncStore } from '../src/modules/sync/services/syncStore';
import { isSafeDeviceId, type DeviceDoc, type SyncPaths } from '../src/modules/sync/syncTypes';

/** A flat in-memory vault: path → contents. */
function fakeFs(files: Record<string, string>): ModuleFs {
    const under = (path: string) =>
        Object.keys(files).filter((f) => f === path || f.startsWith(`${path}/`));
    const names = (path: string) => {
        const prefix = `${path}/`;
        const direct = new Set<string>();
        for (const key of Object.keys(files)) {
            if (!key.startsWith(prefix)) continue;
            direct.add(key.slice(prefix.length).split('/')[0]);
        }
        return [...direct];
    };

    return {
        exists: async (path) => Object.hasOwn(files, path) || under(path).length > 0,
        read: async (path) => {
            if (!Object.hasOwn(files, path)) throw new Error(`missing ${path}`);
            return files[path];
        },
        write: async (path, data) => {
            files[path] = data;
        },
        listFolders: async (path) => names(path).filter((n) => !Object.hasOwn(files, `${path}/${n}`)),
        listFiles: async (path) => names(path).filter((n) => Object.hasOwn(files, `${path}/${n}`)),
        mkdirp: async () => undefined,
        removeDir: async () => undefined,
        removeFile: async (path) => {
            delete files[path];
        },
        stat: async (path) =>
            Object.hasOwn(files, path)
                ? { type: 'file' as const, ctime: 0, mtime: 0, size: files[path].length }
                : null,
        readBinary: async () => new ArrayBuffer(0),
        writeBinary: async () => undefined,
        walk: async (path) => under(path),
    };
}

const paths: SyncPaths = {
    root: 'sync',
    outboxDir: 'sync/outbox',
    outbox: (id) => `sync/outbox/${id}.json`,
    baseDir: (self) => `sync/base/${self}`,
    base: (self, peer) => `sync/base/${self}/${peer}.json`,
    local: (id) => `sync/local/${id}.json`,
    journal: (id) => `sync/journal/${id}.jsonl`,
};

function doc(id: string, values: Record<string, unknown>): DeviceDoc {
    return {
        version: 1,
        values: values as DeviceDoc['values'],
        stamps: Object.fromEntries(Object.keys(values).map((k) => [k, '00000000006f-0000-a'])),
        device: {
            id,
            name: `Device ${id}`,
            platform: 'desktop',
            pluginVersion: '0.1.0',
            lastSeenAt: 111,
        },
    };
}

describe('isSafeDeviceId', () => {
    it('rejects anything that could escape the sync folder', () => {
        // A device id becomes a filename, and peer documents arrive from other
        // machines through a sync tool.
        for (const bad of ['../../data', 'a/b', '', '.', 'has space', null, 42, 'x'.repeat(65)]) {
            expect(isSafeDeviceId(bad)).toBe(false);
        }
    });

    it('accepts ordinary generated ids', () => {
        expect(isSafeDeviceId('d3f9a1b2c4d5e6f7')).toBe(true);
        expect(isSafeDeviceId('desktop-1')).toBe(true);
    });
});

describe('readPeers', () => {
    it('returns every device but our own', async () => {
        const files: Record<string, string> = {
            'sync/outbox/aaa.json': JSON.stringify(doc('aaa', { weatherUnit: 'c' })),
            'sync/outbox/bbb.json': JSON.stringify(doc('bbb', { weatherUnit: 'f' })),
        };
        const store = new SyncStore(fakeFs(files), paths);

        const peers = await store.readPeers('aaa');
        expect(peers.map((p) => p.device.id)).toEqual(['bbb']);
    });

    it('skips a document whose id does not match its filename', async () => {
        // A copied vault, or a corrupt write. Either way we cannot tell which
        // device it really came from, so it is not a peer.
        const files: Record<string, string> = {
            'sync/outbox/bbb.json': JSON.stringify(doc('ccc', { weatherUnit: 'f' })),
        };
        const store = new SyncStore(fakeFs(files), paths);
        expect(await store.readPeers('aaa')).toEqual([]);
    });

    it('survives a half-written file mid-sync', async () => {
        const files: Record<string, string> = {
            'sync/outbox/bbb.json': '{"version":1,"values":{"weatherUnit":"f"',
            'sync/outbox/ccc.json': JSON.stringify(doc('ccc', { language: 'ru' })),
        };
        const store = new SyncStore(fakeFs(files), paths);

        const peers = await store.readPeers('aaa');
        // The good peer still comes through; the truncated one is simply silent.
        expect(peers.map((p) => p.device.id)).toEqual(['ccc']);
    });

    it('ignores a document with no usable device block', async () => {
        const files: Record<string, string> = {
            'sync/outbox/bbb.json': JSON.stringify({ version: 1, values: {}, stamps: {} }),
        };
        const store = new SyncStore(fakeFs(files), paths);
        expect(await store.readPeers('aaa')).toEqual([]);
    });

    it('drops stamps that are not strings rather than the whole document', async () => {
        const files: Record<string, string> = {
            'sync/outbox/bbb.json': JSON.stringify({
                version: 1,
                values: { weatherUnit: 'f', language: 'ru' },
                stamps: { weatherUnit: '00000000006f-0000-b', language: 42 },
                device: { id: 'bbb', name: 'B', platform: 'ios', pluginVersion: '1', lastSeenAt: 1 },
            }),
        };
        const store = new SyncStore(fakeFs(files), paths);

        const peers = await store.readPeers('aaa');
        expect(peers).toHaveLength(1);
        expect(peers[0].stamps).toEqual({ weatherUnit: '00000000006f-0000-b' });
        // The unstamped key still travels; it just cannot win a contest.
        expect(peers[0].values.language).toBe('ru');
    });

    it('falls back to a safe platform for an unrecognised one', async () => {
        const files: Record<string, string> = {
            'sync/outbox/bbb.json': JSON.stringify({
                version: 1,
                values: {},
                stamps: {},
                device: { id: 'bbb', name: 'B', platform: 'toaster', pluginVersion: '', lastSeenAt: 0 },
            }),
        };
        const store = new SyncStore(fakeFs(files), paths);
        expect((await store.readPeers('aaa'))[0].device.platform).toBe('unknown');
    });
});

describe('round trips', () => {
    it('writes and reads back an outbox', async () => {
        const files: Record<string, string> = {};
        const store = new SyncStore(fakeFs(files), paths);

        await store.writeOutbox(doc('aaa', { weatherUnit: 'f' }));
        const back = await store.readOutbox('aaa');
        expect(back?.values.weatherUnit).toBe('f');
        expect(back?.device.name).toBe('Device aaa');
    });

    it('writes and reads back a peer base', async () => {
        const files: Record<string, string> = {};
        const store = new SyncStore(fakeFs(files), paths);

        await store.writeBase('aaa', 'bbb', {
            version: 1,
            values: { language: 'ru' },
            stamps: { language: '00000000006f-0000-b' },
        });
        const back = await store.readBase('aaa', 'bbb');
        expect(back?.values.language).toBe('ru');
    });

    it('returns null for a base that has never been written', async () => {
        const store = new SyncStore(fakeFs({}), paths);
        expect(await store.readBase('aaa', 'bbb')).toBeNull();
    });

    it('keeps this device settings snapshot separate from the outbox', async () => {
        const files: Record<string, string> = {};
        const store = new SyncStore(fakeFs(files), paths);

        await store.writeLocal('aaa', { uiDensity: 'compact' });
        expect(await store.readLocal('aaa')).toEqual({ uiDensity: 'compact' });
        // It must not be visible to peers — that is the whole point of scoping
        // those keys to the device.
        expect(Object.keys(files)).toEqual(['sync/local/aaa.json']);
    });
});

describe('journal', () => {
    it('appends one line per event and reads them back newest first', async () => {
        const files: Record<string, string> = {};
        const store = new SyncStore(fakeFs(files), paths);

        await store.appendJournal('aaa', {
            at: '000000000001-0000-a',
            wall: 1,
            deviceId: 'aaa',
            kind: 'publish',
            keys: ['language'],
        });
        await store.appendJournal('aaa', {
            at: '000000000002-0000-a',
            wall: 2,
            deviceId: 'aaa',
            kind: 'merge',
            keys: ['weatherUnit'],
        });

        const entries = await store.readJournal();
        expect(entries.map((e) => e.kind)).toEqual(['merge', 'publish']);
    });

    it('merges the histories of every device', async () => {
        const files: Record<string, string> = {
            'sync/journal/aaa.jsonl': `${JSON.stringify({ at: '000000000001-0000-a', wall: 1, deviceId: 'aaa', kind: 'publish', keys: [] })}\n`,
            'sync/journal/bbb.jsonl': `${JSON.stringify({ at: '000000000003-0000-b', wall: 3, deviceId: 'bbb', kind: 'publish', keys: [] })}\n`,
        };
        const store = new SyncStore(fakeFs(files), paths);

        expect((await store.readJournal()).map((e) => e.deviceId)).toEqual(['bbb', 'aaa']);
    });

    it('loses one damaged line rather than the whole history', async () => {
        const files: Record<string, string> = {
            'sync/journal/aaa.jsonl':
                `{"at":"000000000001-0000-a","wall":1,"deviceId":"aaa","kind":"publish","keys":[]}\n` +
                `{"at":"00000000000 truncated\n` +
                `{"at":"000000000003-0000-a","wall":3,"deviceId":"aaa","kind":"merge","keys":[]}\n`,
        };
        const store = new SyncStore(fakeFs(files), paths);
        expect(await store.readJournal()).toHaveLength(2);
    });

    it('trims to the most recent entries', async () => {
        const files: Record<string, string> = {};
        const store = new SyncStore(fakeFs(files), paths);
        for (let i = 1; i <= 10; i++) {
            await store.appendJournal('aaa', {
                at: `00000000000${i}-0000-a`,
                wall: i,
                deviceId: 'aaa',
                kind: 'publish',
                keys: [],
            });
        }

        await store.trimJournal('aaa', 4);
        expect(files['sync/journal/aaa.jsonl'].trim().split('\n')).toHaveLength(4);
        expect(await store.readJournal()).toHaveLength(4);
    });
});
