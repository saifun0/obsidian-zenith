import type { ModuleFs } from '../../../core/moduleFs';
import {
    ACTIONABLE_DECISIONS,
    type FileEntity,
    type PlanOptions,
    type PrevSyncRecord,
    type SyncPlan,
    type SyncPlanItem,
} from '../fileSyncTypes';
import { buildSyncPlan, toPrevRecord } from './syncPlan';
import { mergeMarkdown, type MergeNote } from './conflictResolve';
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
    /** Include `.obsidian` — themes, other plugins' settings, workspace layout. */
    includeConfigDir: boolean;
    /** Extra vault-relative prefixes the user excluded. */
    userExcludes: string[];
    /** Where this plugin lives, so the engine can refuse to sync its own state. */
    pluginDir: string;
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
            return { plan, applied: 0, failed: [], refused: true, merges: [] };
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
                opts.onProgress?.({ done, total: work.length, key: item.key });
            }
        };

        await this.pool(transfers, run);
        await this.pool(deletions, run);

        await this.recordPrev(plan, settled);

        return { plan, applied: settled.size, failed, refused: false, merges };
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

        const options = {
            // The same rule the other conflict actions use, so switching to
            // `smart` does not silently change who wins a tie.
            prefer: (pickNewer(item) === 'remote' ? 'remote' : 'local') as 'local' | 'remote',
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
            userExcludes: this.opts.userExcludes,
            pluginDir: this.opts.pluginDir,
            localRoot: this.opts.localRoot,
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
    userExcludes: string[];
    /** Vault path of this plugin, e.g. `.obsidian/plugins/zenith`. */
    pluginDir: string;
    localRoot: string;
}

/**
 * Which paths the engine must not touch.
 *
 * Pure and exported so the rules can be tested directly — the hard-wired ones
 * especially. Zenith's own `data.json` and `sync/` folder are excluded
 * unconditionally, config-dir setting or not: the settings layer already owns
 * those files, and two writers on one file is precisely the bug this whole
 * module exists to fix. Letting the file engine carry them would reintroduce it
 * one level down.
 */
export function buildExcluder(opts: ExcluderOptions): (key: string) => boolean {
    const root = trimSlashes(opts.localRoot);

    /** A plugin-dir path, expressed relative to the sync root. */
    const relativeToRoot = (vaultPath: string): string | null => {
        const clean = trimSlashes(vaultPath);
        if (!root) return clean;
        if (clean === root) return '';
        return clean.startsWith(`${root}/`) ? clean.slice(root.length + 1) : null;
    };

    const pluginRel = relativeToRoot(opts.pluginDir);
    const ownState = pluginRel === null ? [] : [`${pluginRel}/sync`, `${pluginRel}/data.json`];
    const userPrefixes = opts.userExcludes.map(trimSlashes).filter(Boolean);

    const configRel = relativeToRoot('.obsidian');

    return (key: string): boolean => {
        if (!key) return true;

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
