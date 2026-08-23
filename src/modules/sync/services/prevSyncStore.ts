import type { ModuleFs } from '../../../core/moduleFs';
import { isSafeDeviceId, type SyncPaths } from '../syncTypes';
import type { PrevSyncRecord } from '../fileSyncTypes';

/**
 * What both sides looked like at the end of the last successful file sync.
 *
 * This is the file that gives the engine permission to delete. Without a record
 * for a path, a file present on one side only is a creation; with one, it can be
 * read as a deletion. So the failure modes are asymmetric and the code leans one
 * way on purpose: a record that cannot be read is treated as **absent**, which
 * degrades the next run to "everything is new" — noisy, and safe. Treating a
 * damaged record as authoritative would let a truncated file authorise deleting
 * whatever it no longer mentions.
 *
 * Held as a plain JSON file rather than in IndexedDB so it can be inspected and
 * deleted by hand when something goes wrong, which for a component like this is
 * worth more than the speed.
 */

/** Bumped when the record shape changes; an older file is discarded, not migrated. */
export const PREV_SYNC_VERSION = 1;

interface PrevSyncFile {
    version: number;
    remoteId: string;
    /** When this record was written. Shown in the UI, never used for decisions. */
    at: number;
    records: PrevSyncRecord[];
}

export class PrevSyncStore {
    constructor(
        private readonly fs: ModuleFs,
        private readonly paths: SyncPaths
    ) {}

    /**
     * Records for this device against this remote, or an empty list.
     *
     * An empty list is meaningful: it is what makes `buildSyncPlan` treat the
     * run as a first run, which the safety rails then force the user to review.
     */
    async read(deviceId: string, remoteId: string): Promise<PrevSyncRecord[]> {
        if (!isSafeDeviceId(deviceId) || !isSafeRemoteId(remoteId)) return [];

        try {
            const path = this.paths.prev(deviceId, remoteId);
            if (!(await this.fs.exists(path))) return [];

            const parsed: unknown = JSON.parse(await this.fs.read(path));
            if (!parsed || typeof parsed !== 'object') return [];

            const file = parsed as Partial<PrevSyncFile>;
            // A record written by a different shape of this code describes fields
            // we no longer understand. Starting over is recoverable; acting on a
            // half-understood record is not.
            if (file.version !== PREV_SYNC_VERSION) return [];
            if (file.remoteId !== remoteId) return [];
            if (!Array.isArray(file.records)) return [];

            return file.records.filter(isRecord);
        } catch {
            return [];
        }
    }

    async write(deviceId: string, remoteId: string, records: PrevSyncRecord[]): Promise<void> {
        const path = this.paths.prev(deviceId, remoteId);
        await this.fs.mkdirp(path.slice(0, path.lastIndexOf('/')));
        const file: PrevSyncFile = {
            version: PREV_SYNC_VERSION,
            remoteId,
            at: Date.now(),
            records,
        };
        await this.fs.write(path, JSON.stringify(file));
    }

    /**
     * Forget everything known about a remote.
     *
     * The escape hatch when the record and reality have diverged — after
     * restoring a backup, say. The next run becomes a reviewed first run, which
     * is exactly the right amount of ceremony for "I no longer trust this".
     */
    async forget(deviceId: string, remoteId: string): Promise<void> {
        await this.fs.removeFile(this.paths.prev(deviceId, remoteId));
    }
}

/** Same reasoning as `isSafeDeviceId`: this becomes a filename. */
export function isSafeRemoteId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && id.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Shape check for one record.
 *
 * Deliberately strict about the numbers: a `size` that arrives as a string
 * compares unequal to every real size and would mark the file modified forever,
 * and a `NaN` mtime makes every comparison false — both of which present as
 * "the engine keeps re-copying everything" rather than as an error.
 */
function isRecord(value: unknown): value is PrevSyncRecord {
    if (!value || typeof value !== 'object') return false;
    const r = value as Partial<PrevSyncRecord>;
    if (typeof r.key !== 'string' || !r.key) return false;
    return isSide(r.local) && isSide(r.remote);
}

function isSide(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as { size?: unknown; mtime?: unknown; etag?: unknown };
    if (typeof s.size !== 'number' || !Number.isFinite(s.size)) return false;
    if (typeof s.mtime !== 'number' || !Number.isFinite(s.mtime)) return false;
    return s.etag === undefined || typeof s.etag === 'string';
}
