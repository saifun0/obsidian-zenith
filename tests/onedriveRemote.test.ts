import { describe, it, expect } from 'vitest';
import {
    CHUNK_SIZE,
    chunkRanges,
    describeGraphError,
    encodeGraphPath,
    parseChildren,
    parseItem,
} from '../src/modules/sync/services/remotes/onedriveRemote';

const item = (over: Record<string, unknown> = {}) => ({
    name: 'day.md',
    size: 42,
    file: { mimeType: 'text/markdown' },
    eTag: '"{ABC},1"',
    lastModifiedDateTime: '2026-08-22T10:00:05Z',
    fileSystemInfo: { lastModifiedDateTime: '2026-08-22T10:00:00Z' },
    ...over,
});

describe('parseItem', () => {
    it('separates the client edit time from the service time', () => {
        // `fileSystemInfo` is the whole reason to ask for it — it carries the
        // time the file was written on the device that uploaded it.
        const parsed = parseItem(item());
        expect(parsed?.mtimeCli).toBe(Date.parse('2026-08-22T10:00:00Z'));
        expect(parsed?.mtimeSvr).toBe(Date.parse('2026-08-22T10:00:05Z'));
    });

    it('falls back to the service time when fileSystemInfo is missing', () => {
        const parsed = parseItem(item({ fileSystemInfo: undefined }));
        expect(parsed?.mtimeCli).toBe(Date.parse('2026-08-22T10:00:05Z'));
    });

    it('reads size and etag', () => {
        expect(parseItem(item())).toMatchObject({ size: 42, etag: '"{ABC},1"' });
    });

    it('is null for a non-object', () => {
        expect(parseItem(null)).toBeNull();
        expect(parseItem('nope')).toBeNull();
    });
});

describe('parseChildren', () => {
    it('separates folders from files', () => {
        const page = parseChildren({
            value: [item(), item({ name: 'sub', file: undefined, folder: { childCount: 2 } })],
        });

        expect(page.items.map((i) => [i.name, i.isFolder])).toEqual([
            ['day.md', false],
            ['sub', true],
        ]);
    });

    it('reports the next link so a long folder is fully read', () => {
        // Not following it would show the first page only, and every file past
        // it would read as "deleted remotely".
        const page = parseChildren({
            value: [],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive?$skiptoken=ABC',
        });
        expect(page.nextLink).toBe('https://graph.microsoft.com/v1.0/me/drive?$skiptoken=ABC');
    });

    it('has no next link on the last page', () => {
        expect(parseChildren({ value: [item()] }).nextLink).toBeUndefined();
    });

    it('skips entries with no name rather than inventing one', () => {
        expect(parseChildren({ value: [item({ name: undefined }), null, 5] }).items).toEqual([]);
    });

    it('survives an unexpected body', () => {
        expect(parseChildren(null).items).toEqual([]);
        expect(parseChildren({ value: 'nope' }).items).toEqual([]);
    });
});

describe('encodeGraphPath', () => {
    it('encodes each segment, keeping the separators', () => {
        expect(encodeGraphPath('10 Tasks/my note.md')).toBe('10%20Tasks/my%20note.md');
    });

    it('encodes characters that would otherwise change the address', () => {
        // A `#` read as a fragment or a `?` read as a query would address a
        // different item — which for a DELETE stops being silent quickly.
        expect(encodeGraphPath('notes/a#b.md')).toBe('notes/a%23b.md');
        expect(encodeGraphPath('notes/a?b.md')).toBe('notes/a%3Fb.md');
    });

    it('handles a non-ASCII filename', () => {
        expect(encodeGraphPath('заметка.md')).toBe(
            '%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0.md'
        );
    });

    it('drops empty segments from a doubled slash', () => {
        expect(encodeGraphPath('/a//b/')).toBe('a/b');
    });
});

describe('chunkRanges', () => {
    it('is empty for an empty file', () => {
        expect(chunkRanges(0, 100)).toEqual([]);
    });

    it('is one inclusive range for a file that fits', () => {
        // Graph wants both ends inclusive, so a 10-byte file is bytes 0-9.
        expect(chunkRanges(10, 100)).toEqual([{ start: 0, end: 9 }]);
    });

    it('splits on the boundary without overlapping or skipping', () => {
        expect(chunkRanges(250, 100)).toEqual([
            { start: 0, end: 99 },
            { start: 100, end: 199 },
            { start: 200, end: 249 },
        ]);
    });

    it('does not emit an empty trailing range on an exact multiple', () => {
        expect(chunkRanges(200, 100)).toEqual([
            { start: 0, end: 99 },
            { start: 100, end: 199 },
        ]);
    });

    it('covers every byte exactly once', () => {
        const total = 5_000_003;
        const ranges = chunkRanges(total, CHUNK_SIZE);
        expect(ranges[0].start).toBe(0);
        expect(ranges[ranges.length - 1].end).toBe(total - 1);
        for (let i = 1; i < ranges.length; i++) {
            expect(ranges[i].start).toBe(ranges[i - 1].end + 1);
        }
    });

    it('uses a chunk size Graph accepts', () => {
        // Every chunk but the last must be a whole multiple of 320 KiB.
        expect(CHUNK_SIZE % (320 * 1024)).toBe(0);
    });
});

describe('describeGraphError', () => {
    it('digs the message out of the nested error object', () => {
        expect(
            describeGraphError('{"error":{"code":"itemNotFound","message":"Item does not exist"}}', 404)
        ).toBe('Item does not exist');
    });

    it('falls back to an OAuth-style description, then the status', () => {
        expect(describeGraphError('{"error_description":"token expired"}', 401)).toBe(
            'token expired'
        );
        expect(describeGraphError('', 503)).toBe('Microsoft answered 503.');
        expect(describeGraphError('<html/>', 500)).toBe('Microsoft answered 500.');
    });
});
