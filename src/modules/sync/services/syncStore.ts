import type { ModuleFs } from '../../../core/moduleFs';
import { emptyState, type SharedState } from '../stateMerge';
import {
    DEVICE_DOC_VERSION,
    isSafeDeviceId,
    type DeviceDoc,
    type JournalEntry,
    type SyncPaths,
} from '../syncTypes';

/**
 * Reading and writing the sync folder.
 *
 * Every read here treats what it finds as untrusted. These files arrive from
 * another machine through a sync tool that can truncate a write, and they sit
 * in a folder the user can open in any editor. A malformed document must
 * degrade to "this peer has nothing to say" — never to an exception during
 * plugin load, and never to a value applied to settings unchecked.
 */
export class SyncStore {
    constructor(
        private readonly fs: ModuleFs,
        private readonly paths: SyncPaths
    ) {}

    async ensureFolders(selfId: string): Promise<void> {
        await this.fs.mkdirp(this.paths.outboxDir);
        await this.fs.mkdirp(this.paths.baseDir(selfId));
    }

    // ── Outbox ───────────────────────────────────────

    /** Publish this device's document. Only ever called for our own id. */
    async writeOutbox(doc: DeviceDoc): Promise<void> {
        await this.fs.mkdirp(this.paths.outboxDir);
        await this.fs.write(this.paths.outbox(doc.device.id), JSON.stringify(doc, null, 2));
    }

    async readOutbox(deviceId: string): Promise<DeviceDoc | null> {
        return this.readDoc(this.paths.outbox(deviceId));
    }

    /**
     * Every peer's document — that is, every outbox but our own.
     *
     * Doubles as the device registry: a device is "known" precisely because it
     * has published, so there is no separate list to keep in step and nothing
     * for two devices to contend over.
     */
    async readPeers(selfId: string): Promise<DeviceDoc[]> {
        const files = await this.fs.listFiles(this.paths.outboxDir);
        const out: DeviceDoc[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const id = file.slice(0, -'.json'.length);
            if (id === selfId || !isSafeDeviceId(id)) continue;

            const doc = await this.readDoc(this.paths.outbox(id));
            // A document claiming an id other than its filename is either
            // corrupt or a copied vault; either way we cannot tell which device
            // it really came from, so it is not a peer.
            if (doc && doc.device.id === id) out.push(doc);
        }

        return out;
    }

    // ── Base (our copy of each peer's last-merged document) ──

    async readBase(selfId: string, peerId: string): Promise<SharedState | null> {
        const raw = await this.readJson(this.paths.base(selfId, peerId));
        return raw ? toSharedState(raw) : null;
    }

    async writeBase(selfId: string, peerId: string, state: SharedState): Promise<void> {
        await this.fs.mkdirp(this.paths.baseDir(selfId));
        await this.fs.write(
            this.paths.base(selfId, peerId),
            JSON.stringify({ version: state.version, values: state.values, stamps: state.stamps })
        );
    }

    // ── This device's own settings ───────────────────

    /**
     * The `device`-scoped settings as this device last had them.
     *
     * Read back on load and applied over whatever `data.json` holds, because
     * `data.json` is carried between devices by the transport like any other
     * file — without this, another machine's copy arriving would bring its
     * density and dashboard layout with it, which is exactly what scoping those
     * keys `device` was supposed to prevent.
     */
    async readLocal(deviceId: string): Promise<Record<string, unknown> | null> {
        const raw = await this.readJson(this.paths.local(deviceId));
        const values = raw?.values;
        if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
        return values as Record<string, unknown>;
    }

    async writeLocal(deviceId: string, values: Record<string, unknown>): Promise<void> {
        const path = this.paths.local(deviceId);
        await this.fs.mkdirp(path.slice(0, path.lastIndexOf('/')));
        await this.fs.write(path, JSON.stringify({ version: DEVICE_DOC_VERSION, values }, null, 2));
    }

    // ── Journal ──────────────────────────────────────

    /**
     * Append one history line.
     *
     * JSON Lines rather than a JSON array: appending to an array means reading
     * and rewriting the whole file, which turns the history into the one thing
     * in this module that two devices could race over. One line per event also
     * means a truncated write costs the last line, not the file.
     */
    async appendJournal(deviceId: string, entry: JournalEntry): Promise<void> {
        const path = this.paths.journal(deviceId);
        await this.fs.mkdirp(path.slice(0, path.lastIndexOf('/')));
        const line = `${JSON.stringify(entry)}\n`;
        const existing = (await this.fs.exists(path)) ? await this.fs.read(path) : '';
        await this.fs.write(path, existing + line);
    }

    /** Recent history from every device, newest first. */
    async readJournal(limit = 200): Promise<JournalEntry[]> {
        const dir = `${this.paths.root}/journal`;
        const files = await this.fs.listFiles(dir);
        const entries: JournalEntry[] = [];

        for (const file of files) {
            if (!file.endsWith('.jsonl')) continue;
            try {
                const text = await this.fs.read(`${dir}/${file}`);
                for (const line of text.split('\n')) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line) as JournalEntry;
                        if (parsed && typeof parsed.at === 'string') entries.push(parsed);
                    } catch {
                        // One damaged line, not a damaged history.
                    }
                }
            } catch {
                // Unreadable file — skip it rather than losing the rest.
            }
        }

        // `at` is an encoded HLC, which is fixed-width and so sorts correctly
        // as a plain string. See `hlc.encode`.
        entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return entries.slice(0, limit);
    }

    /** Drop history lines older than `keep` entries, per device. */
    async trimJournal(deviceId: string, keep = 500): Promise<void> {
        const path = this.paths.journal(deviceId);
        if (!(await this.fs.exists(path))) return;
        const lines = (await this.fs.read(path)).split('\n').filter((l) => l.trim());
        if (lines.length <= keep) return;
        await this.fs.write(path, `${lines.slice(-keep).join('\n')}\n`);
    }

    // ── Reading, defensively ─────────────────────────

    private async readDoc(path: string): Promise<DeviceDoc | null> {
        const raw = await this.readJson(path);
        if (!raw) return null;

        const device = (raw as { device?: unknown }).device;
        if (!device || typeof device !== 'object') return null;
        const d = device as Record<string, unknown>;
        if (!isSafeDeviceId(d.id)) return null;

        const state = toSharedState(raw);
        if (!state) return null;

        return {
            ...state,
            device: {
                id: d.id,
                name: typeof d.name === 'string' && d.name.trim() ? d.name : d.id,
                platform:
                    d.platform === 'desktop' ||
                    d.platform === 'ios' ||
                    d.platform === 'android' ||
                    d.platform === 'mobile'
                        ? d.platform
                        : 'unknown',
                pluginVersion: typeof d.pluginVersion === 'string' ? d.pluginVersion : '',
                lastSeenAt: typeof d.lastSeenAt === 'number' ? d.lastSeenAt : 0,
            },
        };
    }

    private async readJson(path: string): Promise<Record<string, unknown> | null> {
        try {
            if (!(await this.fs.exists(path))) return null;
            const text = await this.fs.read(path);
            const parsed: unknown = JSON.parse(text);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed as Record<string, unknown>;
        } catch {
            // A half-written file mid-sync, or hand-edited JSON. Either way the
            // right answer is "nothing to read", not a thrown error on load.
            return null;
        }
    }
}

/**
 * Coerce a parsed object into a `SharedState`, or null if it is not one.
 *
 * Note this validates the SHAPE, not the values: whether `weatherUnit` really
 * holds `'c'` is settled where the setting is used, exactly as it already is
 * for anything read back from `data.json`.
 */
function toSharedState(raw: Record<string, unknown>): SharedState | null {
    const values = raw.values;
    const stamps = raw.stamps;
    if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
    if (!stamps || typeof stamps !== 'object' || Array.isArray(stamps)) return null;

    const state = emptyState();
    state.version = typeof raw.version === 'number' ? raw.version : DEVICE_DOC_VERSION;
    state.values = values as SharedState['values'];
    // Drop non-string stamps rather than the whole document: an unstamped key
    // reads as "never set here" and simply loses, which is recoverable.
    state.stamps = Object.fromEntries(
        Object.entries(stamps as Record<string, unknown>).filter(([, v]) => typeof v === 'string')
    ) as Record<string, string>;
    return state;
}
