import { requestUrl } from 'obsidian';
import { fnv1a } from '../../../../core/hash';
import type { FileEntity } from '../../fileSyncTypes';
import {
    parseDeviceCodeStart,
    readPoll,
    type DeviceCodeStart,
    type PostForm,
    type PollOutcome,
} from './oauth';
import { OAuthSession, postForm, safeJson, type TokenStore } from './oauthSession';
import type { ConnectionResult, OneDriveConfig, SyncRemote } from './types';

/**
 * OneDrive, over Microsoft Graph.
 *
 * ── The device authorization grant ──
 *
 * Microsoft implements the device grant, which is the cleanest answer to a
 * problem every OAuth provider poses here: there is nowhere for a redirect to
 * land. `obsidian://` is not an https URL, and no plugin can listen on a port on
 * iOS or Android. With the device grant there is no redirect at all — the plugin
 * shows a short code, the user types it into a browser on any device, and the
 * plugin polls until it is approved. It works identically on a phone and a
 * desktop, which none of the redirect-based flows manage.
 */

const DEVICE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * `offline_access` is what makes Microsoft issue a refresh token.
 *
 * Without it the connection dies in an hour with no explanation, which is a
 * miserable thing to diagnose. `Files.ReadWrite` covers the user's own drive
 * without asking for the tenant-wide `.All` variant, which needs an
 * administrator to approve it.
 */
const SCOPES = ['Files.ReadWrite', 'offline_access'];

/** Graph's ceiling for a one-shot upload. Past it, an upload session. */
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;

/**
 * Upload chunk size: 5 MiB, which is a whole multiple of the 320 KiB Graph
 * insists every chunk but the last is a multiple of.
 */
export const CHUNK_SIZE = 5 * 1024 * 1024;

export class OneDriveRemote implements SyncRemote {
    readonly kind = 'onedrive' as const;
    readonly id: string;

    private readonly root: string;
    private readonly session: OAuthSession;

    constructor(config: OneDriveConfig, store: TokenStore, post: PostForm = postForm) {
        this.root = (config.folder ?? '').replace(/^\/+|\/+$/g, '');
        this.id = `onedrive-${fnv1a(`${config.clientId}|${this.root}`)}`;
        this.session = new OAuthSession(
            { tokenUrl: TOKEN_URL, clientId: config.clientId },
            store,
            post
        );
    }

    // ── Authorization ────────────────────────────────

    /** Ask Microsoft for a code the user can type in somewhere else. */
    static async startDeviceAuth(
        clientId: string,
        post: PostForm = postForm,
        now = Date.now()
    ): Promise<DeviceCodeStart | { error: string }> {
        const res = await post(DEVICE_URL, { client_id: clientId, scope: SCOPES.join(' ') });
        const start = parseDeviceCodeStart(res.json, now);
        if (start) return start;

        const body = (res.json ?? {}) as Record<string, unknown>;
        return {
            error:
                typeof body.error_description === 'string'
                    ? body.error_description
                    : `Microsoft answered ${res.status}.`,
        };
    }

    /** One poll of the device grant. The caller owns the waiting. */
    static async pollDeviceAuth(
        clientId: string,
        deviceCode: string,
        post: PostForm = postForm,
        now = Date.now()
    ): Promise<PollOutcome> {
        const res = await post(TOKEN_URL, {
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            client_id: clientId,
            device_code: deviceCode,
        });
        return readPoll(res.status, res.json, now);
    }

    async checkConnection(): Promise<ConnectionResult> {
        try {
            const res = await this.graph('GET', '/me/drive');
            if (res.status === 401) {
                return { ok: false, error: 'Microsoft rejected the connection — authorize again.' };
            }
            if (res.status >= 400) {
                return { ok: false, error: describeGraphError(res.text, res.status) };
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── Listing ──────────────────────────────────────

    /**
     * Walk the tree folder by folder.
     *
     * Graph offers a `delta` feed that would be cheaper, but it is stateful —
     * it hands back a token describing what changed since last time, which is a
     * second, parallel notion of "what changed" alongside the previous-sync
     * record the engine already keeps. Two of those disagreeing is exactly the
     * class of bug that deletes files, so this asks for the plain truth instead.
     */
    async list(): Promise<FileEntity[]> {
        const out: FileEntity[] = [];
        const queue = [''];
        const seen = new Set<string>();

        while (queue.length > 0) {
            const dir = queue.shift() as string;
            if (seen.has(dir)) continue;
            seen.add(dir);

            let url = `${GRAPH}${this.childrenPath(dir)}?$top=200&$select=name,size,file,folder,fileSystemInfo,eTag`;
            for (;;) {
                const res = await this.graphUrl('GET', url);
                // A folder that is not there yet simply has nothing in it.
                if (res.status === 404) break;
                if (res.status >= 400) throw new Error(describeGraphError(res.text, res.status));

                const page = parseChildren(safeJson(res.text));
                for (const child of page.items) {
                    const key = dir ? `${dir}/${child.name}` : child.name;
                    if (child.isFolder) queue.push(key);
                    else out.push({ ...child.entity, key });
                }

                if (!page.nextLink) break;
                url = page.nextLink;
            }
        }

        return out;
    }

    // ── Transfer ─────────────────────────────────────

    async readBinary(key: string): Promise<ArrayBuffer> {
        const res = await this.graph('GET', `${this.itemPath(key)}/content`);
        if (res.status >= 400) throw new Error(describeGraphError(res.text, res.status));
        return res.arrayBuffer;
    }

    async write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity> {
        const stored =
            data.byteLength > SIMPLE_UPLOAD_LIMIT
                ? await this.uploadSession(key, data, mtimeCli)
                : await this.uploadSimple(key, data, mtimeCli);

        return {
            key,
            size: stored?.size ?? data.byteLength,
            mtimeCli: stored?.mtimeCli ?? mtimeCli,
            mtimeSvr: stored?.mtimeSvr ?? Date.now(),
            etag: stored?.etag,
        };
    }

    async remove(key: string): Promise<void> {
        const res = await this.graph('DELETE', this.itemPath(key));
        // Already gone is the outcome we wanted.
        if (res.status === 404) return;
        if (res.status >= 400) throw new Error(describeGraphError(res.text, res.status));
    }

    // ── Uploading ────────────────────────────────────

    private async uploadSimple(key: string, data: ArrayBuffer, mtimeCli: number) {
        const res = await this.graph('PUT', `${this.itemPath(key)}/content`, data, {
            'Content-Type': 'application/octet-stream',
        });
        if (res.status >= 400) throw new Error(describeGraphError(res.text, res.status));

        // A one-shot upload cannot carry `fileSystemInfo`, so the edit time is
        // stamped afterwards. It is not fatal if this fails — the previous-sync
        // record compares each side against its own past — so a rejection here
        // does not abort the file that just uploaded successfully.
        await this.stampMtime(key, mtimeCli);
        return parseItem(safeJson(res.text));
    }

    /**
     * Chunked upload, for anything over Graph's four-megabyte limit.
     *
     * The session URL is pre-authorized, so the chunks deliberately carry no
     * Authorization header — Graph rejects the request if one is present.
     */
    private async uploadSession(key: string, data: ArrayBuffer, mtimeCli: number) {
        const create = await this.graph('POST', `${this.itemPath(key)}/createUploadSession`, {
            item: {
                '@microsoft.graph.conflictBehavior': 'replace',
                // Here the edit time CAN travel with the upload itself.
                fileSystemInfo: { lastModifiedDateTime: new Date(mtimeCli).toISOString() },
            },
        });
        if (create.status >= 400) throw new Error(describeGraphError(create.text, create.status));

        const uploadUrl = (safeJson(create.text) as Record<string, unknown>).uploadUrl;
        if (typeof uploadUrl !== 'string') {
            throw new Error('Microsoft did not return an upload session.');
        }

        let last: ReturnType<typeof parseItem> = null;
        for (const range of chunkRanges(data.byteLength, CHUNK_SIZE)) {
            const res = await requestUrl({
                url: uploadUrl,
                method: 'PUT',
                throw: false,
                headers: {
                    'Content-Length': String(range.end - range.start + 1),
                    'Content-Range': `bytes ${range.start}-${range.end}/${data.byteLength}`,
                },
                body: data.slice(range.start, range.end + 1),
            });
            // 202 means "chunk accepted, send the next"; 200/201 comes with the
            // finished item on the last one.
            if (res.status >= 400) throw new Error(describeGraphError(res.text, res.status));
            if (res.status < 300) last = parseItem(safeJson(res.text));
        }
        return last;
    }

    private async stampMtime(key: string, mtimeCli: number): Promise<void> {
        try {
            await this.graph('PATCH', this.itemPath(key), {
                fileSystemInfo: { lastModifiedDateTime: new Date(mtimeCli).toISOString() },
            });
        } catch {
            // See the note at the call site: losing the stamp costs fidelity,
            // not correctness.
        }
    }

    // ── Request plumbing ─────────────────────────────

    /** A Graph call by path, relative to the service root. */
    private graph(
        method: string,
        path: string,
        body?: unknown,
        headers: Record<string, string> = {}
    ) {
        return this.graphUrl(method, `${GRAPH}${path}`, body, headers);
    }

    /**
     * A Graph call by absolute URL.
     *
     * Needed as well as `graph` because `@odata.nextLink` comes back fully
     * formed, complete with a skip token that must be sent back verbatim —
     * taking it apart to rebuild it would be a way to corrupt it.
     */
    private async graphUrl(
        method: string,
        url: string,
        body?: unknown,
        headers: Record<string, string> = {}
    ) {
        const isBinary = body instanceof ArrayBuffer;
        return requestUrl({
            url,
            method,
            // The status is read rather than thrown on: 404 is an ordinary
            // answer here, and Graph's error body names the real problem.
            throw: false,
            headers: {
                Authorization: `Bearer ${await this.session.accessToken()}`,
                ...(body !== undefined && !isBinary ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body === undefined ? undefined : isBinary ? body : JSON.stringify(body),
        });
    }

    /** `/me/drive/root/children` at the top, the addressed form below it. */
    private childrenPath(dir: string): string {
        const full = [this.root, dir].filter(Boolean).join('/');
        return full ? `/me/drive/root:/${encodeGraphPath(full)}:/children` : '/me/drive/root/children';
    }

    private itemPath(key: string): string {
        const full = [this.root, key].filter(Boolean).join('/');
        return `/me/drive/root:/${encodeGraphPath(full)}:`;
    }
}

// ── Response reading ─────────────────────────────────

export interface GraphChild {
    name: string;
    isFolder: boolean;
    entity: Omit<FileEntity, 'key'> & { key: string };
}

export interface GraphPage {
    items: GraphChild[];
    nextLink?: string;
}

export function parseChildren(raw: unknown): GraphPage {
    const body = (raw ?? {}) as Record<string, unknown>;
    const value = Array.isArray(body.value) ? body.value : [];
    const items: GraphChild[] = [];

    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Record<string, unknown>;
        const name = typeof item.name === 'string' ? item.name : '';
        if (!name) continue;

        const isFolder = !!item.folder;
        const parsed = parseItem(item);
        items.push({
            name,
            isFolder,
            entity: {
                key: name,
                size: parsed?.size ?? 0,
                mtimeCli: parsed?.mtimeCli ?? 0,
                mtimeSvr: parsed?.mtimeSvr ?? 0,
                etag: parsed?.etag,
            },
        });
    }

    const next = body['@odata.nextLink'];
    return { items, nextLink: typeof next === 'string' ? next : undefined };
}

export interface GraphItem {
    size: number;
    /** From `fileSystemInfo`, which is the client's own edit time. */
    mtimeCli: number;
    /** `lastModifiedDateTime` on the item — when the service stored it. */
    mtimeSvr: number;
    etag?: string;
}

export function parseItem(raw: unknown): GraphItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;

    const fsInfo = (item.fileSystemInfo ?? {}) as Record<string, unknown>;
    const cli =
        typeof fsInfo.lastModifiedDateTime === 'string' ? Date.parse(fsInfo.lastModifiedDateTime) : NaN;
    const svr =
        typeof item.lastModifiedDateTime === 'string' ? Date.parse(item.lastModifiedDateTime) : NaN;

    const serverTime = Number.isFinite(svr) ? svr : 0;
    return {
        size: typeof item.size === 'number' ? item.size : 0,
        // `fileSystemInfo` is the whole reason to ask for it: it carries the
        // time the file was written on the device that uploaded it. Falling back
        // to the service's own time is honest when it is missing.
        mtimeCli: Number.isFinite(cli) ? cli : serverTime,
        mtimeSvr: serverTime,
        etag: typeof item.eTag === 'string' ? item.eTag : undefined,
    };
}

/**
 * Encode a path for Graph's `root:/…:` addressing.
 *
 * Segment by segment, keeping the separators. `#` and `?` in a filename would
 * otherwise be read as a fragment or a query and silently address the wrong
 * item — which for a DELETE is not a silent problem for long.
 */
export function encodeGraphPath(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}

/** Byte ranges for a chunked upload, inclusive on both ends as Graph wants. */
export function chunkRanges(total: number, chunkSize: number): Array<{ start: number; end: number }> {
    const out: Array<{ start: number; end: number }> = [];
    if (total <= 0) return out;
    for (let start = 0; start < total; start += chunkSize) {
        out.push({ start, end: Math.min(start + chunkSize, total) - 1 });
    }
    return out;
}

/** Graph nests the useful part inside `error.message`. */
export function describeGraphError(body: string, status: number): string {
    const parsed = safeJson(body) as Record<string, unknown>;
    const error = (parsed.error ?? {}) as Record<string, unknown>;
    if (typeof error.message === 'string' && error.message) return error.message;
    if (typeof parsed.error_description === 'string' && parsed.error_description) {
        return parsed.error_description;
    }
    return `Microsoft answered ${status}.`;
}
