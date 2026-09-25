/**
 * AWS Signature Version 4, by hand.
 *
 * Written out rather than pulled from `@aws-sdk`: that package is most of
 * Remotely Save's four-megabyte bundle, and Zenith needs four operations
 * (`GET`, `PUT`, `DELETE`, list) against one service. `crypto.subtle` provides
 * SHA-256 and HMAC on desktop and on both mobile platforms, so the whole thing
 * is about a hundred and fifty lines with no dependency and nothing to keep
 * updated.
 *
 * The signature is unforgiving: one wrong byte in the canonical request and the
 * server answers 403 with no hint as to which byte. So each step below is a
 * separate exported function, and the ones that do not touch the network are
 * tested directly — a canonical request that can be read in a test is worth more
 * than any amount of care taken writing it.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';

/** SHA-256 of an empty body, which every GET and DELETE signs. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface SignInput {
    method: string;
    /** Path, already split into segments — NOT pre-encoded. */
    path: string;
    /** Query parameters, unencoded. */
    query: Record<string, string>;
    /** Header values by name. `host` is required; casing does not matter. */
    headers: Record<string, string>;
    /** Hex SHA-256 of the body. */
    payloadHash: string;
    region: string;
    service: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Temporary-credential token, when there is one. */
    sessionToken?: string;
    /** Signing time. Injected so a signature can be reproduced in a test. */
    now: Date;
}

export interface SignedRequest {
    /** Headers to send, including `Authorization` and `x-amz-date`. */
    headers: Record<string, string>;
    /** Intermediate artefacts, for tests and for debugging a 403. */
    canonicalRequest: string;
    stringToSign: string;
    signature: string;
}

// ── Encoding ─────────────────────────────────────────

/**
 * RFC 3986 percent-encoding, which is not what `encodeURIComponent` does.
 *
 * `encodeURIComponent` leaves `!'()*` alone; AWS expects them encoded, and a
 * bucket key containing an apostrophe would otherwise sign correctly and be
 * rejected. Space must become `%20` and never `+`.
 */
export function uriEncode(input: string, encodeSlash = true): string {
    let out = '';
    for (const byte of new TextEncoder().encode(input)) {
        const ch = String.fromCharCode(byte);
        if (/[A-Za-z0-9\-_.~]/.test(ch)) {
            out += ch;
        } else if (ch === '/' && !encodeSlash) {
            out += '/';
        } else {
            out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
        }
    }
    return out;
}

/**
 * The canonical path.
 *
 * Each segment is encoded but the separators are not, and an empty path is `/`.
 * S3 signs the path exactly once — double-encoding here is the classic way to
 * get a 403 on any key containing a space.
 */
export function canonicalUri(path: string): string {
    const trimmed = path.replace(/^\/+/, '');
    if (!trimmed) return '/';
    return `/${uriEncode(trimmed, false)}`;
}

/** Query parameters sorted by name, both sides encoded. */
export function canonicalQuery(query: Record<string, string>): string {
    return Object.keys(query)
        .sort()
        .map((key) => `${uriEncode(key)}=${uriEncode(query[key] ?? '')}`)
        .join('&');
}

interface CanonicalHeaders {
    canonical: string;
    signed: string;
}

/**
 * Headers lowercased, sorted, and with runs of whitespace collapsed.
 *
 * The collapsing is required by the spec and easy to miss: a header value the
 * caller happened to pad would sign differently from what the server
 * normalises it to.
 */
export function canonicalHeaders(headers: Record<string, string>): CanonicalHeaders {
    const entries = Object.entries(headers)
        .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return {
        canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
        signed: entries.map(([name]) => name).join(';'),
    };
}

export function buildCanonicalRequest(input: SignInput): { text: string; signedHeaders: string } {
    const { canonical, signed } = canonicalHeaders(input.headers);
    const text = [
        input.method.toUpperCase(),
        canonicalUri(input.path),
        canonicalQuery(input.query),
        canonical,
        signed,
        input.payloadHash,
    ].join('\n');
    return { text, signedHeaders: signed };
}

// ── Time ─────────────────────────────────────────────

/** `20260822T120000Z`. */
export function amzDate(now: Date): string {
    return `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** `20260822`. */
export function amzDay(now: Date): string {
    return amzDate(now).slice(0, 8);
}

// ── Primitives ───────────────────────────────────────

function subtle(): SubtleCrypto {
    const c = crypto;
    if (!c?.subtle) {
        // Only reachable in an environment without Web Crypto. Saying so plainly
        // beats a TypeError from inside the signing chain.
        throw new Error('This device has no Web Crypto, so S3 requests cannot be signed.');
    }
    return c.subtle;
}

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return toHex(await subtle().digest('SHA-256', bytes));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
    const imported = await subtle().importKey(
        'raw',
        key as BufferSource,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    return subtle().sign('HMAC', imported, new TextEncoder().encode(message));
}

export function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * The four-step signing key.
 *
 * Derived per day and per region rather than from the secret directly, which is
 * what lets a signature be scoped: a key leaked from one day's traffic cannot
 * sign tomorrow's.
 */
export async function signingKey(
    secretAccessKey: string,
    day: string,
    region: string,
    service: string
): Promise<ArrayBuffer> {
    const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), day);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, 'aws4_request');
}

// ── The signature ────────────────────────────────────

export async function signRequest(input: SignInput): Promise<SignedRequest> {
    const date = amzDate(input.now);
    const day = amzDay(input.now);
    const scope = `${day}/${input.region}/${input.service}/aws4_request`;

    // These are part of what gets signed, so they go in before the canonical
    // request is built rather than being added to the outgoing request after.
    const headers: Record<string, string> = {
        ...input.headers,
        'x-amz-date': date,
        'x-amz-content-sha256': input.payloadHash,
        ...(input.sessionToken ? { 'x-amz-security-token': input.sessionToken } : {}),
    };

    const { text: canonicalRequest, signedHeaders } = buildCanonicalRequest({ ...input, headers });

    const stringToSign = [
        ALGORITHM,
        date,
        scope,
        await sha256Hex(canonicalRequest),
    ].join('\n');

    const key = await signingKey(input.secretAccessKey, day, input.region, input.service);
    const signature = toHex(await hmac(key, stringToSign));

    return {
        headers: {
            ...headers,
            Authorization:
                `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
                `SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        canonicalRequest,
        stringToSign,
        signature,
    };
}
