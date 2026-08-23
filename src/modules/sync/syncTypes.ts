import { normalizePath } from 'obsidian';
import type ZenithPlugin from '../../main';
import type { SharedState } from './stateMerge';

/**
 * Storage layout and shared shapes for the sync module.
 *
 * ── Why every device writes its own file ──
 *
 * The obvious layout is one `state.json` that all devices read and write. It
 * does not survive contact with the transport: whatever carries the vault
 * between devices — Obsidian Sync, Remotely Save, Syncthing, iCloud — sees two
 * devices writing one file and does the only thing it can, which is pick a
 * winner or drop a `.conflict` copy beside it. The merge we care about would
 * then be decided by a layer that has no idea what the file means.
 *
 * So no file here is ever written by two devices. Each device owns exactly one
 * outbox and only ever reads the others'. The transport is left with nothing to
 * resolve, and all the reconciling happens in `stateMerge`, which knows what the
 * values mean.
 */

/** How a device identifies itself to the others. */
export interface DeviceRecord {
    /** Stable, generated once, never leaves this device's local storage. */
    id: string;
    /** User-editable. Defaults to something recognisable like "Windows desktop". */
    name: string;
    platform: DevicePlatform;
    /** Zenith version that last wrote this record. */
    pluginVersion: string;
    /** Epoch ms of the last publish from this device. */
    lastSeenAt: number;
}

export type DevicePlatform = 'desktop' | 'ios' | 'android' | 'mobile' | 'unknown';

/**
 * One device's outbox: who it is, plus its view of the shared settings.
 *
 * `SharedState` carries only `shared`-scoped keys — see `statePolicy`. Device
 * settings never appear here, which is what keeps a phone's `compact` density
 * off the desktop.
 */
export interface DeviceDoc extends SharedState {
    device: DeviceRecord;
}

/** Format version of an outbox file, for future migrations. */
export const DEVICE_DOC_VERSION = 1;

/** One line of the append-only history. */
export interface JournalEntry {
    /** Encoded HLC — sorts as a string, see `hlc.encode`. */
    at: string;
    /** Wall time, for display. Not used for ordering. */
    wall: number;
    deviceId: string;
    kind: 'publish' | 'merge' | 'conflict' | 'rollback';
    /** Settings keys involved. */
    keys: string[];
    /**
     * Previous values for the keys, so a merge can be undone. Only recorded for
     * `merge` and `conflict` — a publish changes nothing that was not already
     * the user's own choice on this device.
     */
    before?: Record<string, unknown>;
}

/** Vault-relative paths. Null when Obsidian has not said where the plugin is. */
export interface SyncPaths {
    /** `<plugin dir>/sync` */
    root: string;
    /** Where every device drops its own document. */
    outboxDir: string;
    outbox(deviceId: string): string;
    /**
     * Our record of each peer's document as of the last merge with it — the
     * common ancestor `stateMerge` needs to tell "they changed it" from "we
     * did". Namespaced by our own id because this folder syncs like everything
     * else, and each device must only ever read its own.
     */
    baseDir(selfId: string): string;
    base(selfId: string, peerId: string): string;
    /**
     * This device's own settings — the `device`-scoped half.
     *
     * They already live in `data.json`, but `data.json` is a file like any
     * other and the transport carries it between devices too: another machine's
     * copy arriving would take this one's layout and density with it. A
     * per-device snapshot alongside it is read back on load and wins for those
     * keys, so the promise that density stays put survives the file sync.
     */
    local(deviceId: string): string;
    /**
     * What both sides looked like at the end of the last successful file sync.
     *
     * Namespaced by device AND by remote. By device because it records what THIS
     * machine last saw and another machine's record would licence deletions it
     * never observed; by remote because pointing at a different server has to
     * start a fresh comparison rather than inherit one describing other files.
     */
    prev(deviceId: string, remoteId: string): string;
    /** Append-only history, per device so there is nothing to contend over. */
    journal(deviceId: string): string;
}

export function syncPaths(plugin: ZenithPlugin): SyncPaths | null {
    const pluginDir = plugin.manifest.dir;
    if (!pluginDir) return null;

    const root = normalizePath(`${pluginDir}/sync`);
    const outboxDir = normalizePath(`${root}/outbox`);
    const baseDir = (selfId: string) => normalizePath(`${root}/base/${selfId}`);

    return {
        root,
        outboxDir,
        outbox: (deviceId) => normalizePath(`${outboxDir}/${deviceId}.json`),
        baseDir,
        base: (selfId, peerId) => normalizePath(`${baseDir(selfId)}/${peerId}.json`),
        local: (deviceId) => normalizePath(`${root}/local/${deviceId}.json`),
        prev: (deviceId, remoteId) => normalizePath(`${root}/prev/${deviceId}/${remoteId}.json`),
        journal: (deviceId) => normalizePath(`${root}/journal/${deviceId}.jsonl`),
    };
}

/**
 * Allowed characters in a device id.
 *
 * The id becomes a filename, so it is validated wherever one arrives from
 * outside — a peer document is a file that syncs in from another machine, and an
 * id like `../../data` would otherwise escape the sync folder. Same reasoning
 * and same shape as `SAFE_MODULE_ID` in `core/modulePaths.ts`.
 */
export const SAFE_DEVICE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isSafeDeviceId(id: unknown): id is string {
    return typeof id === 'string' && id.length > 0 && id.length <= 64 && SAFE_DEVICE_ID.test(id);
}
