import { describe, it, expect } from 'vitest';
import { describeS3Error, parseListObjects } from '../src/modules/sync/services/remotes/s3Remote';

/**
 * The `ListObjectsV2` reader.
 *
 * Parsed with string extraction rather than a DOM so it can be tested at all —
 * the plugin's tests run in Node, which has none. An untestable parser sitting
 * between the engine and the user's files is a worse trade than a less general
 * one, and this response shape is flat and fixed.
 */

const page = (body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Name>my-bucket</Name>
<EncodingType>url</EncodingType>
${body}
</ListBucketResult>`;

const contents = (key: string, extra = '') =>
    `<Contents><Key>${key}</Key><LastModified>2026-08-22T10:00:00.000Z</LastModified>` +
    `<ETag>&quot;abc123&quot;</ETag><Size>42</Size>${extra}</Contents>`;

describe('parseListObjects', () => {
    it('reads key, size, timestamp and etag', () => {
        const { objects } = parseListObjects(page(contents('vault/day.md')));

        expect(objects).toHaveLength(1);
        expect(objects[0]).toMatchObject({
            key: 'vault/day.md',
            size: 42,
            etag: 'abc123',
        });
        expect(objects[0].mtimeSvr).toBe(Date.parse('2026-08-22T10:00:00.000Z'));
    });

    it('reads every object in the page', () => {
        const { objects } = parseListObjects(
            page([contents('a.md'), contents('b.md'), contents('c.md')].join('\n'))
        );
        expect(objects.map((o) => o.key)).toEqual(['a.md', 'b.md', 'c.md']);
    });

    it('decodes the percent-encoded keys that encoding-type=url produces', () => {
        const { objects } = parseListObjects(page(contents('vault/my%20note.md')));
        expect(objects[0].key).toBe('vault/my note.md');
    });

    it('decodes a non-ASCII key', () => {
        const { objects } = parseListObjects(
            page(contents('%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0.md'))
        );
        expect(objects[0].key).toBe('заметка.md');
    });

    it('survives malformed encoding rather than losing the whole page', () => {
        const { objects } = parseListObjects(
            page([contents('bad%zz.md'), contents('good.md')].join('\n'))
        );
        expect(objects).toHaveLength(2);
        expect(objects[1].key).toBe('good.md');
    });

    it('unescapes XML entities in a key', () => {
        const { objects } = parseListObjects(page(contents('a%20&amp;%20b.md')));
        expect(objects[0].key).toBe('a & b.md');
    });

    it('strips the quotes around an etag, weak or not', () => {
        const quoted = parseListObjects(
            page(`<Contents><Key>a.md</Key><ETag>"xyz"</ETag><Size>1</Size></Contents>`)
        );
        expect(quoted.objects[0].etag).toBe('xyz');
    });

    it('is empty for an empty bucket', () => {
        expect(parseListObjects(page('')).objects).toEqual([]);
    });

    it('tolerates a missing size or timestamp', () => {
        const { objects } = parseListObjects(page('<Contents><Key>a.md</Key></Contents>'));
        expect(objects[0]).toMatchObject({ key: 'a.md', size: 0, mtimeSvr: 0 });
    });
});

describe('continuation', () => {
    it('reports the token when the listing is truncated', () => {
        // Without following this, a large bucket looks like its first thousand
        // keys — and every key past that reads as "deleted remotely".
        const { nextToken } = parseListObjects(
            page(
                `${contents('a.md')}<IsTruncated>true</IsTruncated>` +
                    `<NextContinuationToken>abc%2Fdef</NextContinuationToken>`
            )
        );
        expect(nextToken).toBe('abc/def');
    });

    it('reports no token when the listing is complete', () => {
        const { nextToken } = parseListObjects(
            page(`${contents('a.md')}<IsTruncated>false</IsTruncated>`)
        );
        expect(nextToken).toBeUndefined();
    });

    it('ignores a stale token on a complete listing', () => {
        // Following one here would loop over the same page forever.
        const { nextToken } = parseListObjects(
            page(
                `${contents('a.md')}<IsTruncated>false</IsTruncated>` +
                    `<NextContinuationToken>abc</NextContinuationToken>`
            )
        );
        expect(nextToken).toBeUndefined();
    });
});

describe('describeS3Error', () => {
    it("prefers the server's own message", () => {
        // "The request signature we calculated does not match" points straight
        // at the problem; "HTTP 403" does not.
        const body = `<Error><Code>SignatureDoesNotMatch</Code>` +
            `<Message>The request signature we calculated does not match.</Message></Error>`;
        expect(describeS3Error(body, 403)).toBe(
            'The request signature we calculated does not match. (SignatureDoesNotMatch)'
        );
    });

    it('falls back to the status when there is no usable body', () => {
        expect(describeS3Error('', 500)).toBe('The server answered 500.');
        expect(describeS3Error('not xml at all', 502)).toBe('The server answered 502.');
    });

    it('handles a message with no code', () => {
        expect(describeS3Error('<Error><Message>Slow down.</Message></Error>', 503)).toBe(
            'Slow down.'
        );
    });
});
