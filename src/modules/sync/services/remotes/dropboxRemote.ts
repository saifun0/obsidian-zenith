import { fnv1a } from '../../../../core/hash';
import type { FileEntity } from '../../fileSyncTypes';
import { obsidianHttp, withRetry, type Http, type RetryOptions } from './http';
import { buildAuthUrl, exchangeCode, type PostForm } from './oauth';
import { OAuthSession, postForm, safeJson, type TokenStore } from './oauthSession';
import type { ConnectionResult, DropboxConfig, SyncRemote } from './types';

/**
 * Dropbox backend.
 *
 * The best-behaved of the remotes here, for one specific reason: `client_modified`
 * on upload and in the listing. Dropbox is the only provider in this module that
 * stores and returns the time the USER edited a file rather than the time the
 * server received it — so "the same edit, made once and synced twice" is
 * recognisable, which neither WebDAV nor S3 can manage.
 *
 * It is also the strictest about how often it will hear from you. Every call
 * goes through `withRetry`, which waits out a 429 rather than reporting the file
 * as failed; without that a first sync of a real vault stops a few dozen files
 * in, with most of the vault still on one side.
 *
 * ── Authorization without a redirect ──
 *
 * No `redirect_uri` is sent, which makes Dropbox display the authorization code
 * for the user to paste back. That is one more step than a redirect, and it is
 * the only shape that works on a phone: `obsidian://` is not an https URL, and a
 * plugin cannot listen on a port on iOS or Android.
 */

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const RPC = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

/**
 * Above this, upload in pieces.
 *
 * Dropbox's one-shot endpoint accepts up to 150 MB, so this sits well under what
 * it allows. The reason is memory rather than the API limit: a single request
 * holds the whole file, and Obsidian's mobile webview is not the place to hand
 * a hundred megabytes to the network stack in one go.
 */
export const SIMPLE_UPLOAD_LIMIT = 8 * 1024 * 1024;

/** Bytes per `append_v2` call. Dropbox asks for a multiple of 4 MB. */
export const UPLOAD_CHUNK = 8 * 1024 * 1024;

export interface DropboxDeps {
    /** Token-endpoint transport; form-encoded, separate from the data path. */
    post?: PostForm;
    http?: Http;
    retry?: Partial<RetryOptions>;
}

export class DropboxRemote implements SyncRemote {
    readonly kind = 'dropbox' as const;
    readonly id: string;

    private readonly root: string;
    private readonly session: OAuthSession;
    private readonly http: Http;

    constructor(config: DropboxConfig, store: TokenStore, deps: DropboxDeps = {}) {
        this.root = normalizeFolder(config.folder);
        this.id = `dropbox-${fnv1a(`${config.clientId}|${this.root}`)}`;
        this.http = withRetry(deps.http ?? obsidianHttp, deps.retry);
        this.session = new OAuthSession(
            { tokenUrl: TOKEN_URL, clientId: config.clientId },
            store,
            deps.post ?? postForm
        );
    }

    // ── Authorization ────────────────────────────────

    /**
     * The page the user opens to approve access.
     *
     * `token_access_type=offline` is what makes Dropbox issue a refresh token.
     * Without it the connection works for four hours and then silently stops,
     * which is a maddening thing to debug.
     */
    static authorizeUrl(clientId: string, challenge: string): string {
        return buildAuthUrl({
            authUrl: AUTH_URL,
            clientId,
            challenge,
            extra: { token_access_type: 'offline' },
        });
    }

    static async completeAuthorization(
        clientId: string,
        code: string,
        verifier: string,
        post: PostForm = postForm,
        now = Date.now()
    ) {
        return exchangeCode(post, { tokenUrl: TOKEN_URL, clientId, code, verifier }, now);
    }

    async checkConnection(): Promise<ConnectionResult> {
        try {
            const res = await this.rpc('/users/get_current_account', null);
            if (res.status === 401) {
                return { ok: false, error: 'Dropbox rejected the connection — authorize again.' };
            }
            if (res.status >= 400) {
                return { ok: false, error: describeDropboxError(res.text, res.status) };
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── Listing ──────────────────────────────────────

    async list(): Promise<FileEntity[]> {
        const out: FileEntity[] = [];

        let res = await this.rpc('/files/list_folder', {
            path: this.root,
            recursive: true,
            limit: 2000,
        });
        // A folder that does not exist yet simply has nothing in it; the first
        // upload creates it.
        if (isNotFound(res.status, res.text)) return out;
        if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));

        for (;;) {
            const page = parseListing(safeJson(res.text));
            for (const entry of page.entries) {
                const key = this.stripRoot(entry.path);
                if (key === null || key === '') continue;
                out.push(entry.entity(key));
            }
            if (!page.hasMore || !page.cursor) break;

            res = await this.rpc('/files/list_folder/continue', { cursor: page.cursor });
            if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));
        }

        return out;
    }

    async stat(key: string): Promise<FileEntity | null> {
        const res = await this.rpc('/files/get_metadata', { path: this.fullPath(key) });
        if (isNotFound(res.status, res.text)) return null;
        if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));

        const body = safeJson(res.text) as Record<string, unknown>;
        // A folder is not a file, and answering with one would have the caller
        // record a previous-sync entry for something it can never download.
        if (body['.tag'] === 'folder') return null;

        const meta = parseMetadata(body);
        if (!meta) return null;
        return {
            key,
            size: meta.size,
            mtimeCli: meta.clientModified,
            mtimeSvr: meta.serverModified,
            etag: meta.rev,
        };
    }

    // ── Transfer ─────────────────────────────────────

    async readBinary(key: string): Promise<ArrayBuffer> {
        const res = await this.content('/files/download', { path: this.fullPath(key) });
        if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));
        return res.arrayBuffer;
    }

    async write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity> {
        const commit = {
            path: this.fullPath(key),
            mode: 'overwrite',
            // The whole reason Dropbox is the best remote here: the user's own
            // edit time survives the round trip.
            client_modified: dropboxTime(mtimeCli),
            autorename: false,
            mute: true,
        };

        const meta =
            data.byteLength > SIMPLE_UPLOAD_LIMIT
                ? await this.uploadSession(data, commit)
                : await this.uploadSimple(data, commit);

        return {
            key,
            size: meta?.size ?? data.byteLength,
            // Dropbox rounds `client_modified` to whole seconds, which the
            // engine's two-second tolerance already absorbs.
            mtimeCli: meta?.clientModified ?? floorToSecond(mtimeCli),
            mtimeSvr: meta?.serverModified ?? Date.now(),
            etag: meta?.rev,
        };
    }

    async remove(key: string): Promise<void> {
        const res = await this.rpc('/files/delete_v2', { path: this.fullPath(key) });
        // Already gone is the outcome we wanted.
        if (isNotFound(res.status, res.text)) return;
        if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));
    }

    // ── Uploading ────────────────────────────────────

    private async uploadSimple(data: ArrayBuffer, commit: Record<string, unknown>) {
        const res = await this.content('/files/upload', commit, data);
        if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));
        return parseMetadata(safeJson(res.text));
    }

    /**
     * Upload in pieces.
     *
     * The session is opened empty and every byte arrives through `append_v2`,
     * rather than sending the first chunk with `start` and the last with
     * `finish`. Two extra round trips, on a file already large enough to need
     * this — in exchange for one loop that treats every chunk alike. The
     * off-by-one that shape avoids is one that corrupts an upload rather than
     * failing it, which is the worst way for this to be wrong.
     */
    private async uploadSession(data: ArrayBuffer, commit: Record<string, unknown>) {
        const start = await this.content('/files/upload_session/start', { close: false });
        if (start.status >= 400) throw new Error(describeDropboxError(start.text, start.status));

        const sessionId = (safeJson(start.text) as Record<string, unknown>).session_id;
        if (typeof sessionId !== 'string') {
            throw new Error('Dropbox did not open an upload session.');
        }

        for (let offset = 0; offset < data.byteLength; offset += UPLOAD_CHUNK) {
            const end = Math.min(offset + UPLOAD_CHUNK, data.byteLength);
            const res = await this.content(
                '/files/upload_session/append_v2',
                { cursor: { session_id: sessionId, offset }, close: false },
                data.slice(offset, end)
            );
            if (res.status >= 400) throw new Error(describeDropboxError(res.text, res.status));
        }

        const finish = await this.content('/files/upload_session/finish', {
            cursor: { session_id: sessionId, offset: data.byteLength },
            commit,
        });
        if (finish.status >= 400) throw new Error(describeDropboxError(finish.text, finish.status));
        return parseMetadata(safeJson(finish.text));
    }

    // ── Internals ────────────────────────────────────

    private async rpc(path: string, body: unknown) {
        return this.http({
            url: `${RPC}${path}`,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.session.accessToken()}`,
                ...(body === null ? {} : { 'Content-Type': 'application/json' }),
            },
            // Dropbox rejects an empty-bodied RPC unless the body is literally
            // `null`, and rejects `null` with a JSON content type. Hence the
            // dance above.
            body: body === null ? 'null' : JSON.stringify(body),
        });
    }

    /**
     * A content-endpoint call: the arguments ride in a header so the body can be
     * the file itself.
     */
    private async content(path: string, arg: unknown, body?: ArrayBuffer) {
        return this.http({
            url: `${CONTENT}${path}`,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.session.accessToken()}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': asciiJson(arg),
            },
            body: body ?? new ArrayBuffer(0),
        });
    }

    /** `""` for the root, `/folder/key` otherwise — Dropbox's own convention. */
    private fullPath(key: string): string {
        return `${this.root}/${key}`.replace(/\/+/g, '/');
    }

    private stripRoot(path: string): string | null {
        const clean = path.replace(/^\/+/, '');
        const root = this.root.replace(/^\/+/, '');
        if (!root) return clean;
        // Dropbox path comparison is case-insensitive, and it echoes back the
        // casing the folder was created with — which may not be what the user
        // typed into settings.
        const lower = clean.toLowerCase();
        const rootLower = root.toLowerCase();
        if (lower === rootLower) return '';
        return lower.startsWith(`${rootLower}/`) ? clean.slice(root.length + 1) : null;
    }
}

// ── Response reading ─────────────────────────────────

interface ListedEntry {
    path: string;
    entity: (key: string) => FileEntity;
}

export interface DropboxListing {
    entries: ListedEntry[];
    cursor?: string;
    hasMore: boolean;
}

export interface DropboxMetadata {
    path: string;
    size: number;
    clientModified: number;
    serverModified: number;
    rev?: string;
}

/**
 * Read `list_folder` output.
 *
 * Folders are dropped: Dropbox lists them as `folder` entries, and the engine
 * works in files — an empty folder carries no user data worth syncing, and
 * treating one as a file would have the plan try to download it.
 */
export function parseListing(raw: unknown): DropboxListing {
    const body = (raw ?? {}) as Record<string, unknown>;
    const rawEntries = Array.isArray(body.entries) ? body.entries : [];
    const entries: ListedEntry[] = [];

    for (const item of rawEntries) {
        if (!item || typeof item !== 'object') continue;
        const tag = (item as Record<string, unknown>)['.tag'];
        if (tag !== 'file') continue;

        const meta = parseMetadata(item);
        if (!meta) continue;
        entries.push({
            path: meta.path,
            entity: (key) => ({
                key,
                size: meta.size,
                mtimeCli: meta.clientModified,
                mtimeSvr: meta.serverModified,
                etag: meta.rev,
            }),
        });
    }

    return {
        entries,
        cursor: typeof body.cursor === 'string' ? body.cursor : undefined,
        hasMore: body.has_more === true,
    };
}

export function parseMetadata(raw: unknown): DropboxMetadata | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;

    // `path_display` keeps the casing the user sees; `path_lower` is the one
    // Dropbox matches on. The display form is what gets turned into a vault
    // path, so a note called `Design.md` does not come back as `design.md`.
    const path =
        (typeof item.path_display === 'string' && item.path_display) ||
        (typeof item.path_lower === 'string' && item.path_lower) ||
        '';
    if (!path) return null;

    const client = typeof item.client_modified === 'string' ? Date.parse(item.client_modified) : NaN;
    const server = typeof item.server_modified === 'string' ? Date.parse(item.server_modified) : NaN;

    return {
        path,
        size: typeof item.size === 'number' ? item.size : 0,
        clientModified: Number.isFinite(client) ? client : Number.isFinite(server) ? server : 0,
        serverModified: Number.isFinite(server) ? server : 0,
        rev: typeof item.rev === 'string' ? item.rev : undefined,
    };
}

/**
 * Dropbox reports a missing path as a 409 whose body names it.
 *
 * The status alone will not do — 409 is also how a genuine conflict arrives —
 * and telling the two apart is what separates "already deleted, nothing to do"
 * from an error the user needs to see.
 */
export function isNotFound(status: number, body: string): boolean {
    return status === 409 && String(body).includes('not_found');
}

/** Dropbox wants whole seconds and rejects milliseconds outright. */
export function dropboxTime(ms: number): string {
    return `${new Date(floorToSecond(ms)).toISOString().slice(0, 19)}Z`;
}

function floorToSecond(ms: number): number {
    return Math.floor(ms / 1000) * 1000;
}

/**
 * JSON for the `Dropbox-API-Arg` header, with non-ASCII escaped.
 *
 * HTTP headers are Latin-1, so a path containing anything else — a Cyrillic
 * filename, an accent, an emoji — throws when the header is set. Dropbox
 * documents `\uXXXX` escaping for exactly this.
 */
export function asciiJson(value: unknown): string {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (ch) => {
        const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${code}`;
    });
}

/**
 * Turn a Dropbox error body into something worth showing.
 *
 * `error_summary` is Dropbox's own dotted code — `path/not_found/` or
 * `path/conflict/file/` — which names the actual problem where a bare status
 * does not.
 */
export function describeDropboxError(body: string, status: number): string {
    const parsed = safeJson(body) as Record<string, unknown>;
    if (typeof parsed.error_summary === 'string' && parsed.error_summary) {
        return parsed.error_summary;
    }
    if (typeof parsed.error_description === 'string' && parsed.error_description) {
        return parsed.error_description;
    }
    return `Dropbox answered ${status}.`;
}

function normalizeFolder(folder: string): string {
    const trimmed = (folder ?? '').replace(/^\/+|\/+$/g, '');
    // Dropbox's root is the empty string, NOT "/" — sending "/" is an error.
    return trimmed ? `/${trimmed}` : '';
}
