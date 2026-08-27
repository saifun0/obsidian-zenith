import { requestUrl } from 'obsidian';
import { fnv1a } from '../../../../core/hash';
import type { FileEntity } from '../../fileSyncTypes';
import { EMPTY_SHA256, sha256Hex, signRequest } from './sigv4';
import type { ConnectionResult, S3Config, SyncRemote } from './types';

/**
 * S3 backend, spoken directly over the REST API.
 *
 * No `@aws-sdk`: the four operations needed here are plain HTTP once the request
 * is signed, and the SDK is most of the four megabytes Remotely Save ships.
 * Signing lives in `sigv4.ts`, which is tested against AWS's published example.
 *
 * Works against anything S3-compatible — MinIO, Backblaze B2, Cloudflare R2,
 * Wasabi, Storj — because none of that involves the SDK either. Path-style
 * addressing is offered for exactly that reason: self-hosted endpoints rarely
 * have the wildcard DNS that virtual-host style requires.
 */

/**
 * The client's mtime, recorded on the object as user metadata.
 *
 * Written but not read back: `ListObjectsV2` returns only the server's
 * `LastModified`, and learning the metadata would cost a `HeadObject` per file —
 * a round trip per note on every listing. It is still worth the one header,
 * because it is the only place the real edit time survives on the server at all;
 * without it that information is simply destroyed on upload.
 *
 * The comparison does not depend on it. `PrevSyncRecord` keeps each side's
 * timestamps separately for exactly this situation, so a server stamping its own
 * clock still compares correctly against its own past.
 */
const MTIME_META = 'x-amz-meta-zenith-mtime';

export class S3Remote implements SyncRemote {
    readonly kind = 's3' as const;
    readonly id: string;

    private readonly prefix: string;

    constructor(private readonly config: S3Config) {
        this.prefix = trimSlashes(config.prefix);
        // Keyed on where the data actually is. Repointing at another bucket has
        // to invalidate the previous-sync record, or it would licence deletions
        // based on files that never existed there.
        this.id = `s3-${fnv1a(`${config.endpoint}|${config.region}|${config.bucket}|${this.prefix}`)}`;
    }

    // ── Connection ───────────────────────────────────

    async checkConnection(): Promise<ConnectionResult> {
        try {
            const res = await this.send('GET', '', { 'list-type': '2', 'max-keys': '1' });
            if (res.status === 403) {
                return { ok: false, error: 'The bucket refused these credentials.' };
            }
            if (res.status === 404) {
                return { ok: false, error: 'No such bucket at that endpoint.' };
            }
            if (res.status >= 400) {
                return { ok: false, error: describeS3Error(res.text, res.status) };
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── Listing ──────────────────────────────────────

    async list(): Promise<FileEntity[]> {
        const out: FileEntity[] = [];
        let token: string | undefined;

        do {
            const query: Record<string, string> = {
                'list-type': '2',
                // Keys come back percent-encoded, which sidesteps both XML
                // escaping and any argument about how a non-ASCII key is
                // represented in the response body.
                'encoding-type': 'url',
                'max-keys': '1000',
            };
            if (this.prefix) query.prefix = `${this.prefix}/`;
            if (token) query['continuation-token'] = token;

            const res = await this.send('GET', '', query);
            if (res.status >= 400) throw new Error(describeS3Error(res.text, res.status));

            const page = parseListObjects(res.text);
            for (const object of page.objects) {
                const key = this.stripPrefix(object.key);
                // A "folder" in S3 is a zero-byte key ending in a slash, written
                // by consoles that pretend the flat namespace is a tree.
                if (key === null || key === '' || key.endsWith('/')) continue;
                out.push({
                    key,
                    size: object.size,
                    // A listing cannot say when the user wrote the file, only
                    // when S3 stored it. Mirroring the server time here is
                    // honest about that; see the note on MTIME_META.
                    mtimeCli: object.mtimeSvr,
                    mtimeSvr: object.mtimeSvr,
                    etag: object.etag,
                });
            }
            token = page.nextToken;
        } while (token);

        return out;
    }

    /**
     * HEAD one object.
     *
     * The listing is a paged walk of the whole prefix; this is one request, and
     * the engine calls it once per transferred file. `x-amz-meta-zenith-mtime`
     * comes back on a HEAD where it does not appear in a listing at all, so a
     * single object read this way actually knows more about itself than the
     * listing did.
     */
    async stat(key: string): Promise<FileEntity | null> {
        const res = await this.send('HEAD', this.objectPath(key));
        if (res.status === 404) return null;
        if (res.status >= 400) throw new Error(describeS3Error(res.text, res.status));

        const headers = lowerKeys(res.headers);
        const size = Number(headers['content-length']);
        const stored = Number(headers[MTIME_META]);
        const svr = Date.parse(headers['last-modified'] ?? '');
        const mtimeSvr = Number.isFinite(svr) ? svr : Date.now();

        return {
            key,
            size: Number.isFinite(size) ? size : 0,
            // The metadata header is the only place the user's own edit time
            // survives a round trip through S3; without it the store time is
            // the honest answer, even though it is not the same question.
            mtimeCli: Number.isFinite(stored) ? stored : mtimeSvr,
            mtimeSvr,
            etag: (headers.etag ?? '').replace(/^(W\/)?"|"$/g, '') || undefined,
        };
    }

    // ── Transfer ─────────────────────────────────────

    async readBinary(key: string): Promise<ArrayBuffer> {
        const res = await this.send('GET', this.objectPath(key));
        if (res.status >= 400) throw new Error(describeS3Error(res.text, res.status));
        return res.arrayBuffer;
    }

    async write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity> {
        const res = await this.send('PUT', this.objectPath(key), {}, data, {
            [MTIME_META]: String(mtimeCli),
        });
        if (res.status >= 400) throw new Error(describeS3Error(res.text, res.status));

        // The etag comes straight back on the PUT, so there is no need to list
        // again just to learn the object's new version.
        const etag = (lowerKeys(res.headers).etag ?? '').replace(/^(W\/)?"|"$/g, '');
        return {
            key,
            size: data.byteLength,
            mtimeCli,
            // S3 does not report its store time on a PUT, and asking would cost
            // a round trip per file. The client time stands in for it here, and
            // the etag — which S3 does return — is what the next comparison
            // actually uses, so the substitution costs nothing.
            mtimeSvr: mtimeCli,
            etag: etag || undefined,
        };
    }

    async remove(key: string): Promise<void> {
        const res = await this.send('DELETE', this.objectPath(key));
        // S3 answers 204 for a key that was not there, which is the outcome we
        // wanted anyway.
        if (res.status >= 400 && res.status !== 404) {
            throw new Error(describeS3Error(res.text, res.status));
        }
    }

    // ── Request plumbing ─────────────────────────────

    private objectPath(key: string): string {
        return this.prefix ? `${this.prefix}/${key}` : key;
    }

    /** Drop the configured prefix, or null when the key is outside it. */
    private stripPrefix(key: string): string | null {
        if (!this.prefix) return key;
        if (key === this.prefix) return '';
        return key.startsWith(`${this.prefix}/`) ? key.slice(this.prefix.length + 1) : null;
    }

    private async send(
        method: string,
        path: string,
        query: Record<string, string> = {},
        body?: ArrayBuffer,
        extraHeaders: Record<string, string> = {}
    ) {
        const { origin, host, basePath } = this.address();
        const fullPath = [basePath, path].filter(Boolean).join('/');

        const payloadHash = body ? await sha256Hex(body) : EMPTY_SHA256;
        const signed = await signRequest({
            method,
            path: fullPath,
            query,
            headers: { host, ...extraHeaders },
            payloadHash,
            region: this.config.region,
            service: 's3',
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
            sessionToken: this.config.sessionToken || undefined,
            now: new Date(),
        });

        const qs = Object.keys(query).length
            ? `?${Object.keys(query)
                  .sort()
                  .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
                  .join('&')}`
            : '';

        return requestUrl({
            url: `${origin}/${encodePath(fullPath)}${qs}`,
            method,
            // Statuses are read rather than thrown on: 404 is an ordinary answer
            // here, and an exception would lose the code and the error body.
            throw: false,
            headers: signed.headers,
            body,
        });
    }

    /**
     * Where to send the request, and what `host` to sign.
     *
     * Virtual-host style (`bucket.endpoint`) is what AWS itself expects;
     * path-style (`endpoint/bucket`) is what most self-hosted and S3-compatible
     * servers need, because they have no wildcard DNS. The two put the bucket in
     * different places, and the signature covers both — so this has to be
     * decided once and used for the URL and the signed host alike.
     */
    private address(): { origin: string; host: string; basePath: string } {
        const base = this.config.endpoint.replace(/\/+$/, '');
        const url = new URL(base);

        if (this.config.forcePathStyle) {
            return { origin: base, host: url.host, basePath: this.config.bucket };
        }

        const host = `${this.config.bucket}.${url.host}`;
        return { origin: `${url.protocol}//${host}`, host, basePath: '' };
    }
}

// ── Response parsing ─────────────────────────────────

export interface ListedObject {
    key: string;
    size: number;
    mtimeSvr: number;
    etag?: string;
}

export interface ListPage {
    objects: ListedObject[];
    nextToken?: string;
}

/**
 * Read a `ListObjectsV2` response.
 *
 * Deliberately not `DOMParser`. The response shape is flat and fixed, and doing
 * it with string extraction means this can be TESTED — the plugin's tests run in
 * Node, which has no DOM, and an untestable parser sitting between the engine
 * and the user's files is a worse trade than a slightly less general one.
 *
 * Exported for that reason.
 */
export function parseListObjects(xml: string): ListPage {
    const objects: ListedObject[] = [];

    for (const block of blocks(xml, 'Contents')) {
        const key = tag(block, 'Key');
        if (key === null) continue;

        const size = Number(tag(block, 'Size') ?? '0');
        const modified = tag(block, 'LastModified');
        const parsed = modified ? Date.parse(modified) : NaN;

        objects.push({
            // `encoding-type=url` was requested, so keys arrive percent-encoded.
            key: safeDecode(unescapeXml(key)),
            size: Number.isFinite(size) ? size : 0,
            mtimeSvr: Number.isFinite(parsed) ? parsed : 0,
            etag: (tag(block, 'ETag') ?? '').replace(/^(?:&quot;|")|(?:&quot;|")$/g, '') || undefined,
        });
    }

    // Truncated listings continue from a token; without following it a large
    // bucket would silently look like its first thousand keys — and the missing
    // ones would read as "deleted remotely".
    const truncated = tag(xml, 'IsTruncated') === 'true';
    const nextToken = tag(xml, 'NextContinuationToken');

    return {
        objects,
        nextToken: truncated && nextToken ? safeDecode(unescapeXml(nextToken)) : undefined,
    };
}

function* blocks(xml: string, name: string): Generator<string> {
    const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(xml)) !== null) yield match[1];
}

function tag(scope: string, name: string): string | null {
    const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(scope);
    return match ? match[1].trim() : null;
}

function unescapeXml(input: string): string {
    return input
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Ampersand last, so `&amp;lt;` does not become `<`.
        .replace(/&amp;/g, '&');
}

function safeDecode(input: string): string {
    try {
        return decodeURIComponent(input);
    } catch {
        // Malformed encoding from the wire must not abort the whole listing.
        return input;
    }
}

/**
 * Turn an S3 error body into something worth showing.
 *
 * S3's own `<Message>` is usually clearer than anything invented here — "The
 * request signature we calculated does not match" points straight at the
 * problem, where "HTTP 403" does not.
 */
export function describeS3Error(body: string, status: number): string {
    const code = tag(body ?? '', 'Code');
    const message = tag(body ?? '', 'Message');
    if (message) return code ? `${message} (${code})` : message;
    return `The server answered ${status}.`;
}

// ── Helpers ──────────────────────────────────────────

function trimSlashes(s: string): string {
    return (s ?? '').replace(/^\/+|\/+$/g, '');
}

function encodePath(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

/**
 * Response headers, lower-cased.
 *
 * S3-compatible servers disagree about the casing they send back — `ETag` from
 * AWS, `etag` from several others — and a lookup that guesses wrong reads as
 * "the server sent no etag", which quietly downgrades the comparison to size
 * and time.
 */
function lowerKeys(headers: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers ?? {})) out[key.toLowerCase()] = value;
    return out;
}
