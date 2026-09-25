import { debounce } from 'obsidian';
import { useZenithStore } from '../../../store';
import { vaultModuleFs } from '../../../core/moduleFs';
import { encode, next as nextStamp, parse, receive, zero, compare, type Hlc } from '../hlc';
import { DEVICE_KEYS, SHARED_KEYS, type SettingsKey } from '../statePolicy';
import {
    deepEqual,
    emptyState,
    mergeSharedState,
    type KeyConflict,
    type SharedState,
} from '../stateMerge';
import {
    DEVICE_DOC_VERSION,
    syncPaths,
    type DeviceDoc,
    type DeviceRecord,
    type JournalEntry,
} from '../syncTypes';
import { DeviceRegistry } from './deviceRegistry';
import { SyncStore } from './syncStore';
import type ZenithPlugin from '../../../main';

/**
 * Keeps the shared half of Zenith's settings in step across devices.
 *
 * Two directions, both deliberately unhurried:
 *
 * - **Out.** A settings change stamps the keys that actually moved and writes
 *   this device's outbox, debounced so a burst of edits (dragging a slider,
 *   typing a folder path) becomes one write.
 * - **In.** Peers' outboxes are polled, merged field-by-field, and the result
 *   applied to the store. Obsidian raises no vault event for files under
 *   `.obsidian`, and the undocumented `raw` event is outside the public API and
 *   could disappear — so this is a `stat` on a handful of small files, which is
 *   cheap enough to do on a timer and on window focus.
 */

/** How long after the last settings change we publish. */
const PUBLISH_DEBOUNCE_MS = 1500;

/** How often to look for peer changes while the window has focus. */
const DEFAULT_POLL_MS = 20_000;

/**
 * What one round trip actually did.
 *
 * Returned rather than only recorded in the status, because "nothing changed"
 * and "nothing happened" look identical from outside and mean opposite things.
 * A device on its own has genuinely nothing to merge, and a button that answers
 * that with silence reads as broken every single time.
 */
export interface SyncOutcome {
    /** Settings this device stamped as newly changed and sent. */
    published: number;
    /** Other devices whose outbox was read. */
    peers: number;
    /** Settings that changed HERE as a result of the merge. */
    received: number;
    conflicts: number;
}

export interface SyncStatus {
    enabled: boolean;
    deviceId: string;
    deviceName: string;
    /** Epoch ms, 0 when it has not happened yet. */
    lastPublishAt: number;
    lastPullAt: number;
    peers: DeviceRecord[];
    /** Collisions from the most recent merge, already resolved. */
    conflicts: KeyConflict[];
    /** Set when the last run failed; cleared by the next successful one. */
    error: string | null;
}

export class SettingsSyncService {
    private readonly registry: DeviceRegistry;
    private store: SyncStore | null = null;

    /** This device's logical clock. Advances on every local stamp. */
    private clock: Hlc;

    /**
     * The shared values as of our last publish. Diffing against this is what
     * tells us which keys to stamp — stamping everything on every save would
     * make each device look like it had just rewritten all ~60 settings, and
     * every merge would then be a contest nobody could win.
     */
    private published: SharedState = emptyState();

    /**
     * Set while we are writing merged values into the store, so the settings
     * subscription can tell an incoming change from one the user made. Without
     * it every pull would immediately look like a local edit and bounce
     * straight back out as a publish.
     */
    private applyingRemote = false;

    private pollTimer: number | null = null;
    private disposers: Array<() => void> = [];
    private listeners = new Set<(status: SyncStatus) => void>();
    private started = false;

    private status: SyncStatus;

    private readonly publishDebounced = debounce(
        () => void this.publish(),
        PUBLISH_DEBOUNCE_MS,
        true
    );

    constructor(private readonly plugin: ZenithPlugin) {
        this.registry = new DeviceRegistry(plugin);
        this.clock = zero(this.registry.id);
        this.status = {
            enabled: false,
            deviceId: this.registry.id,
            deviceName: this.registry.name,
            lastPublishAt: 0,
            lastPullAt: 0,
            peers: [],
            conflicts: [],
            error: null,
        };
    }

    get deviceId(): string {
        return this.registry.id;
    }

    getStatus(): SyncStatus {
        return this.status;
    }

    /** Subscribe to status changes. Returns a disposer. */
    subscribe(listener: (status: SyncStatus) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    rename(name: string): void {
        this.registry.setName(name);
        this.patchStatus({ deviceName: this.registry.name });
        this.publishDebounced();
    }

    async start(pollMs = DEFAULT_POLL_MS): Promise<void> {
        if (this.started) return;
        const paths = syncPaths(this.plugin);
        if (!paths) {
            this.patchStatus({ error: 'Obsidian has not said where the plugin lives.' });
            return;
        }

        this.started = true;
        this.store = new SyncStore(vaultModuleFs(this.plugin.app.vault.adapter), paths);
        await this.store.ensureFolders(this.registry.id);

        // Adopt the clock we last published, so a restart does not rewind it and
        // make this device lose every conflict until real time catches up.
        const own = await this.store.readOutbox(this.registry.id);
        if (own) {
            this.published = { version: own.version, values: own.values, stamps: own.stamps };
            this.clock = highestStamp(own.stamps, this.registry.id);
        }

        // Restore this device's own layout and chrome before anything else
        // runs, so a `data.json` that arrived from another machine does not get
        // to keep its density and dashboard grid.
        await this.restoreDeviceState();

        this.disposers.push(
            useZenithStore.subscribe(
                (s) => s.settings,
                () => {
                    if (this.applyingRemote) return;
                    this.publishDebounced();
                }
            )
        );

        // Focus is the moment a device is most likely to be stale — the user
        // just came back to it, probably from the other one.
        const onFocus = () => void this.pull();
        window.addEventListener('focus', onFocus);
        this.disposers.push(() => window.removeEventListener('focus', onFocus));

        this.pollTimer = window.setInterval(() => void this.pull(), pollMs);
        this.plugin.registerInterval(this.pollTimer);

        this.patchStatus({ enabled: true, error: null });

        // First run: take what the peers already know before announcing
        // ourselves, so a fresh device adopts the vault's settings rather than
        // publishing its defaults over them.
        await this.pull();
        await this.publish();
    }

    stop(): void {
        this.publishDebounced.cancel();
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.listeners.clear();
        this.started = false;
        this.patchStatus({ enabled: false });
    }

    // ── Out ──────────────────────────────────────────

    /**
     * Write this device's outbox, stamping only the keys whose values moved.
     */
    async publish(): Promise<number | null> {
        if (!this.store) return null;
        const settings = useZenithStore.getState().settings;

        const values: Record<string, unknown> = {};
        const stamps: Record<string, string> = { ...this.published.stamps };
        const moved: SettingsKey[] = [];
        const now = Date.now();

        for (const key of SHARED_KEYS) {
            const value = settings[key];
            if (value === undefined) continue;
            values[key] = value;
            if (!deepEqual(value, this.published.values[key])) moved.push(key);
        }

        for (const key of moved) {
            this.clock = nextStamp(this.clock, now, this.registry.id);
            stamps[key] = encode(this.clock);
        }

        const state: SharedState = {
            version: DEVICE_DOC_VERSION,
            values: values,
            stamps,
        };
        const doc: DeviceDoc = { ...state, device: this.registry.record(now) };

        try {
            await this.store.writeOutbox(doc);
            await this.saveDeviceState();
            this.published = state;
            this.patchStatus({ lastPublishAt: now, error: null });
            const sent = moved.length;

            if (moved.length > 0) {
                await this.store.appendJournal(this.registry.id, {
                    at: encode(this.clock),
                    wall: now,
                    deviceId: this.registry.id,
                    kind: 'publish',
                    keys: moved,
                });
            }
            return sent;
        } catch (err) {
            console.error('Zenith sync: failed to publish', err);
            this.patchStatus({ error: describe(err) });
            // Null, not zero: nothing was sent AND something is wrong, and the
            // caller has a different thing to say about each.
            return null;
        }
    }

    /**
     * Publish now if the store holds shared values we have not stamped yet.
     *
     * Cancels the pending debounce rather than racing it, so the flush and the
     * timer cannot both fire and stamp the same keys twice.
     */
    private async flushPending(): Promise<void> {
        const settings = useZenithStore.getState().settings;
        const dirty = SHARED_KEYS.some(
            (key) =>
                settings[key] !== undefined && !deepEqual(settings[key], this.published.values[key])
        );
        if (!dirty) return;
        this.publishDebounced.cancel();
        await this.publish();
    }

    /**
     * Put back the values one merge replaced.
     *
     * Applied as an ordinary local edit, not as a rewind: the previous values
     * are written through `updateSettings` and stamped fresh, so they travel to
     * the other devices as a deliberate change. Trying to un-happen the merge
     * instead would leave the peers still holding the values we just rejected,
     * and the next pull would bring them straight back.
     */
    async rollback(entry: JournalEntry): Promise<boolean> {
        if (!entry.before || Object.keys(entry.before).length === 0) return false;

        const settings = useZenithStore.getState().settings;
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entry.before)) {
            // Only shared keys were ever merged, so only shared keys can be
            // undone — a journal file the user edited by hand must not become a
            // way to write arbitrary settings.
            if (!SHARED_KEYS.includes(key as SettingsKey)) continue;
            if (value === undefined) continue;
            if (deepEqual(value, settings[key as SettingsKey])) continue;
            patch[key] = value;
        }
        if (Object.keys(patch).length === 0) return false;

        useZenithStore.getState().updateSettings(patch);

        const now = Date.now();
        this.clock = nextStamp(this.clock, now, this.registry.id);
        await this.store?.appendJournal(this.registry.id, {
            at: encode(this.clock),
            wall: now,
            deviceId: this.registry.id,
            kind: 'rollback',
            keys: Object.keys(patch),
        });

        // Published immediately rather than on the debounce: an undo the user is
        // watching should reach the other devices before they overwrite it.
        this.publishDebounced.cancel();
        await this.publish();
        return true;
    }

    /** Recent history across every device, newest first. For the view. */
    async readHistory(limit = 100): Promise<JournalEntry[]> {
        return (await this.store?.readJournal(limit)) ?? [];
    }

    // ── This device's own half ───────────────────────

    /**
     * Re-apply the `device`-scoped settings this device last had.
     *
     * Only keys that actually differ are written, and only when a snapshot
     * exists — a first run has nothing to restore and must leave `data.json`
     * alone rather than resetting the user's layout to defaults.
     */
    private async restoreDeviceState(): Promise<void> {
        if (!this.store) return;
        const saved = await this.store.readLocal(this.registry.id);
        if (!saved) return;

        const settings = useZenithStore.getState().settings;
        const patch: Record<string, unknown> = {};
        for (const key of DEVICE_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(saved, key)) continue;
            if (deepEqual(saved[key], settings[key])) continue;
            patch[key] = saved[key];
        }
        if (Object.keys(patch).length === 0) return;

        this.applyingRemote = true;
        try {
            useZenithStore.getState().updateSettings(patch);
        } finally {
            this.applyingRemote = false;
        }
    }

    private async saveDeviceState(): Promise<void> {
        if (!this.store) return;
        const settings = useZenithStore.getState().settings;
        const values: Record<string, unknown> = {};
        for (const key of DEVICE_KEYS) {
            const value = settings[key];
            if (value !== undefined) values[key] = value;
        }
        await this.store.writeLocal(this.registry.id, values);
    }

    // ── In ───────────────────────────────────────────

    /**
     * Merge every peer's document into ours and apply the result.
     *
     * Peers are folded in one at a time, each against our record of that peer's
     * previous document. That per-peer ancestor is what makes a deletion
     * distinguishable from an addition — see the note in `stateMerge`.
     */
    async pull(): Promise<Omit<SyncOutcome, 'published'> | null> {
        if (!this.store) return null;
        const selfId = this.registry.id;

        // Flush a local edit still sitting in the publish debounce first.
        // `current` below is built from what we last published, so an unstamped
        // change would be invisible to the merge and lose to a peer's older
        // value — the user would watch a setting they just changed revert.
        await this.flushPending();

        try {
            const peers = await this.store.readPeers(selfId);
            const now = Date.now();

            let current: SharedState = {
                version: DEVICE_DOC_VERSION,
                values: { ...this.published.values },
                stamps: { ...this.published.stamps },
            };
            const allChanged = new Set<SettingsKey>();
            const allConflicts: KeyConflict[] = [];

            for (const peer of peers) {
                const peerState: SharedState = {
                    version: peer.version,
                    values: peer.values,
                    stamps: peer.stamps,
                };
                const base = await this.store.readBase(selfId, peer.device.id);
                const result = mergeSharedState(base, current, peerState, { node: selfId });

                current = result.state;
                result.changedKeys.forEach((k) => allChanged.add(k));
                allConflicts.push(...result.conflicts);

                // Remember what this peer said, so next time we can tell what
                // it changed. Written after the merge so a crash mid-merge
                // leaves us re-merging rather than skipping the peer's edits.
                await this.store.writeBase(selfId, peer.device.id, peerState);

                // Keep our clock ahead of anything we have now seen.
                const peerTop = highestStamp(peer.stamps, peer.device.id);
                this.clock = receive(this.clock, peerTop, Date.now(), selfId);
            }

            this.patchStatus({
                lastPullAt: now,
                peers: peers.map((p) => p.device),
                conflicts: allConflicts,
                error: null,
            });

            const outcome = {
                peers: peers.length,
                received: allChanged.size,
                conflicts: allConflicts.length,
            };

            if (allChanged.size === 0) return outcome;
            await this.applyIncoming(current, [...allChanged], allConflicts, now);
            return outcome;
        } catch (err) {
            console.error('Zenith sync: failed to pull', err);
            this.patchStatus({ error: describe(err) });
            return null;
        }
    }

    /** Write merged values into the store and record what moved. */
    private async applyIncoming(
        merged: SharedState,
        changed: SettingsKey[],
        conflicts: KeyConflict[],
        now: number
    ): Promise<void> {
        const settings = useZenithStore.getState().settings;
        const patch: Record<string, unknown> = {};
        const before: Record<string, unknown> = {};

        for (const key of changed) {
            const value = merged.values[key];
            if (value === undefined) continue;
            if (deepEqual(value, settings[key])) continue;
            patch[key] = value;
            before[key] = settings[key];
        }

        this.published = merged;
        if (Object.keys(patch).length === 0) return;

        this.applyingRemote = true;
        try {
            useZenithStore.getState().updateSettings(patch);
        } finally {
            this.applyingRemote = false;
        }

        await this.store?.appendJournal(this.registry.id, {
            at: encode(this.clock),
            wall: now,
            deviceId: this.registry.id,
            kind: conflicts.length > 0 ? 'conflict' : 'merge',
            keys: Object.keys(patch),
            before,
        });

        // Our outbox now carries values that came from elsewhere; republishing
        // makes that visible to the other peers with the stamps intact.
        await this.publish();
    }

    // ── Status plumbing ──────────────────────────────

    private patchStatus(patch: Partial<SyncStatus>): void {
        this.status = { ...this.status, ...patch };
        this.listeners.forEach((l) => l(this.status));
    }
}

/**
 * The highest stamp in a document, used to catch our clock up to it.
 *
 * `node` falls back to the document's owner so a clock built from an empty or
 * unstamped document still compares deterministically.
 */
function highestStamp(stamps: Record<string, string>, node: string): Hlc {
    let top = zero(node);
    for (const raw of Object.values(stamps)) {
        const parsed = parse(raw);
        if (parsed && compare(parsed, top) > 0) top = parsed;
    }
    return top;
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
