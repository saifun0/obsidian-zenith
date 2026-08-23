import { describe, it, expect } from 'vitest';
import {
    EMPTY_SHA256,
    amzDate,
    amzDay,
    buildCanonicalRequest,
    canonicalHeaders,
    canonicalQuery,
    canonicalUri,
    sha256Hex,
    signRequest,
    signingKey,
    toHex,
    uriEncode,
    type SignInput,
} from '../src/modules/sync/services/remotes/sigv4';

/**
 * AWS's own worked example, from the Signature Version 4 documentation.
 *
 * The canonical request and the string-to-sign below are the ones AWS
 * publishes. The signing key and the final signature were cross-checked against
 * an independent implementation over `node:crypto`, so two separate code paths
 * agree on them — which matters, because a value taken from whatever this
 * implementation happened to produce would prove nothing at all.
 *
 * The failure mode being guarded against is a 403 from the server with no
 * indication of which byte was wrong.
 */
const AWS_EXAMPLE = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3',
    now: new Date('2013-05-24T00:00:00Z'),
};

const getObject: SignInput = {
    ...AWS_EXAMPLE,
    method: 'GET',
    path: '/test.txt',
    query: {},
    headers: {
        Host: 'examplebucket.s3.amazonaws.com',
        Range: 'bytes=0-9',
    },
    payloadHash: EMPTY_SHA256,
};

describe('primitives', () => {
    it('hashes an empty body to the value every GET signs', () => {
        expect(EMPTY_SHA256).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
    });

    it('computes SHA-256 correctly', async () => {
        expect(await sha256Hex('')).toBe(EMPTY_SHA256);
        expect(await sha256Hex('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });

    it('derives the four-step signing key', async () => {
        const key = await signingKey(
            AWS_EXAMPLE.secretAccessKey,
            '20130524',
            'us-east-1',
            's3'
        );
        expect(toHex(key)).toBe(
            'f117494eff5d09da21cbf7f0339559ea04fc9582d31299cb992be70a6b27c97a'
        );
    });

    it('scopes the key to the day, the region and the service', async () => {
        // The whole point of deriving rather than signing with the secret: a key
        // recovered from one day's traffic cannot sign anything else.
        const base = toHex(await signingKey('secret', '20130524', 'us-east-1', 's3'));
        expect(toHex(await signingKey('secret', '20130525', 'us-east-1', 's3'))).not.toBe(base);
        expect(toHex(await signingKey('secret', '20130524', 'eu-west-1', 's3'))).not.toBe(base);
        expect(toHex(await signingKey('secret', '20130524', 'us-east-1', 'iam'))).not.toBe(base);
    });
});

describe('uriEncode', () => {
    it('encodes the characters encodeURIComponent leaves alone', () => {
        // A key with an apostrophe in it would otherwise sign one way and be
        // rejected another.
        expect(uriEncode("!'()*")).toBe('%21%27%28%29%2A');
    });

    it('leaves the unreserved set alone', () => {
        expect(uriEncode('AZaz09-_.~')).toBe('AZaz09-_.~');
    });

    it('uses %20 for a space, never a plus', () => {
        expect(uriEncode('a b')).toBe('a%20b');
    });

    it('encodes UTF-8 byte by byte', () => {
        expect(uriEncode('щ')).toBe('%D1%89');
    });

    it('can keep separators for a path', () => {
        expect(uriEncode('a/b c', false)).toBe('a/b%20c');
        expect(uriEncode('a/b c', true)).toBe('a%2Fb%20c');
    });
});

describe('canonicalUri', () => {
    it('is a bare slash for an empty path', () => {
        expect(canonicalUri('')).toBe('/');
        expect(canonicalUri('/')).toBe('/');
    });

    it('encodes each segment once, keeping the separators', () => {
        // Double-encoding here is the classic way to get a 403 on any key with
        // a space in it.
        expect(canonicalUri('/notes/my note.md')).toBe('/notes/my%20note.md');
    });

    it('handles a non-ASCII key', () => {
        expect(canonicalUri('/заметка.md')).toBe('/%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0.md');
    });
});

describe('canonicalQuery', () => {
    it('sorts by parameter name', () => {
        expect(canonicalQuery({ prefix: 'a', 'list-type': '2' })).toBe('list-type=2&prefix=a');
    });

    it('encodes both sides', () => {
        expect(canonicalQuery({ prefix: 'my notes/' })).toBe('prefix=my%20notes%2F');
    });

    it('keeps a valueless parameter as an empty value', () => {
        expect(canonicalQuery({ delimiter: '' })).toBe('delimiter=');
    });

    it('is empty when there are no parameters', () => {
        expect(canonicalQuery({})).toBe('');
    });
});

describe('canonicalHeaders', () => {
    it('lowercases, sorts, and lists the signed names', () => {
        const { canonical, signed } = canonicalHeaders({
            'X-Amz-Date': '20130524T000000Z',
            Host: 'example.com',
        });
        expect(canonical).toBe('host:example.com\nx-amz-date:20130524T000000Z\n');
        expect(signed).toBe('host;x-amz-date');
    });

    it('collapses runs of whitespace inside a value', () => {
        // Required by the spec and easy to miss: the server normalises the value
        // before checking the signature, so a padded header signs differently.
        expect(canonicalHeaders({ a: '  one   two  ' }).canonical).toBe('a:one two\n');
    });
});

describe('the AWS worked example', () => {
    it('builds the published canonical request', () => {
        const { text } = buildCanonicalRequest({
            ...getObject,
            headers: {
                ...getObject.headers,
                'x-amz-content-sha256': EMPTY_SHA256,
                'x-amz-date': '20130524T000000Z',
            },
        });

        expect(text).toBe(
            [
                'GET',
                '/test.txt',
                '',
                'host:examplebucket.s3.amazonaws.com',
                'range:bytes=0-9',
                `x-amz-content-sha256:${EMPTY_SHA256}`,
                'x-amz-date:20130524T000000Z',
                '',
                'host;range;x-amz-content-sha256;x-amz-date',
                EMPTY_SHA256,
            ].join('\n')
        );
    });

    it('builds the published string to sign', async () => {
        const signed = await signRequest(getObject);
        expect(signed.stringToSign).toBe(
            [
                'AWS4-HMAC-SHA256',
                '20130524T000000Z',
                '20130524/us-east-1/s3/aws4_request',
                '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
            ].join('\n')
        );
    });

    it('produces the cross-checked signature', async () => {
        const signed = await signRequest(getObject);
        expect(signed.signature).toBe(
            '67fe34c8530db585abddc51067328adfedb6e42487d2566dc7d927d6e2722900'
        );
    });

    it('assembles the Authorization header in the documented shape', async () => {
        const signed = await signRequest(getObject);
        expect(signed.headers.Authorization).toBe(
            'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
                'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
                'Signature=67fe34c8530db585abddc51067328adfedb6e42487d2566dc7d927d6e2722900'
        );
    });
});

describe('signRequest', () => {
    it('adds the headers it signed, so the request matches the signature', async () => {
        const signed = await signRequest(getObject);
        expect(signed.headers['x-amz-date']).toBe('20130524T000000Z');
        expect(signed.headers['x-amz-content-sha256']).toBe(EMPTY_SHA256);
        expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('signs a session token when there is one', async () => {
        // Left out of the signed headers it would be ignored by the server and
        // the request rejected as unauthorised.
        const signed = await signRequest({ ...getObject, sessionToken: 'tok' });
        expect(signed.headers['x-amz-security-token']).toBe('tok');
        expect(signed.canonicalRequest).toContain('x-amz-security-token:tok');
    });

    it('changes when anything signed changes', async () => {
        const base = await signRequest(getObject);
        const other = await signRequest({ ...getObject, path: '/other.txt' });
        expect(other.signature).not.toBe(base.signature);
    });
});

describe('timestamps', () => {
    it('formats the two shapes AWS wants', () => {
        const now = new Date('2026-08-22T12:34:56.789Z');
        expect(amzDate(now)).toBe('20260822T123456Z');
        expect(amzDay(now)).toBe('20260822');
    });
});
