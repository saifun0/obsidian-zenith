import { describe, it, expect } from 'vitest';
import {
    asciiJson,
    describeDropboxError,
    describeScope,
    DropboxRemote,
    dropboxTime,
    missingScope,
    parseListing,
    parseMetadata,
    SIMPLE_UPLOAD_LIMIT,
    UPLOAD_CHUNK,
} from '../src/modules/sync/services/remotes/dropboxRemote';
import type { Http } from '../src/modules/sync/services/remotes/http';
import type { TokenStore } from '../src/modules/sync/services/remotes/oauthSession';

const file = (over: Record<string, unknown> = {}) => ({
    '.tag': 'file',
    name: 'day.md',
    path_lower: '/vault/day.md',
    path_display: '/Vault/Day.md',
    size: 42,
    client_modified: '2026-08-22T10:00:00Z',
    server_modified: '2026-08-22T10:00:05Z',
    rev: '0159abc',
    ...over,
});

describe('parseMetadata', () => {
    it('reads size, both timestamps and the revision', () => {
        expect(parseMetadata(file())).toEqual({
            path: '/Vault/Day.md',
            size: 42,
            clientModified: Date.parse('2026-08-22T10:00:00Z'),
            serverModified: Date.parse('2026-08-22T10:00:05Z'),
            rev: '0159abc',
        });
    });

    it('prefers the display path, which keeps the user casing', () => {
        // `path_lower` is what Dropbox matches on, but turning it into a vault
        // path would rename `Design.md` to `design.md` on the way down.
        expect(parseMetadata(file()).path).toBe('/Vault/Day.md');
        expect(parseMetadata(file({ path_display: undefined })).path).toBe('/vault/day.md');
    });

    it('falls back to the server time when there is no client time', () => {
        expect(parseMetadata(file({ client_modified: undefined })).clientModified).toBe(
            Date.parse('2026-08-22T10:00:05Z')
        );
    });

    it('is null without a path', () => {
        expect(parseMetadata({ '.tag': 'file', size: 1 })).toBeNull();
        expect(parseMetadata(null)).toBeNull();
    });
});

describe('parseListing', () => {
    it('reads the files in a page', () => {
        const listing = parseListing({ entries: [file(), file({ path_display: '/Vault/b.md' })] });
        expect(listing.entries).toHaveLength(2);
        expect(listing.entries[0].entity('day.md')).toMatchObject({ key: 'day.md', size: 42 });
    });

    it('drops folder entries', () => {
        // The engine works in files; treating a folder as one would have the
        // plan try to download it.
        const listing = parseListing({
            entries: [file(), { '.tag': 'folder', path_display: '/Vault/sub' }],
        });
        expect(listing.entries).toHaveLength(1);
    });

    it('drops deleted entries', () => {
        const listing = parseListing({
            entries: [{ '.tag': 'deleted', path_display: '/Vault/gone.md' }],
        });
        expect(listing.entries).toEqual([]);
    });

    it('reports the cursor when there is more to fetch', () => {
        // Not following it would show the first page only, and every key past it
        // would read as "deleted remotely".
        expect(parseListing({ entries: [], cursor: 'CUR', has_more: true })).toMatchObject({
            cursor: 'CUR',
            hasMore: true,
        });
    });

    it('does not continue when the listing is complete', () => {
        expect(parseListing({ entries: [], cursor: 'CUR', has_more: false }).hasMore).toBe(false);
    });

    it('survives a body that is not what was expected', () => {
        expect(parseListing(null).entries).toEqual([]);
        expect(parseListing({ entries: 'nope' }).entries).toEqual([]);
        expect(parseListing({ entries: [null, 'x', 5] }).entries).toEqual([]);
    });

    it('carries the client time through to the entity', () => {
        // This is the property that makes Dropbox the best remote here: the
        // user's own edit time survives, so the same edit synced twice is
        // recognisable rather than a conflict.
        const entity = parseListing({ entries: [file()] }).entries[0].entity('day.md');
        expect(entity.mtimeCli).toBe(Date.parse('2026-08-22T10:00:00Z'));
        expect(entity.mtimeSvr).toBe(Date.parse('2026-08-22T10:00:05Z'));
        expect(entity.mtimeCli).not.toBe(entity.mtimeSvr);
    });
});

describe('dropboxTime', () => {
    it('emits whole seconds, which is all Dropbox accepts', () => {
        // Milliseconds are rejected outright.
        expect(dropboxTime(Date.parse('2026-08-22T10:00:00.789Z'))).toBe('2026-08-22T10:00:00Z');
    });

    it('round-trips through Date.parse', () => {
        const ms = Date.parse('2026-08-22T10:00:00Z');
        expect(Date.parse(dropboxTime(ms))).toBe(ms);
    });
});

describe('asciiJson', () => {
    it('leaves plain ASCII alone', () => {
        expect(asciiJson({ path: '/vault/day.md' })).toBe('{"path":"/vault/day.md"}');
    });

    it('escapes anything a Latin-1 header cannot carry', () => {
        // Setting a header to a string with a Cyrillic character in it throws,
        // so a note called заметка.md would fail to sync at all.
        const encoded = asciiJson({ path: '/vault/заметка.md' });
        expect(encoded).not.toMatch(/[^\x00-\x7f]/);
        expect(encoded).toContain('\\u0437');
        expect(JSON.parse(encoded).path).toBe('/vault/заметка.md');
    });

    it('survives an emoji in a filename', () => {
        const encoded = asciiJson({ path: '/vault/🎉.md' });
        expect(encoded).not.toMatch(/[^\x00-\x7f]/);
        expect(JSON.parse(encoded).path).toBe('/vault/🎉.md');
    });
});

describe('describeDropboxError', () => {
    it('prefers the dotted summary, which names the real problem', () => {
        expect(
            describeDropboxError('{"error_summary":"path/not_found/..","error":{}}', 409)
        ).toBe('path/not_found/..');
    });

    it('falls back to the description, then to the status', () => {
        expect(describeDropboxError('{"error_description":"bad token"}', 401)).toBe('bad token');
        expect(describeDropboxError('', 500)).toBe('Dropbox answered 500.');
        expect(describeDropboxError('<html>oops</html>', 502)).toBe('Dropbox answered 502.');
    });
});

// ── The client itself ────────────────────────────────
// Reachable now that the transport is injected. Everything below this line was
// beyond reach while the class called `requestUrl` directly — which is most of
// what it actually does.

interface Recorded {
    url: string;
    method: string;
    /** The `Dropbox-API-Arg` header, parsed. Content endpoints only. */
    arg?: unknown;
    /** The request body, parsed. RPC endpoints only. */
    json?: unknown;
    bodyLength: number;
}

function fakeHttp(answers: Array<{ status: number; body?: unknown; text?: string }>) {
    const sent: Recorded[] = [];
    let call = 0;

    const http: Http = async (req) => {
        const arg = req.headers?.['Dropbox-API-Arg'];
        sent.push({
            url: req.url,
            method: req.method,
            arg: typeof arg === 'string' ? JSON.parse(arg) : undefined,
            json: typeof req.body === 'string' ? JSON.parse(req.body) : undefined,
            bodyLength:
                req.body instanceof ArrayBuffer ? req.body.byteLength : (req.body?.length ?? 0),
        });

        const answer = answers[Math.min(call++, answers.length - 1)];
        return {
            status: answer.status,
            headers: {},
            text: answer.text ?? JSON.stringify(answer.body ?? {}),
            arrayBuffer: new ArrayBuffer(0),
        };
    };

    return {
        sent,
        http,
        get calls() {
            return call;
        },
    };
}

const TOKENS: TokenStore = {
    read: () => ({ accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3_600_000 }),
    write: () => {},
    clear: () => {},
};

function remoteWith(fake: ReturnType<typeof fakeHttp>, folder = 'vault') {
    return new DropboxRemote({ kind: 'dropbox', clientId: 'app', folder }, TOKENS, {
        http: fake.http,
        // No real waiting: the backoff itself is covered in httpRetry.test.ts.
        retry: { sleep: async () => {}, random: () => 1 },
    });
}

const FILE = {
    '.tag': 'file',
    path_display: '/vault/notes/a.md',
    size: 42,
    client_modified: '2026-01-02T03:04:05Z',
    server_modified: '2026-01-02T03:04:09Z',
    rev: '0123',
};

const NOT_FOUND = { status: 409, text: '{"error_summary":"path/not_found/.."}' };

describe('DropboxRemote.stat', () => {
    it('asks for one file rather than for the whole tree', async () => {
        const fake = fakeHttp([{ status: 200, body: FILE }]);
        const entity = await remoteWith(fake).stat('notes/a.md');

        expect(fake.sent[0].url).toContain('/files/get_metadata');
        expect(fake.calls).toBe(1);
        expect(entity).toEqual({
            key: 'notes/a.md',
            size: 42,
            mtimeCli: Date.parse('2026-01-02T03:04:05Z'),
            mtimeSvr: Date.parse('2026-01-02T03:04:09Z'),
            etag: '0123',
        });
    });

    it('is null for a path that is not there', async () => {
        expect(await remoteWith(fakeHttp([NOT_FOUND])).stat('gone.md')).toBeNull();
    });

    it('is null for a folder, which is not a file however happily it answers', async () => {
        const fake = fakeHttp([
            { status: 200, body: { '.tag': 'folder', path_display: '/vault/x' } },
        ]);
        expect(await remoteWith(fake).stat('x')).toBeNull();
    });

    it('reports a real error rather than swallowing it as absence', async () => {
        const fake = fakeHttp([{ status: 409, text: '{"error_summary":"path/conflict/file/.."}' }]);
        await expect(remoteWith(fake).stat('x.md')).rejects.toThrow(/conflict/);
    });
});

describe('DropboxRemote uploads', () => {
    it('sends a small file in one request', async () => {
        const fake = fakeHttp([{ status: 200, body: { ...FILE, size: 5 } }]);
        await remoteWith(fake).write('notes/a.md', new ArrayBuffer(5), 1_700_000_000_500);

        expect(fake.calls).toBe(1);
        expect(fake.sent[0].url).toContain('/files/upload');
        expect(fake.sent[0].arg).toMatchObject({
            path: '/vault/notes/a.md',
            mode: 'overwrite',
            // Whole seconds: Dropbox rejects milliseconds outright.
            client_modified: '2023-11-14T22:13:20Z',
        });
    });

    it('opens a session for a large one, and walks every byte through it', async () => {
        const fake = fakeHttp([
            { status: 200, body: { session_id: 'sess-1' } },
            { status: 200, body: {} },
            { status: 200, body: {} },
            { status: 200, body: { ...FILE, size: SIMPLE_UPLOAD_LIMIT + 1 } },
        ]);

        await remoteWith(fake).write('big.bin', new ArrayBuffer(SIMPLE_UPLOAD_LIMIT + 1), 1000);

        expect(fake.sent.map((s) => s.url.replace('https://content.dropboxapi.com/2', ''))).toEqual([
            '/files/upload_session/start',
            '/files/upload_session/append_v2',
            '/files/upload_session/append_v2',
            '/files/upload_session/finish',
        ]);

        // The offsets have to walk the file exactly. A gap here corrupts the
        // upload rather than failing it, which is the worst way to be wrong.
        expect(fake.sent[1].arg).toMatchObject({ cursor: { session_id: 'sess-1', offset: 0 } });
        expect(fake.sent[1].bodyLength).toBe(UPLOAD_CHUNK);
        expect(fake.sent[2].arg).toMatchObject({
            cursor: { session_id: 'sess-1', offset: UPLOAD_CHUNK },
        });
        expect(fake.sent[2].bodyLength).toBe(1);
        expect(fake.sent[3].arg).toMatchObject({
            cursor: { offset: SIMPLE_UPLOAD_LIMIT + 1 },
            commit: { path: '/vault/big.bin' },
        });
    });

    it('gives up clearly when the session never opens', async () => {
        const fake = fakeHttp([{ status: 200, body: { no_session: true } }]);
        await expect(
            remoteWith(fake).write('big.bin', new ArrayBuffer(SIMPLE_UPLOAD_LIMIT + 1), 1000)
        ).rejects.toThrow(/did not open an upload session/);
    });
});

describe('DropboxRemote and the rate limiter', () => {
    it('waits out a 429 instead of reporting the file as failed', async () => {
        // Four parallel transfers into a real vault hit this within the first
        // few dozen files, so a client without it never finishes a first sync.
        const fake = fakeHttp([
            { status: 429, text: '{"error_summary":"too_many_requests/.."}' },
            { status: 200, body: { ...FILE, size: 5 } },
        ]);

        const stored = await remoteWith(fake).write('notes/a.md', new ArrayBuffer(5), 1000);
        expect(fake.calls).toBe(2);
        expect(stored.key).toBe('notes/a.md');
    });

    it('waits one out during a listing too', async () => {
        const fake = fakeHttp([
            { status: 503 },
            { status: 200, body: { entries: [FILE], has_more: false } },
        ]);

        expect((await remoteWith(fake).list()).map((e) => e.key)).toEqual(['notes/a.md']);
    });
});

describe('DropboxRemote listing', () => {
    it('is empty for a folder that does not exist yet', async () => {
        expect(await remoteWith(fakeHttp([NOT_FOUND])).list()).toEqual([]);
    });

    it('follows the cursor to the end', async () => {
        const fake = fakeHttp([
            { status: 200, body: { entries: [FILE], has_more: true, cursor: 'c1' } },
            {
                status: 200,
                body: {
                    entries: [{ ...FILE, path_display: '/vault/notes/b.md' }],
                    has_more: false,
                },
            },
        ]);

        expect((await remoteWith(fake).list()).map((e) => e.key)).toEqual([
            'notes/a.md',
            'notes/b.md',
        ]);
        expect(fake.sent[1].url).toContain('/files/list_folder/continue');
        expect(fake.sent[1].json).toEqual({ cursor: 'c1' });
    });

    it('addresses the account root as the empty string, never as a slash', async () => {
        // Sending "/" is an error against Dropbox, and an easy one to write.
        const fake = fakeHttp([{ status: 200, body: { entries: [], has_more: false } }]);
        await remoteWith(fake, '').list();

        expect(fake.sent[0].json).toMatchObject({ path: '', recursive: true });
    });
});

describe('DropboxRemote.remove', () => {
    it('treats an already-missing file as done', async () => {
        await expect(remoteWith(fakeHttp([NOT_FOUND])).remove('gone.md')).resolves.toBeUndefined();
    });

    it('reports anything else', async () => {
        const fake = fakeHttp([{ status: 403, text: '{"error_summary":"insufficient_space/.."}' }]);
        await expect(remoteWith(fake).remove('a.md')).rejects.toThrow(/insufficient_space/);
    });
});

describe('a Dropbox app that was not given a permission', () => {
    const MISSING = JSON.stringify({
        error_summary: 'missing_scope/.',
        error: { '.tag': 'missing_scope', required_scope: 'account_info.read' },
    });

    it('names the scope, and what adding it would allow', async () => {
        // A missing permission and a dead token both arrive as a 401, and the
        // fixes have nothing in common. "Authorize again" against a missing
        // scope sends someone round the same loop indefinitely.
        const fake = fakeHttp([{ status: 401, text: MISSING }]);
        const result = await remoteWith(fake).checkConnection();

        expect(result.ok).toBe(false);
        expect(result.error).toContain('account_info.read');
        expect(result.error).toContain('check who it is signed in as');
        expect(result.error).toMatch(/disconnect and connect again/);
    });

    it('still says "authorize again" when the token is simply dead', async () => {
        const fake = fakeHttp([{ status: 401, text: '{"error_summary":"invalid_access_token/"}' }]);
        const result = await remoteWith(fake).checkConnection();

        expect(result.error).toBe('Dropbox rejected the connection — authorize again.');
    });

    it('reads the scope out of the body, and nothing out of anything else', () => {
        expect(missingScope(MISSING)).toBe('account_info.read');
        expect(missingScope('{"error":{".tag":"invalid_access_token"}}')).toBeNull();
        expect(missingScope('not json at all')).toBeNull();
    });

    it('has plain words for every scope the plugin asks for', () => {
        for (const scope of [
            'account_info.read',
            'files.metadata.read',
            'files.content.read',
            'files.content.write',
        ]) {
            // Never the raw scope name echoed back: the point of the sentence is
            // to say what was refused, not to repeat the identifier.
            expect(describeScope(scope)).not.toContain(scope);
        }
        expect(describeScope('sharing.write')).toContain('sharing.write');
    });
});
