import { describe, it, expect } from 'vitest';
import {
    asciiJson,
    describeDropboxError,
    dropboxTime,
    parseListing,
    parseMetadata,
} from '../src/modules/sync/services/remotes/dropboxRemote';

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
