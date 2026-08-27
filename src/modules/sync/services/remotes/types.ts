import type { FileEntity } from '../../fileSyncTypes';

/**
 * What the engine needs from a storage backend, and nothing more.
 *
 * Deliberately narrow. The engine decides *what* to do in `syncPlan`, which is
 * pure; a remote only moves bytes. Keeping the interface this small is what lets
 * a second backend be added without reopening the code that decides whether to
 * delete a file.
 */

export type RemoteKind = 'webdav' | 's3' | 'dropbox' | 'onedrive';

export interface WebdavConfig {
    kind: 'webdav';
    /** Base URL of the WebDAV endpoint, e.g. `https://host/remote.php/dav/files/me`. */
    url: string;
    username: string;
    /**
     * Stored in `data.json` in plain text, like every other Obsidian plugin
     * credential — the app offers no keychain. Worth saying out loud in the
     * settings UI rather than leaving the user to assume otherwise.
     */
    password: string;
    /** Folder under `url` that holds this vault. */
    remoteDir: string;
}

export interface S3Config {
    kind: 's3';
    /** Service endpoint, e.g. `https://s3.eu-central-1.amazonaws.com`. */
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    /** Plain text in `data.json`, like every Obsidian plugin credential. */
    secretAccessKey: string;
    /** For temporary credentials. */
    sessionToken?: string;
    /** Folder inside the bucket. */
    prefix: string;
    /**
     * Address the bucket as `endpoint/bucket` rather than `bucket.endpoint`.
     *
     * Needed by nearly every S3-compatible server that is not AWS — MinIO,
     * Cloudflare R2 on a custom domain, a local test instance — because
     * virtual-host addressing requires wildcard DNS they do not have.
     */
    forcePathStyle: boolean;
}

/**
 * Shared by the OAuth-based providers.
 *
 * `clientId` is Zenith's own registration, or the user's when they supplied one
 * — see `appIds`. Publishing a client id is not the leak it looks like: PKCE is
 * built on the assumption that a native app's id is public, and the code it
 * yields is useless without a verifier that never leaves the device. What a
 * shared registration does cost is shared limits and shared fate, which is why
 * overriding it stays possible.
 */
export interface OAuthConfigBase {
    clientId: string;
    /** Folder holding this vault. Empty means the account's root. */
    folder: string;
}

export interface DropboxConfig extends OAuthConfigBase {
    kind: 'dropbox';
}

export interface OneDriveConfig extends OAuthConfigBase {
    kind: 'onedrive';
}

export type RemoteConfig = WebdavConfig | S3Config | DropboxConfig | OneDriveConfig;

export interface ConnectionResult {
    ok: boolean;
    /** Present when `ok` is false. Phrased for the user, not for a log. */
    error?: string;
}

export interface SyncRemote {
    readonly kind: RemoteKind;
    /**
     * Stable identifier for this remote, used to key the previous-sync record.
     *
     * Derived from the address rather than chosen by the user: pointing the same
     * device at a different server must start a fresh comparison, because a
     * previous-sync record from another server would describe files that never
     * existed here and licence deletions that make no sense.
     */
    readonly id: string;

    checkConnection(): Promise<ConnectionResult>;

    /** Every file under the configured folder. Folders are not returned. */
    list(): Promise<FileEntity[]>;

    /**
     * One file as the server reports it now, or null when it is not there.
     *
     * Exists so the engine can re-read a single object after transferring it
     * without asking for the whole listing again. That sounds like a small
     * saving and is not: a run that pulls five hundred files would otherwise
     * fetch five hundred complete recursive listings, which is slow everywhere
     * and gets the device rate-limited on Dropbox before the run finishes.
     */
    stat(key: string): Promise<FileEntity | null>;

    readBinary(key: string): Promise<ArrayBuffer>;

    /**
     * Upload, creating any missing parent folders.
     *
     * Returns the entity as the server now reports it, so the caller can record
     * the server's own timestamp rather than guessing what it stored.
     */
    write(key: string, data: ArrayBuffer, mtimeCli: number): Promise<FileEntity>;

    remove(key: string): Promise<void>;
}
