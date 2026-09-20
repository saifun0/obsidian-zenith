import { vaultModuleFs } from '../../../core/moduleFs';
import { useZenithStore } from '../../../store';
import type { ForceDirection, SyncPlan } from '../fileSyncTypes';
import { syncPaths } from '../syncTypes';
import { dropboxClientId, onedriveClientId } from './remotes/appIds';
import { CryptoRemote } from './crypto/cryptoRemote';
import { PrevSyncStore } from './prevSyncStore';
import { SyncEngine, type SyncProgress, type SyncRunResult } from './SyncEngine';
import { WebdavRemote } from './remotes/webdavRemote';
import { S3Remote } from './remotes/s3Remote';
import { DropboxRemote } from './remotes/dropboxRemote';
import { OneDriveRemote } from './remotes/onedriveRemote';
import type { TokenStore } from './remotes/oauthSession';
import type { StoredTokens } from '../../../store/settingsSlice';
import type { ConnectionResult, SyncRemote } from './remotes/types';
import type ZenithPlugin from '../../../main';

/**
 * The file engine as the rest of the plugin sees it.
 *
 * Builds an engine from the current settings on demand rather than holding one:
 * the remote address, the scope and the safety limit can all change between
 * runs, and a cached engine configured from stale settings would act on the
 * wrong server with the wrong rules.
 *
 * Nothing here runs on a timer. A file sync moves the user's notes around and
 * can delete them; it happens when they ask for it, and Phase 1's settings merge
 * is the part that runs quietly in the background.
 */

export interface FileSyncStatus {
    configured: boolean;
    running: boolean;
    /** The plan currently being previewed, if any. */
    plan: SyncPlan | null;
    lastRunAt: number;
    lastResult: SyncRunResult | null;
    progress: SyncProgress | null;
    error: string | null;
}

const EMPTY_STATUS: FileSyncStatus = {
    configured: false,
    running: false,
    plan: null,
    lastRunAt: 0,
    lastResult: null,
    progress: null,
    error: null,
};

export class FileSyncService {
    private status: FileSyncStatus = { ...EMPTY_STATUS };
    private listeners = new Set<(status: FileSyncStatus) => void>();

    constructor(
        private readonly plugin: ZenithPlugin,
        private readonly deviceId: string,
        private readonly deviceLabel: () => string
    ) {
        this.status.configured = this.isConfigured();
    }

    getStatus(): FileSyncStatus {
        return this.status;
    }

    subscribe(listener: (status: FileSyncStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Re-read settings; called when the user edits the remote configuration. */
    refresh(): void {
        this.patch({ configured: this.isConfigured() });
    }

    async checkConnection(): Promise<ConnectionResult> {
        const remote = this.remote();
        if (!remote) return { ok: false, error: 'No server configured.' };
        return remote.checkConnection();
    }

    /** Work out what a run would do. Reads both sides, writes nothing. */
    async preview(): Promise<SyncPlan | null> {
        return this.planWith((engine) => engine.plan());
    }

    /**
     * Work out what overwriting one side with the other would do.
     *
     * Produces a plan and nothing else — exactly like `preview`, and that
     * sameness is deliberate. A forced overwrite reaches the disk through the
     * one `apply` path every other run uses, so it inherits the progress
     * notice, the failure handling and the previous-sync bookkeeping rather
     * than growing its own copies of all three.
     *
     * The plan comes back `blocked`, so the only button that can carry it out
     * is the red one under the list of what it would do.
     */
    async forcePreview(direction: ForceDirection): Promise<SyncPlan | null> {
        return this.planWith((engine) => engine.forcePlan(direction));
    }

    /** Shared plumbing: run a planner, park the result, report a failure. */
    private async planWith(
        make: (engine: SyncEngine) => Promise<SyncPlan>
    ): Promise<SyncPlan | null> {
        const engine = this.engine();
        if (!engine) {
            this.patch({ error: 'No server configured.' });
            return null;
        }

        this.patch({ running: true, error: null, progress: null });
        try {
            const plan = await make(engine);
            this.patch({ plan, running: false });
            return plan;
        } catch (err) {
            this.patch({ running: false, error: describe(err) });
            return null;
        }
    }

    /**
     * Carry out the previewed plan.
     *
     * Takes the plan rather than recomputing one, so what runs is exactly what
     * the user looked at. Recomputing here would mean the thing they approved
     * and the thing that happened were two different plans — which is precisely
     * the gap a preview is supposed to close.
     */
    async apply(plan: SyncPlan, force = false): Promise<SyncRunResult | null> {
        const engine = this.engine();
        if (!engine) return null;

        this.patch({ running: true, error: null });
        try {
            const result = await engine.apply(plan, {
                force,
                onProgress: (progress) => this.patch({ progress }),
            });
            this.patch({
                running: false,
                lastRunAt: Date.now(),
                lastResult: result,
                progress: null,
                // The plan is spent: its entities describe a state that no longer
                // exists, and offering it again would apply stale decisions.
                plan: null,
            });
            return result;
        } catch (err) {
            this.patch({ running: false, error: describe(err), progress: null });
            return null;
        }
    }

    /** Drop the previewed plan without acting on it. */
    discard(): void {
        this.patch({ plan: null, error: null });
    }

    /**
     * Forget what was synced against this remote.
     *
     * The escape hatch for when the record and reality have diverged — after a
     * restore from backup, say. The next run becomes a reviewed first run, which
     * is the right amount of ceremony for "I no longer trust this".
     */
    async forgetHistory(): Promise<void> {
        await this.engine()?.forgetHistory();
        this.patch({ plan: null, lastResult: null });
    }

    // ── Building from settings ───────────────────────

    private isConfigured(): boolean {
        const s = useZenithStore.getState().settings;
        if (!s.syncFilesEnabled) return false;

        // Encryption switched on with no password is not a configuration, it is
        // a half-finished one. Deriving a key from an empty string would encrypt
        // the vault under a password anybody could guess, and would do it
        // silently — so this reads as "not configured yet" instead.
        if (s.syncEncryptionEnabled && !s.syncEncryptionPassword) return false;

        // Enough to attempt a connection. Whether the credentials are RIGHT is
        // the server's answer to give, not something to guess at here.
        switch (s.syncRemoteKind) {
            case 's3':
                return (
                    !!s.syncS3Endpoint.trim() &&
                    !!s.syncS3Bucket.trim() &&
                    !!s.syncS3AccessKey.trim()
                );
            case 'dropbox':
                // A client id alone is not enough for the OAuth backends: without
                // tokens there is nothing to authorize a request with, and every
                // call would fail identically. "Not connected yet" is a clearer
                // state than "configured but broken".
                return !!dropboxClientId(s.syncDropboxClientId) && !!s.syncDropboxTokens?.accessToken;
            case 'onedrive':
                return (
                    !!onedriveClientId(s.syncOnedriveClientId) &&
                    !!s.syncOnedriveTokens?.accessToken
                );
            default:
                return !!s.syncRemoteUrl.trim() && !!s.syncRemoteUser.trim();
        }
    }

    /**
     * A token store backed by settings.
     *
     * Reads and writes go through the store rather than being cached, so a
     * refresh performed during a sync run is persisted immediately — a token
     * renewed and then lost to a crash would leave the connection dead with no
     * way to tell why.
     */
    private tokenStore(key: 'syncDropboxTokens' | 'syncOnedriveTokens'): TokenStore {
        return {
            read: () => useZenithStore.getState().settings[key],
            write: (tokens: StoredTokens) =>
                useZenithStore.getState().updateSettings({ [key]: tokens }),
            clear: () => useZenithStore.getState().updateSettings({ [key]: null }),
        };
    }

    /**
     * The configured backend, wrapped in encryption when it is switched on.
     *
     * The wrapping happens here and nowhere else, which is what lets every
     * backend stay unaware of it — and what makes "is this vault encrypted"
     * one line to read rather than a flag to trace through four classes.
     */
    private remote(): SyncRemote | null {
        const s = useZenithStore.getState().settings;
        const base = this.baseRemote();
        if (!base) return null;

        return s.syncEncryptionEnabled ? new CryptoRemote(base, s.syncEncryptionPassword) : base;
    }

    private baseRemote(): SyncRemote | null {
        const s = useZenithStore.getState().settings;
        if (!this.isConfigured()) return null;

        if (s.syncRemoteKind === 'dropbox') {
            return new DropboxRemote(
                {
                    kind: 'dropbox',
                    clientId: dropboxClientId(s.syncDropboxClientId),
                    folder: s.syncOauthFolder.trim(),
                },
                this.tokenStore('syncDropboxTokens')
            );
        }

        if (s.syncRemoteKind === 'onedrive') {
            return new OneDriveRemote(
                {
                    kind: 'onedrive',
                    clientId: onedriveClientId(s.syncOnedriveClientId),
                    folder: s.syncOauthFolder.trim(),
                },
                this.tokenStore('syncOnedriveTokens')
            );
        }

        if (s.syncRemoteKind === 's3') {
            return new S3Remote({
                kind: 's3',
                endpoint: s.syncS3Endpoint.trim(),
                // Several S3-compatible servers ignore the region entirely but
                // still require the signature to name one, and `us-east-1` is
                // what they all accept.
                region: s.syncS3Region.trim() || 'us-east-1',
                bucket: s.syncS3Bucket.trim(),
                accessKeyId: s.syncS3AccessKey.trim(),
                secretAccessKey: s.syncS3Secret,
                prefix: s.syncS3Prefix.trim(),
                forcePathStyle: s.syncS3PathStyle,
            });
        }

        return new WebdavRemote({
            kind: 'webdav',
            url: s.syncRemoteUrl.trim(),
            username: s.syncRemoteUser.trim(),
            password: s.syncRemotePassword,
            remoteDir: s.syncRemoteDir.trim(),
        });
    }

    private engine(): SyncEngine | null {
        const paths = syncPaths(this.plugin);
        const remote = this.remote();
        if (!paths || !remote) return null;

        const s = useZenithStore.getState().settings;
        const fs = vaultModuleFs(this.plugin.app.vault.adapter);

        return new SyncEngine(fs, remote, new PrevSyncStore(fs, paths), this.deviceId, {
            localRoot: s.syncLocalRoot.trim(),
            includeConfigDir: s.syncIncludeConfigDir,
            userExcludes: s.syncExcludes,
            pluginDir: this.plugin.manifest.dir ?? '',
            conflictAction: s.syncConflictAction,
            // Clamped rather than trusted: these come back from `data.json`, and
            // a protect ratio of 0 would wave through a plan that deletes
            // everything — the one thing the rail exists to stop.
            protectModifyRatio: clamp(s.syncProtectPercent, 1, 100) / 100,
            maxFileSize: Math.max(0, s.syncMaxFileMb) * 1024 * 1024,
            concurrency: clamp(s.syncConcurrency, 1, 16),
            deviceLabel: this.deviceLabel(),
        });
    }

    private patch(patch: Partial<FileSyncStatus>): void {
        this.status = { ...this.status, ...patch };
        this.listeners.forEach((l) => l(this.status));
    }
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
