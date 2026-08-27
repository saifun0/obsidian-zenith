import { beforeAll, describe, it, expect } from 'vitest';
import { CryptoRemote } from '../src/modules/sync/services/crypto/cryptoRemote';
import { MARKER_KEY } from '../src/modules/sync/services/crypto/vaultCrypto';
import type { FileEntity } from '../src/modules/sync/fileSyncTypes';
import type { SyncRemote } from '../src/modules/sync/services/remotes/types';

/** An in-memory server, so what actually lands on it can be inspected. */
interface Stored {
    data: ArrayBuffer;
    mtimeCli: number;
    mtimeSvr: number;
}

function fakeRemote(objects: Record<string, Stored> = {}): SyncRemote & { objects: typeof objects } {
    const entity = (key: string, o: Stored): FileEntity => ({
        key,
        size: o.data.byteLength,
        mtimeCli: o.mtimeCli,
        mtimeSvr: o.mtimeSvr,
        etag: `rev-${o.mtimeSvr}`,
    });

    return {
        objects,
        kind: 'dropbox',
        id: 'fake-1',
        checkConnection: async () => ({ ok: true }),
        list: async () => Object.entries(objects).map(([key, o]) => entity(key, o)),
        stat: async (key) => (objects[key] ? entity(key, objects[key]) : null),
        readBinary: async (key) => {
            const found = objects[key];
            if (!found) throw new Error(`no such object: ${key}`);
            return found.data;
        },
        write: async (key, data, mtimeCli) => {
            objects[key] = { data, mtimeCli, mtimeSvr: mtimeCli + 1000 };
            return entity(key, objects[key]);
        },
        remove: async (key) => {
            delete objects[key];
        },
    };
}

const PASSWORD = 'correct horse battery staple';
const bytes = (value: string) => new TextEncoder().encode(value).buffer as ArrayBuffer;
const text = (data: ArrayBuffer) => new TextDecoder().decode(data);

describe('setting up a remote', () => {
    it('leaves an empty folder alone until there is something to put in it', async () => {
        // `plan()` promises to write nothing and it calls `list`. A marker left
        // behind by a preview somebody cancelled would lock the folder to a
        // password they had never actually used.
        const inner = fakeRemote();
        await new CryptoRemote(inner, PASSWORD).list();

        expect(Object.keys(inner.objects)).toEqual([]);
    });

    it('claims the folder with the first upload', async () => {
        const inner = fakeRemote();
        await new CryptoRemote(inner, PASSWORD).write('a.md', bytes('hello'), 1000);

        expect(Object.keys(inner.objects)).toContain(MARKER_KEY);
        expect(Object.keys(inner.objects)).toHaveLength(2);
    });

    it('claims it once, however many files arrive at once', async () => {
        const inner = fakeRemote();
        const remote = new CryptoRemote(inner, PASSWORD);
        await Promise.all([
            remote.write('a.md', bytes('one'), 1000),
            remote.write('b.md', bytes('two'), 1000),
            remote.write('c.md', bytes('three'), 1000),
        ]);

        expect(Object.keys(inner.objects)).toHaveLength(4);
    });

    it('refuses to upload anything into a folder it could not claim', async () => {
        // Files whose salt never reached the server are unreadable by everyone,
        // this device included.
        const inner = fakeRemote();
        const real = inner.write;
        inner.write = async (key, data, mtime) => {
            if (key === MARKER_KEY) throw new Error('server said no');
            return real(key, data, mtime);
        };

        const remote = new CryptoRemote(inner, PASSWORD);
        await expect(remote.write('a.md', bytes('hello'), 1000)).rejects.toThrow('server said no');
        expect(Object.keys(inner.objects)).toEqual([]);
    });

    it('says so when the marker is there but unreadable', async () => {
        const inner = fakeRemote({
            [MARKER_KEY]: { data: bytes('{ not json'), mtimeCli: 1, mtimeSvr: 1 },
        });

        await expect(new CryptoRemote(inner, PASSWORD).list()).rejects.toThrow(/damaged/);
    });

    it('refuses a folder that already holds files nobody encrypted', async () => {
        // The alternative is uploading a second, encrypted copy of the vault
        // beside the first and treating the originals as somebody else's.
        const inner = fakeRemote({
            'notes/a.md': { data: bytes('hello'), mtimeCli: 1, mtimeSvr: 2 },
        });

        await expect(new CryptoRemote(inner, PASSWORD).list()).rejects.toThrow(
            /already holds unencrypted files/
        );
    });

    it('refuses the wrong password before it writes anything', async () => {
        const inner = fakeRemote();
        await new CryptoRemote(inner, PASSWORD).write('a.md', bytes('hello'), 1000);
        const before = Object.keys(inner.objects).length;

        const impostor = new CryptoRemote(inner, 'not the password');
        await expect(impostor.list()).rejects.toThrow(/not the password this remote folder/);
        expect(Object.keys(inner.objects)).toHaveLength(before);
    });

    it('reports that as a failed connection rather than as a crash', async () => {
        const inner = fakeRemote();
        await new CryptoRemote(inner, PASSWORD).write('a.md', bytes('hello'), 1000);

        const result = await new CryptoRemote(inner, 'wrong').checkConnection();
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/not the password/);
    });

    it('does not reach for the password when the server is unreachable', async () => {
        const inner = fakeRemote();
        inner.checkConnection = async () => ({ ok: false, error: 'no route to host' });

        expect(await new CryptoRemote(inner, PASSWORD).checkConnection()).toEqual({
            ok: false,
            error: 'no route to host',
        });
    });
});

describe('a remote in use', () => {
    let inner: ReturnType<typeof fakeRemote>;
    let remote: CryptoRemote;

    beforeAll(async () => {
        inner = fakeRemote();
        remote = new CryptoRemote(inner, PASSWORD);
        await remote.write('notes/monday.md', bytes('# Monday'), 1_700_000_000_000);
        await remote.write('notes/tuesday.md', bytes('# Tuesday, longer'), 1_700_000_100_000);
    });

    it('shows the caller its own paths back', async () => {
        const listed = (await remote.list()).map((e) => e.key).sort();
        expect(listed).toEqual(['notes/monday.md', 'notes/tuesday.md']);
    });

    it('shows the size the file has here, not the size it has there', async () => {
        // The sync plan compares this against the local file's size, so the
        // encrypted size would make every file look like a conflict.
        const listed = await remote.list();
        expect(listed.find((e) => e.key === 'notes/monday.md')?.size).toBe(8);
        expect(listed.find((e) => e.key === 'notes/tuesday.md')?.size).toBe(17);
    });

    it('keeps the server timestamps and version, which the plan still needs', async () => {
        const one = (await remote.list()).find((e) => e.key === 'notes/monday.md');
        expect(one?.mtimeCli).toBe(1_700_000_000_000);
        expect(one?.mtimeSvr).toBe(1_700_000_001_000);
        expect(one?.etag).toBe('rev-1700000001000');
    });

    it('tells the server nothing about what it is holding', async () => {
        const paths = Object.keys(inner.objects).filter((k) => k !== MARKER_KEY);
        expect(paths).toHaveLength(2);
        for (const path of paths) {
            expect(path).not.toContain('notes');
            expect(path).not.toContain('.md');
            expect(text(inner.objects[path].data)).not.toContain('Monday');
        }
    });

    it('reads a file back', async () => {
        expect(text(await remote.readBinary('notes/monday.md'))).toBe('# Monday');
    });

    it('reports what a single file looks like, in plaintext terms', async () => {
        const stat = await remote.stat('notes/monday.md');
        expect(stat?.key).toBe('notes/monday.md');
        expect(stat?.size).toBe(8);
        expect(await remote.stat('notes/never-written.md')).toBeNull();
    });

    it('lets a second device with the same password read everything', async () => {
        const elsewhere = new CryptoRemote(inner, PASSWORD);
        expect((await elsewhere.list()).map((e) => e.key).sort()).toEqual([
            'notes/monday.md',
            'notes/tuesday.md',
        ]);
        expect(text(await elsewhere.readBinary('notes/tuesday.md'))).toBe('# Tuesday, longer');
    });

    it('walks past a file it cannot read instead of abandoning the run', async () => {
        inner.objects['something-else.txt'] = { data: bytes('not ours'), mtimeCli: 1, mtimeSvr: 1 };
        expect((await remote.list()).map((e) => e.key).sort()).toEqual([
            'notes/monday.md',
            'notes/tuesday.md',
        ]);
        delete inner.objects['something-else.txt'];
    });

    it('never offers the marker as a file to sync', async () => {
        expect((await remote.list()).some((e) => e.key === MARKER_KEY)).toBe(false);
    });
});

describe('deleting', () => {
    it('removes the object the path actually maps to', async () => {
        const inner = fakeRemote();
        const remote = new CryptoRemote(inner, PASSWORD);
        await remote.write('gone.md', bytes('bye'), 1);
        expect(await remote.list()).toHaveLength(1);

        await remote.remove('gone.md');
        expect(await remote.list()).toHaveLength(0);
        // Only the marker is left, which is how an emptied folder should look.
        expect(Object.keys(inner.objects)).toEqual([MARKER_KEY]);
    });
});

describe('the previous-sync identity', () => {
    it('differs from the unencrypted one, so turning encryption on starts fresh', () => {
        const inner = fakeRemote();
        expect(new CryptoRemote(inner, PASSWORD).id).not.toBe(inner.id);
    });

    it('changes with the password, so changing it cannot licence deletions', () => {
        // Every file sits at a path this device has never seen afterwards. A
        // record saying otherwise would read as "the remote deleted the vault".
        const inner = fakeRemote();
        expect(new CryptoRemote(inner, 'one').id).not.toBe(new CryptoRemote(inner, 'two').id);
    });

    it('is stable for the same password and the same remote', () => {
        const inner = fakeRemote();
        expect(new CryptoRemote(inner, PASSWORD).id).toBe(new CryptoRemote(inner, PASSWORD).id);
    });

    it('follows the remote it wraps, so repointing the server still starts fresh', () => {
        const a = fakeRemote();
        const b = fakeRemote();
        (b as { id: string }).id = 'fake-2';
        expect(new CryptoRemote(a, PASSWORD).id).not.toBe(new CryptoRemote(b, PASSWORD).id);
    });
});

describe('two devices claiming the same empty folder', () => {
    it('lets exactly one of them win, and tells the other', async () => {
        // Both see an empty folder and derive a salt of their own; whichever
        // marker is written last is the one that counts. The loser's files
        // would be undecryptable, and the run after that would read them as
        // deleted from the remote and act on it.
        const inner = fakeRemote();
        const loser = new CryptoRemote(inner, PASSWORD);
        const winner = new CryptoRemote(inner, PASSWORD);
        await loser.list();
        await winner.list();

        // The other device gets its own marker in between our write and our
        // read-back, which is the ordering that actually goes wrong.
        const real = inner.write;
        inner.write = async (key, data, mtime) => {
            const result = await real(key, data, mtime);
            if (key === MARKER_KEY) {
                inner.write = real;
                await winner.write('theirs.md', bytes('theirs'), 1000);
            }
            return result;
        };

        await expect(loser.write('ours.md', bytes('ours'), 1000)).rejects.toThrow(
            /Another device set this remote folder up/
        );
        expect((await winner.list()).map((e) => e.key)).toEqual(['theirs.md']);
    });
});
