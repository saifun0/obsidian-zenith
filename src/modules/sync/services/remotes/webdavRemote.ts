import { requestUrl } from 'obsidian';
import { fnv1a } from '../../../../core/hash';
import type { FileEntity } from '../../fileSyncTypes';
import type { ConnectionResult, SyncRemote, WebdavConfig } from './types';

/**
 * WebDAV backend.
 *
 * Chosen as the first one because it needs nothing but HTTP verbs and a
 * password: no SDK, no OAuth dance, no vendor console. Obsidian's `requestUrl`
 * carries arbitrary methods and bodies and is not subject to the renderer's CORS
 * rules, so PROPFIND and MKCOL work on desktop and on mobile alike — which
 * `fetch` would not.
 *
 * ── On timestamps ──
 *
 * `X-OC-Mtime` is sent on every upload. Nextcloud and ownCloud honour it and
 * store the client's own mtime, which makes "the same edit, synced twice"
 * recognisable across devices. Every other server ignores the header harmlessly.
 * Nothing here DEPENDS on it: the previous-sync record keeps each side's
 * timestamps separately (see `PrevSyncRecord`), so a server that stamps its own
 * clock still compares correctly against its own past.
 */

/** DAV namespace, for namespace-aware parsing. */
const DAV_NS = 'DAV:';

export class WebdavRemote implements SyncRemote {
    readonly kind = 'webdav' as const;
    readonly id: string;

    private readonly base: string;
    private readonly root: string;
    private readonly auth: string;

    constructor(private readonly config: WebdavConfig) {
        this.base = stripTrailingSlash(config.url);
        this.root = trimSlashes(config.remoteDir);
        // Keyed on address and account, not on a name: pointing at a different
        // server must invalidate the previous-sync record, or it would licence
        // deletions based on files that never existed there.
        this.id = `webdav-${fnv1a(`${this.base}|${this.root}|${config.username}`)}`;
        this.auth = `Basic ${base64(`${config.username}:${config.password}`)}`;
    }

    // ── Connection ───────────────────────────────────

    async checkConnection(): Promise<ConnectionResult> {
        try {
            const res = await this.dav('PROPFIND', this.dirUrl(''), {
                headers: { Depth: '0' },
                body: PROPFIND_BODY,
            });

            if (res.status === 401 || res.status === 403) {
                return { ok: false, error: 'The server rejected the username or password.' };
            }
            if (res.status === 404) {
                // The folder not existing is not a failure — the first upload
                // creates it. Anything else at this point is.
                return { ok: true };
            }
            if (res.status >= 400) {
                return { ok: false, error: `The server answered ${res.status}.` };
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: describe(err) };
        }
    }

    // ── Listing ──────────────────────────────────────

    /**
     * Walk the tree with `Depth: 1` rather than asking for `infinity`.
     *
     * Plenty of servers refuse infinite depth outright (it is optional in the
     * spec and a denial-of-service risk), and those that allow it can time out
     * on a large vault. One request per folder is more round trips but works
     * everywhere and fails one folder at a time.
     */
    async list(): Promise<FileEntity[]> {
        const out: FileEntity[] = [];
        const queue = [''];
        const seen = new Set<string>();

        while (queue.length > 0) {
            const dir = queue.shift() as string;
            if (seen.has(dir)) continue;
            seen.add(dir);

            const res = await this.dav('PROPFIND', this.dirUrl(dir), {
                headers: { Depth: '1' },
                body: PROPFIND_BODY,
            });

            // A folder that is not there yet simply has nothing in it.
            if (res.status === 404) continue;
            if (res.status >= 400) {
                throw new Error(`PROPFIND ${dir || '/'} answered ${res.status}`);
            }

            for (const entry of parsePropfind(res.text, this.basePath(), this.root)) {
                // The folder describes itself in its own listing; skipping it is
                // what stops the walk looping.
                if (entry.key === dir) continue;
                if (entry.isFolder) queue.push(entry.key);
                else out.push(entry.entity);
            }
        }

        return out;
    }

    // ── Transfer ─────────────────────────────────────

    async readBinary(key: string): Promise<ArrayBuffer> {
        const res = await this.dav('GET', this.fileUrl(key));
        if (res.status >= 400) throw new Error(`GET ${key} answered ${res.status}`);
        return res.arrayBuffer;
    }

    async write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity> {
        await this.ensureParents(key);

        const res = await this.dav('PUT', this.fileUrl(key), {
            body: data,
            headers: {
                // Seconds, not milliseconds — the header is defined that way.
                'X-OC-Mtime': String(Math.floor(mtimeCli / 1000)),
            },
        });
        if (res.status >= 400) throw new Error(`PUT ${key} answered ${res.status}`);

        // Ask what the server actually stored rather than assuming it took what
        // we sent; the answer is what goes into the previous-sync record.
        const stored = await this.statOne(key);
        return (
            stored ?? {
                key,
                size: data.byteLength,
                mtimeCli,
                mtimeSvr: Date.now(),
            }
        );
    }

    async remove(key: string): Promise<void> {
        const res = await this.dav('DELETE', this.fileUrl(key));
        // Already gone is the outcome we wanted.
        if (res.status === 404) return;
        if (res.status >= 400) throw new Error(`DELETE ${key} answered ${res.status}`);
    }

    // ── Internals ────────────────────────────────────

    /** One PROPFIND for a single path, used to read back what an upload stored. */
    private async statOne(key: string): Promise<FileEntity | null> {
        const res = await this.dav('PROPFIND', this.fileUrl(key), {
            headers: { Depth: '0' },
            body: PROPFIND_BODY,
        });
        if (res.status >= 400) return null;

        const entries = parsePropfind(res.text, this.basePath(), this.root);
        const found = entries.find((e) => !e.isFolder);
        return found ? found.entity : null;
    }

    /**
     * Create every missing folder above `key`.
     *
     * MKCOL creates exactly one level, so the path is walked from the top. A 405
     * means the collection is already there, which is the common case and not an
     * error.
     */
    private async ensureParents(key: string): Promise<void> {
        const parts = key.split('/').slice(0, -1);
        let cursor = '';
        for (const part of parts) {
            cursor = cursor ? `${cursor}/${part}` : part;
            const res = await this.dav('MKCOL', this.dirUrl(cursor));
            if (res.status === 405 || res.status === 301) continue; // already exists
            if (res.status >= 400 && res.status !== 409) {
                throw new Error(`MKCOL ${cursor} answered ${res.status}`);
            }
        }
    }

    private dav(
        method: string,
        url: string,
        extra: { headers?: Record<string, string>; body?: string | ArrayBuffer } = {}
    ) {
        return requestUrl({
            url,
            method,
            // Statuses are inspected rather than thrown on: 404 and 405 are
            // ordinary answers here, and an exception would lose the code.
            throw: false,
            headers: {
                Authorization: this.auth,
                ...(extra.body && method !== 'PUT' ? { 'Content-Type': 'application/xml' } : {}),
                ...extra.headers,
            },
            body: extra.body,
        });
    }

    /** Path component of the configured base URL, for resolving hrefs. */
    private basePath(): string {
        try {
            return trimSlashes(new URL(this.base).pathname);
        } catch {
            return '';
        }
    }

    private dirUrl(key: string): string {
        const full = [this.root, key].filter(Boolean).join('/');
        return `${this.base}/${encodePath(full)}/`;
    }

    private fileUrl(key: string): string {
        const full = [this.root, key].filter(Boolean).join('/');
        return `${this.base}/${encodePath(full)}`;
    }
}

// ── PROPFIND ─────────────────────────────────────────

/**
 * Ask for exactly the four properties the engine uses.
 *
 * `allprop` would be shorter to write and much larger to parse: some servers
 * answer it with dozens of properties per entry, including per-file ACLs.
 */
const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:getetag/>
  </d:prop>
</d:propfind>`;

interface ParsedEntry {
    key: string;
    isFolder: boolean;
    entity: FileEntity;
}

/**
 * Read a multistatus response into entries keyed relative to the sync root.
 *
 * Namespace-aware rather than tag-name matching: servers disagree on the prefix
 * (`d:`, `D:`, `lp1:`, none at all), and matching on the literal string is the
 * classic way a WebDAV client works against one server and silently returns
 * nothing against another.
 *
 * Exported for testing — this parser handles input from arbitrary servers, which
 * is exactly the sort of thing that deserves cases pinned down.
 */
export function parsePropfind(xml: string, basePath: string, root: string): ParsedEntry[] {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const responses = Array.from(doc.getElementsByTagNameNS(DAV_NS, 'response'));
    const out: ParsedEntry[] = [];

    for (const response of responses) {
        const href = textOf(response, 'href');
        if (!href) continue;

        const key = hrefToKey(href, basePath, root);
        if (key === null) continue;

        const isFolder =
            response.getElementsByTagNameNS(DAV_NS, 'collection').length > 0 ||
            href.endsWith('/');

        const size = Number(textOf(response, 'getcontentlength') ?? '0') || 0;
        const lastModified = textOf(response, 'getlastmodified');
        const mtimeSvr = lastModified ? Date.parse(lastModified) : NaN;
        const svr = Number.isFinite(mtimeSvr) ? mtimeSvr : 0;
        const etag = (textOf(response, 'getetag') ?? '').replace(/^(W\/)?"|"$/g, '') || undefined;

        out.push({
            key,
            isFolder,
            // `mtimeCli` mirrors the server time here: a listing cannot say when
            // the user wrote the file, only when the server stored it. The
            // previous-sync record keeps the two sides apart, so this never
            // pretends to be a client timestamp we actually knew.
            entity: { key, size, mtimeCli: svr, mtimeSvr: svr, etag },
        });
    }

    return out;
}

/** First matching child's text, namespace-aware. */
function textOf(scope: Element, localName: string): string | null {
    const el = scope.getElementsByTagNameNS(DAV_NS, localName)[0];
    return el?.textContent?.trim() || null;
}

/**
 * Turn an href into a path relative to the sync root, or null if it is outside.
 *
 * Hrefs come back in every shape the spec allows: absolute URLs, absolute paths,
 * percent-encoded, with or without a trailing slash. Anything that does not land
 * under the configured root is discarded rather than guessed at — a mis-resolved
 * path here would have the engine acting on someone else's files.
 */
export function hrefToKey(href: string, basePath: string, root: string): string | null {
    let path = href;
    try {
        // Absolute URLs resolve; bare paths throw and are used as-is.
        path = new URL(href, 'http://placeholder.invalid').pathname;
    } catch {
        // Keep `href` as the path.
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        decoded = path;
    }
    decoded = trimSlashes(decoded);

    const prefix = [basePath, root].filter(Boolean).join('/');
    if (!prefix) return decoded;
    if (decoded === prefix) return '';
    if (!decoded.startsWith(`${prefix}/`)) return null;
    return decoded.slice(prefix.length + 1);
}

// ── Small helpers ────────────────────────────────────

function stripTrailingSlash(s: string): string {
    return s.replace(/\/+$/, '');
}

function trimSlashes(s: string): string {
    return s.replace(/^\/+|\/+$/g, '');
}

/** Percent-encode each segment, leaving the separators alone. */
function encodePath(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map((s) => encodeURIComponent(s))
        .join('/');
}

/**
 * Base64 for the Authorization header.
 *
 * `btoa` only accepts Latin-1, and a password with a non-ASCII character in it
 * throws — so the string is UTF-8 encoded first, which is what the header
 * actually wants.
 */
function base64(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
