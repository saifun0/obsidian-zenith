import type { ModuleFs } from '../../../core/moduleFs';
import {
    ACTIONABLE_DECISIONS,
    type FileEntity,
    type ForceDirection,
    type PlanOptions,
    type PrevSyncRecord,
    type SyncPlan,
    type SyncPlanItem,
} from '../fileSyncTypes';
import { buildForcedPlan, buildSyncPlan, toPrevRecord } from './syncPlan';
import { mergeMarkdown, type MergeNote, type MergeOptions } from './conflictResolve';
import { mergeCanvas } from './canvasMerge';
import { PrevSyncStore } from './prevSyncStore';
import type { SyncRemote } from './remotes/types';

/**
 * Runs a file sync: gather, plan, and — only if asked — apply.
 *
 * Planning and applying are separate calls on purpose. `plan()` touches nothing
 * and is what the preview shows; `apply()` is the only method that writes, and
 * it refuses a plan the safety rails flagged unless the caller passes an
 * explicit override. That split is what makes "look before it deletes forty
 * notes" the default rather than a setting.
 */

export interface EngineOptions {
    /** Vault-relative folder to sync. Empty means the whole vault. */
    localRoot: string;
    /** Include the config folder — themes, other plugins' settings, workspace layout. */
    includeConfigDir: boolean;
    /** The vault's config folder, `.obsidian` unless the user renamed it (`Vault#configDir`). */
    configDir: string;
    /** Extra vault-relative prefixes the user excluded. */
    userExcludes: string[];
    /** Where this plugin lives, so the engine can refuse to sync its own state. */
    pluginDir: string;
    /**
     * Carry each device's settings outbox and history — settings sync is on,
     * and this engine may be the only thing moving the vault between devices.
     */
    carrySettings?: boolean;
    conflictAction: PlanOptions['conflictAction'];
    protectModifyRatio: number;
    maxFileSize: number;
    /** Parallel transfers. */
    concurrency: number;
    deviceLabel: string;
}

export interface SyncProgress {
    done: number;
    total: number;
    key: string;
    /**
     * Bytes moved so far, against what the plan expects to move.
     *
     * Counted rather than measured: the size comes from the plan's own entities,
     * so it is what the two sides claimed before the run began. That is enough
     * for a rate and an estimate and is not enough to bill anyone for — a file
     * edited between the preview and the run moves a different number of bytes
     * than this says, and encryption adds its own overhead on top.
     *
     * A run is counted in files as well because a deletion moves nothing at all:
     * a plan that only removes paths would otherwise sit at zero of zero bytes
     * for its whole length, which reads as a stuck progress bar.
     */
    bytes: number;
    totalBytes: number;
    /** When the run began — a rate is this and the clock, and nothing else. */
    startedAt: number;
}

/**
 * How much a single decision moves.
 *
 * The larger of the two sides, because a push sends the local copy and a pull
 * fetches the remote one and only one of the two is ever set for a creation.
 * Deletions are zero: removing a path transfers no content, and counting its
 * old size would make a run that frees space look like a run that spends it.
 */
function itemBytes(item: SyncPlanItem): number {
    if (isDeletion(item)) return 0;
    return Math.max(item.local?.size ?? 0, item.remote?.size ?? 0);
}

/** What a `smart` conflict actually resolved to, once the contents were read. */
export interface MergeOutcomeReport {
    key: string;
    /** `merged` reconciled the note; `kept_both` means it could not be proven. */
    outcome: 'merged' | 'kept_both';
    /** Why it could not merge, when it could not. */
    reason?: string;
    notes: MergeNote[];
}

export interface SyncRunResult {
    plan: SyncPlan;
    /** Items carried out successfully. */
    applied: number;
    /** Items that threw, with the reason. The run continues past each. */
    failed: Array<{ key: string; error: string }>;
    /** True when nothing was applied because the plan was blocked. */
    refused: boolean;
    /**
     * How each attempted merge turned out.
     *
     * The plan could only promise an attempt — it has metadata, not contents —
     * so this is where the user finds out which notes were actually reconciled
     * and which were left as two copies to sort out by hand.
     */
    merges: MergeOutcomeReport[];
    /**
     * Another device's settings outbox came down in this run, so settings sync
     * has something new to merge — now, rather than at its next poll.
     */
    settingsArrived: boolean;
}

const MTIME_TOLERANCE_MS = 2000;
const PROTECT_MIN_FILES = 10;

export class SyncEngine {
    private readonly prevStore: PrevSyncStore;

    constructor(
        private readonly fs: ModuleFs,
        private readonly remote: SyncRemote,
        prevStore: PrevSyncStore,
        private readonly deviceId: string,
        private readonly opts: EngineOptions
    ) {
        this.prevStore = prevStore;
    }

    /**
     * Work out what a run would do. Reads both sides; writes nothing.
     */
    async plan(now = Date.now()): Promise<SyncPlan> {
        const [local, remote, prev] = await Promise.all([
            this.listLocal(),
            this.remote.list(),
            this.prevStore.read(this.deviceId, this.remote.id),
        ]);

        return buildSyncPlan(local, remote, prev, {
            conflictAction: this.opts.conflictAction,
            protectModifyRatio: this.opts.protectModifyRatio,
            protectMinFiles: PROTECT_MIN_FILES,
            maxFileSize: this.opts.maxFileSize,
            mtimeToleranceMs: MTIME_TOLERANCE_MS,
            isExcluded: this.excluder(),
            isMergeable: isMergeableKey,
            deviceLabel: this.opts.deviceLabel,
            now,
            firstRun: prev.length === 0,
            ownerOf: this.owner(),
        });
    }

    /**
     * Work out what overwriting one side with the other would do.
     *
     * Same three listings as `plan()`, handed to a builder that has been told
     * the answer instead of working it out — see `buildForcedPlan`. It is a
     * separate entry point rather than a flag on `plan()` because the two
     * answer different questions, and a boolean deep in a call chain is how
     * "what changed" quietly becomes "delete the other side".
     */
    async forcePlan(direction: ForceDirection, now = Date.now()): Promise<SyncPlan> {
        const [local, remote, prev] = await Promise.all([
            this.listLocal(),
            this.remote.list(),
            this.prevStore.read(this.deviceId, this.remote.id),
        ]);

        return buildForcedPlan(local, remote, prev, direction, {
            conflictAction: this.opts.conflictAction,
            protectModifyRatio: this.opts.protectModifyRatio,
            protectMinFiles: PROTECT_MIN_FILES,
            maxFileSize: this.opts.maxFileSize,
            mtimeToleranceMs: MTIME_TOLERANCE_MS,
            isExcluded: this.excluder(),
            isMergeable: isMergeableKey,
            deviceLabel: this.opts.deviceLabel,
            now,
            firstRun: prev.length === 0,
        });
    }

    /**
     * Carry out a plan.
     *
     * `force` is the user having read a blocked plan and said yes anyway. It is
     * a parameter rather than a setting so that consenting is always an act, and
     * never a state someone left switched on months ago.
     */
    async apply(
        plan: SyncPlan,
        opts: { force?: boolean; onProgress?: (p: SyncProgress) => void } = {}
    ): Promise<SyncRunResult> {
        if (plan.blocked && !opts.force) {
            return {
                plan,
                applied: 0,
                failed: [],
                refused: true,
                merges: [],
                settingsArrived: false,
            };
        }

        const work = plan.items.filter((i) => ACTIONABLE_DECISIONS.has(i.decision));
        // Transfers first, deletions last. If a transfer fails the run stops
        // short of removing anything, which leaves both sides holding more data
        // than they should rather than less.
        const transfers = work.filter((i) => !isDeletion(i));
        const deletions = work.filter(isDeletion);

        const failed: SyncRunResult['failed'] = [];
        const merges: MergeOutcomeReport[] = [];
        const settled = new Map<string, PrevSyncRecord | null>();
        let done = 0;
        let bytes = 0;

        const totalBytes = work.reduce((sum, item) => sum + itemBytes(item), 0);
        const startedAt = Date.now();

        const run = async (item: SyncPlanItem) => {
            try {
                const record = await this.carryOut(item, merges);
                settled.set(item.key, record);
            } catch (err) {
                // One unreachable file must not abandon the rest of the run, and
                // must not update its previous-sync record — leaving it unsettled
                // is what makes the next run retry it.
                failed.push({ key: item.key, error: describe(err) });
            } finally {
                done++;
                // Counted on the way out whether the item succeeded or not: the
                // bar is reporting how far through the WORK the run is, and a
                // failure is a finished attempt. Skipping it would leave the bar
                // permanently short of the end on any run with a bad file in it.
                bytes += itemBytes(item);
                opts.onProgress?.({
                    done,
                    total: work.length,
                    key: item.key,
                    bytes,
                    totalBytes,
                    startedAt,
                });
            }
        };

        await this.pool(transfers, run);
        await this.pool(deletions, run);

        await this.recordPrev(plan, settled);

        const ownerOf = this.owner();
        const settingsArrived = work.some(
            (item) => settled.has(item.key) && isPull(item) && ownerOf(item.key) === 'remote'
        );

        return { plan, applied: settled.size, failed, refused: false, merges, settingsArrived };
    }

    // ── Carrying out one decision ────────────────────

    /**
     * Returns the record to remember for this path, or null when the path should
     * be forgotten (it no longer exists on either side).
     */
    private async carryOut(
        item: SyncPlanItem,
        merges: MergeOutcomeReport[]
    ): Promise<PrevSyncRecord | null> {
        switch (item.decision) {
            case 'local_is_created_then_push':
            case 'local_is_modified_then_push':
            case 'conflict_created_then_keep_local':
                return this.push(item.key);

            case 'remote_is_created_then_pull':
            case 'remote_is_modified_then_pull':
            case 'conflict_created_then_keep_remote':
                return this.pull(item.key);

            case 'conflict_created_then_smart_merge':
                return this.smartMerge(item, merges);

            case 'conflict_created_then_keep_both': {
                // The remote copy lands beside the local one under a new name,
                // then the local one is pushed as the canonical version. Both
                // survive, and both devices end up seeing both.
                if (item.conflictCopyKey) await this.pull(item.conflictCopyKey, item.key);
                return this.push(item.key);
            }

            case 'local_is_deleted_thus_also_delete_remote':
                await this.remote.remove(item.key);
                return null;

            case 'remote_is_deleted_thus_also_delete_local':
                await this.fs.removeFile(this.localPath(item.key));
                return null;

            default:
                return null;
        }
    }

    /**
     * Read both versions, reconcile them, and put the result on both sides.
     *
     * Falls back to keeping both copies whenever the merge cannot be proven
     * safe — including when either side is not decodable text. That fallback is
     * the reason this is allowed to run automatically at all: the worst outcome
     * is two files where there was one, which the user can see and fix, rather
     * than a note quietly rewritten.
     */
    private async smartMerge(
        item: SyncPlanItem,
        merges: MergeOutcomeReport[]
    ): Promise<PrevSyncRecord | null> {
        const path = this.localPath(item.key);
        const localText = decodeText(await this.fs.readBinary(path));
        const remoteText = decodeText(await this.remote.readBinary(item.key));

        const keepBoth = async (reason: string): Promise<PrevSyncRecord | null> => {
            merges.push({ key: item.key, outcome: 'kept_both', reason, notes: [] });
            if (item.conflictCopyKey) await this.pull(item.conflictCopyKey, item.key);
            return this.push(item.key);
        };

        if (localText === null || remoteText === null) {
            return keepBoth('not decodable as text');
        }

        const options: MergeOptions = {
            // The same rule the other conflict actions use, so switching to
            // `smart` does not silently change who wins a tie.
            prefer: pickNewer(item) === 'remote' ? 'remote' : 'local',
        };
        // A canvas is JSON, and the line-oriented merger sees JSON as prose: it
        // would refuse the moment both sides were touched, however unrelated
        // the two edits were. Nodes and edges carry ids, so they can be matched
        // up properly instead.
        const outcome = item.key.toLowerCase().endsWith('.canvas')
            ? mergeCanvas(localText, remoteText, options)
            : mergeMarkdown(localText, remoteText, options);

        if (outcome.kind === 'unmergeable') return keepBoth(outcome.reason);
        if (outcome.kind === 'identical') {
            merges.push({ key: item.key, outcome: 'merged', notes: [] });
            return this.push(item.key);
        }

        await this.fs.write(path, outcome.text);
        merges.push({ key: item.key, outcome: 'merged', notes: outcome.notes });
        return this.push(item.key);
    }

    private async push(key: string): Promise<PrevSyncRecord | null> {
        const path = this.localPath(key);
        const stat = await this.fs.stat(path);
        if (!stat || stat.type !== 'file') return null;

        const data = await this.fs.readBinary(path);
        const stored = await this.remote.write(key, data, stat.mtime);
        return toPrevRecord({ key, size: stat.size, mtimeCli: stat.mtime }, stored);
    }

    /**
     * Download `key` from the remote. `writeAs` lets a conflict copy be written
     * under a different name than it has on the server.
     */
    private async pull(key: string, sourceKey = key): Promise<PrevSyncRecord | null> {
        const data = await this.remote.readBinary(sourceKey);
        const path = this.localPath(key);

        const slash = path.lastIndexOf('/');
        if (slash > 0) await this.fs.mkdirp(path.slice(0, slash));
        await this.fs.writeBinary(path, data);

        const stat = await this.fs.stat(path);
        // Re-read rather than assume: the remote entity we planned against may
        // be stale, and the record has to describe what is there now.
        //
        // One object, not the whole listing. This used to walk the entire remote
        // tree once per downloaded file, which on a run that pulls a few hundred
        // notes is a few hundred complete recursive listings — slow against any
        // server and enough on its own to get the device throttled by Dropbox
        // before the run finished.
        const remoteNow = await this.remote.stat(sourceKey);
        if (!stat || !remoteNow) return null;

        return toPrevRecord({ key, size: stat.size, mtimeCli: stat.mtime }, remoteNow);
    }

    // ── Previous-sync bookkeeping ────────────────────

    /**
     * Fold this run's outcomes into the stored record.
     *
     * Paths that were already `equal` keep the record they had; paths that were
     * carried out get a fresh one; paths that failed keep the OLD record, so the
     * next run sees them as still needing work rather than as settled.
     */
    private async recordPrev(
        plan: SyncPlan,
        settled: Map<string, PrevSyncRecord | null>
    ): Promise<void> {
        const out: PrevSyncRecord[] = [];

        for (const item of plan.items) {
            if (settled.has(item.key)) {
                const record = settled.get(item.key);
                if (record) out.push(record);
                // A null record means the path is gone from both sides; dropping
                // it is what stops a deleted file being resurrected next run.
                continue;
            }

            if (item.decision === 'equal' && item.local && item.remote) {
                out.push(toPrevRecord(item.local, item.remote));
                continue;
            }

            // Skipped, failed, or gone — keep whatever we knew before.
            if (item.prev) out.push(item.prev);
        }

        await this.prevStore.write(this.deviceId, this.remote.id, out);
    }

    /** Forget this remote entirely; the next run is a reviewed first run. */
    async forgetHistory(): Promise<void> {
        await this.prevStore.forget(this.deviceId, this.remote.id);
    }

    // ── Local side ───────────────────────────────────

    private async listLocal(): Promise<FileEntity[]> {
        const root = trimSlashes(this.opts.localRoot);
        const paths = await this.fs.walk(root || '/');
        const isExcluded = this.excluder();
        const out: FileEntity[] = [];

        for (const path of paths) {
            const key = this.toKey(path);
            if (key === null || isExcluded(key)) continue;
            const stat = await this.fs.stat(path);
            if (!stat || stat.type !== 'file') continue;
            out.push({ key, size: stat.size, mtimeCli: stat.mtime });
        }

        return out;
    }

    private localPath(key: string): string {
        const root = trimSlashes(this.opts.localRoot);
        return root ? `${root}/${key}` : key;
    }

    /** Vault path → key relative to the sync root, or null if outside it. */
    private toKey(path: string): string | null {
        const root = trimSlashes(this.opts.localRoot);
        const clean = trimSlashes(path);
        if (!root) return clean;
        if (clean === root) return '';
        return clean.startsWith(`${root}/`) ? clean.slice(root.length + 1) : null;
    }

    private excluder(): (key: string) => boolean {
        return buildExcluder({
            includeConfigDir: this.opts.includeConfigDir,
            configDir: this.opts.configDir,
            userExcludes: this.opts.userExcludes,
            pluginDir: this.opts.pluginDir,
            localRoot: this.opts.localRoot,
            carrySettings: this.opts.carrySettings,
        });
    }

    private owner(): (key: string) => 'local' | 'remote' | null {
        return settingsOwner({
            pluginDir: this.opts.pluginDir,
            localRoot: this.opts.localRoot,
            deviceId: this.deviceId,
            carrySettings: this.opts.carrySettings,
        });
    }

    // ── Bounded parallelism ──────────────────────────

    /**
     * Run `task` over `items`, at most `concurrency` at a time.
     *
     * A plain `Promise.all` over a few thousand files opens a few thousand
     * requests at once, which mobile webviews and most WebDAV servers answer by
     * failing all of them.
     */
    private async pool<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
        const limit = Math.max(1, Math.min(16, this.opts.concurrency));
        let cursor = 0;

        const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const item = items[cursor++];
                await task(item);
            }
        });

        await Promise.all(workers);
    }
}

// ── Exclusions ───────────────────────────────────────

export interface ExcluderOptions {
    includeConfigDir: boolean;
    /** The vault's config folder, `.obsidian` unless the user renamed it. */
    configDir: string;
    userExcludes: string[];
    /** Vault path of this plugin, e.g. `.obsidian/plugins/zenith`. */
    pluginDir: string;
    localRoot: string;
    /** Let settings sync's outboxes and history through. See below. */
    carrySettings?: boolean;
}

/** The parts of Zenith's `sync/` folder that travel, when settings sync is on. */
const CARRIED_SETTINGS = ['outbox', 'journal'] as const;

/** A vault path, expressed relative to the sync root; null when outside it. */
function relativeTo(localRoot: string, vaultPath: string): string | null {
    const root = trimSlashes(localRoot);
    const clean = trimSlashes(vaultPath);
    if (!root) return clean;
    if (clean === root) return '';
    return clean.startsWith(`${root}/`) ? clean.slice(root.length + 1) : null;
}

/**
 * Which paths the engine must not touch.
 *
 * Pure and exported so the rules can be tested directly — the hard-wired ones
 * especially. Zenith's own `data.json` and `sync/` folder are excluded
 * unconditionally, config-dir setting or not: the settings layer already owns
 * those files, and two writers on one file is precisely the bug this whole
 * module exists to fix. Letting the file engine carry them would reintroduce it
 * one level down. `cache/` too: it holds what each device fetched for itself
 * (the prayer year tables), and carrying it would be traffic and conflicts for
 * files any device can fetch again.
 *
 * With one exception, while settings sync is on: its outboxes and history
 * travel, config folder or not. Settings sync moves nothing itself — it waits
 * for the vault to carry those files — and where this engine is what carries
 * the vault, excluding them left every device merging with nobody. They are
 * safe to carry because each has one writer, the device in its name (see
 * `settingsOwner`). The rest of `sync/` stays: bases, each device's own layout
 * with its tokens, and this engine's own records.
 */
export function buildExcluder(opts: ExcluderOptions): (key: string) => boolean {
    const pluginRel = relativeTo(opts.localRoot, opts.pluginDir);
    const ownState =
        pluginRel === null
            ? []
            : [`${pluginRel}/sync`, `${pluginRel}/data.json`, `${pluginRel}/cache`];
    const carried =
        opts.carrySettings && pluginRel
            ? CARRIED_SETTINGS.map((part) => `${pluginRel}/sync/${part}`)
            : [];
    const userPrefixes = opts.userExcludes.map(trimSlashes).filter(Boolean);

    const configRel = relativeTo(opts.localRoot, opts.configDir);

    return (key: string): boolean => {
        if (!key) return true;

        // Under a carried folder only the user's own exclusions still apply.
        if (carried.some((dir) => key === dir || key.startsWith(`${dir}/`))) {
            return userPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`));
        }

        for (const own of ownState) {
            if (key === own || key.startsWith(`${own}/`)) return true;
        }

        if (!opts.includeConfigDir && configRel !== null && configRel !== '') {
            if (key === configRel || key.startsWith(`${configRel}/`)) return true;
        }

        for (const prefix of userPrefixes) {
            if (key === prefix || key.startsWith(`${prefix}/`)) return true;
        }

        return false;
    };
}

/**
 * Who writes a carried settings file: this device its own outbox and history,
 * the other side every other device's. Settings sync writes only the files
 * named after this device, so the other copy of one is never a competing edit —
 * only an older download of it. Null for every other path.
 */
export function settingsOwner(opts: {
    pluginDir: string;
    localRoot: string;
    deviceId: string;
    carrySettings?: boolean;
}): (key: string) => 'local' | 'remote' | null {
    const pluginRel = relativeTo(opts.localRoot, opts.pluginDir);
    if (!opts.carrySettings || !pluginRel) return () => null;
    const folders: Array<[string, string]> = [
        [`${pluginRel}/sync/outbox/`, '.json'],
        [`${pluginRel}/sync/journal/`, '.jsonl'],
    ];

    return (key: string) => {
        for (const [folder, ext] of folders) {
            if (!key.startsWith(folder) || !key.endsWith(ext)) continue;
            const name = key.slice(folder.length, key.length - ext.length);
            if (!name || name.includes('/')) return null;
            return name === opts.deviceId ? 'local' : 'remote';
        }
        return null;
    };
}

// ── Helpers ──────────────────────────────────────────

/**
 * Which side a tie goes to, by the client timestamps the plan already gathered.
 */
function pickNewer(item: SyncPlanItem): 'local' | 'remote' {
    const local = item.local?.mtimeCli ?? 0;
    const remote = item.remote?.mtimeCli ?? 0;
    return local >= remote ? 'local' : 'remote';
}

/**
 * Only Markdown is worth attempting a semantic merge on.
 *
 * The merger reasons about frontmatter and task lines; pointing it at a PDF
 * would produce something that looks like a merge and is not one.
 */
export function isMergeableKey(key: string): boolean {
    return key.toLowerCase().endsWith('.md');
}

/**
 * Decode bytes as UTF-8, or null when they are not text.
 *
 * `fatal` is the point: without it an image decodes to replacement characters
 * and the merger would happily "reconcile" two corrupted strings and write the
 * result back over a real file.
 */
function decodeText(buffer: ArrayBuffer): string | null {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        return null;
    }
}

function isPull(item: SyncPlanItem): boolean {
    return (
        item.decision === 'remote_is_created_then_pull' ||
        item.decision === 'remote_is_modified_then_pull' ||
        item.decision === 'conflict_created_then_keep_remote'
    );
}

function isDeletion(item: SyncPlanItem): boolean {
    return (
        item.decision === 'local_is_deleted_thus_also_delete_remote' ||
        item.decision === 'remote_is_deleted_thus_also_delete_local'
    );
}

function trimSlashes(s: string): string {
    return s.replace(/^\/+|\/+$/g, '');
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
