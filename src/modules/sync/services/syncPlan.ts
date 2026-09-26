import {
    ACTIONABLE_DECISIONS,
    DESTRUCTIVE_DECISIONS,
    type FileEntity,
    type ForceDirection,
    type PlanOptions,
    type PrevSide,
    type PrevSyncRecord,
    type SyncDecision,
    type SyncPlan,
    type SyncPlanItem,
    type SyncPlanStats,
} from '../fileSyncTypes';

/**
 * Decide what a sync run would do, without doing any of it.
 *
 * Pure by construction: no network, no disk, no clock. Every input is passed in,
 * including `now`. This is the file in the module where a mistake deletes
 * someone's notes, so it is the file that has to be exhaustively testable, and
 * anything it cannot reach cannot be tested.
 *
 * ── Why three inputs ──
 *
 * `local` and `remote` alone cannot tell a deletion from an addition. A file
 * present on one side only is either "they added it" or "I deleted it", and the
 * two demand opposite actions. `prev` — what both sides looked like at the end
 * of the last successful run — is what separates them, and it is the reason the
 * engine can be trusted to delete anything at all.
 *
 * The corollary is a hard rule: **no deletion is ever produced for a path with
 * no `prev` record.** An unrecognised file is a creation. That single rule
 * covers the worst failure this engine could have — a remote that returns an
 * empty listing after an expired token would otherwise read as "the user
 * deleted their whole vault".
 */
export function buildSyncPlan(
    local: FileEntity[],
    remote: FileEntity[],
    prev: PrevSyncRecord[],
    opts: PlanOptions
): SyncPlan {
    const localMap = byKey(local);
    const remoteMap = byKey(remote);
    const prevMap = new Map(prev.map((p) => [p.key, p]));

    const keys = [...new Set([...localMap.keys(), ...remoteMap.keys(), ...prevMap.keys()])].sort();

    const items: SyncPlanItem[] = keys.map((key) =>
        planFor(key, localMap.get(key), remoteMap.get(key), prevMap.get(key), opts)
    );

    const stats = tally(items);
    const actionable = items.filter((i) => ACTIONABLE_DECISIONS.has(i.decision)).length;

    return { items, stats, actionable, blocked: block(items, actionable, keys.length, opts) };
}

/**
 * A plan that stops asking which side is right and is told.
 *
 * The ordinary builder above exists to work out what happened. Sometimes there
 * is nothing to work out: the vault was restored from a backup, a device was
 * offline for a month, `prev` was lost, or two sides diverged so far that
 * reconciling them file by file is not worth anybody's afternoon. What the
 * user wants then is not a better comparison — it is for one side to win.
 *
 * So this ignores `prev` entirely for the decision, and derives every item
 * from presence alone:
 *
 *   · `push` — every local file goes up, and every remote file with no local
 *     counterpart is removed from the server;
 *   · `pull` — every remote file comes down, and every local file with no
 *     remote counterpart is removed from the vault.
 *
 * Three things it deliberately keeps from the ordinary path. Excluded and
 * oversized files are still skipped, via the same `guard` — scope is a promise
 * about which files this engine touches at all, not a preference that a
 * different button overrules. `prev` is still carried on each item, so
 * `recordPrev` writes correct bookkeeping afterwards and the NEXT ordinary run
 * has a truthful baseline. And identical files are still marked `equal` rather
 * than re-uploaded, because a forced push of an unchanged vault should cost
 * nothing.
 *
 * The result is always `blocked` when it would do anything — see
 * `forced_overwrite`. That is not a safety rail bolted on; it is the whole
 * interaction. The button produces a plan, the plan is read, and the user
 * presses the red one. Nothing here can run unattended.
 */
export function buildForcedPlan(
    local: FileEntity[],
    remote: FileEntity[],
    prev: PrevSyncRecord[],
    direction: ForceDirection,
    opts: PlanOptions
): SyncPlan {
    const localMap = byKey(local);
    const remoteMap = byKey(remote);
    const prevMap = new Map(prev.map((p) => [p.key, p]));

    // `prev` keys are left out on purpose. A path both sides have forgotten is
    // already gone everywhere, and the ordinary builder only visits it to drop
    // its stale record — which a forced run has no business doing, because it
    // would show the user a row about a file that does not exist.
    const keys = [...new Set([...localMap.keys(), ...remoteMap.keys()])].sort();

    const items: SyncPlanItem[] = keys.map((key) => {
        const base = {
            key,
            local: localMap.get(key),
            remote: remoteMap.get(key),
            prev: prevMap.get(key),
        };

        const skipped = guard(base, opts);
        if (skipped) return skipped;

        return { ...base, ...forcedVerdict(base.local, base.remote, direction, opts) };
    });

    const stats = tally(items);
    const actionable = items.filter((i) => ACTIONABLE_DECISIONS.has(i.decision)).length;

    return {
        items,
        stats,
        actionable,
        // Nothing to do is never worth interrupting for — the same exemption
        // `block()` makes, and for the same reason.
        blocked: actionable === 0 ? null : { kind: 'forced_overwrite', actionable, known: keys.length },
    };
}

/** One path, once the direction has already been decided for it. */
function forcedVerdict(
    local: FileEntity | undefined,
    remote: FileEntity | undefined,
    direction: ForceDirection,
    opts: PlanOptions
): Verdict {
    const winner = direction === 'push' ? local : remote;
    const loser = direction === 'push' ? remote : local;

    // Present on both, and the same file. Saying `equal` rather than
    // transferring it is what keeps "force push a vault that was already in
    // step" a cheap no-op instead of a full re-upload.
    if (local && remote && sameContent(local, remote, opts.mtimeToleranceMs)) {
        return { decision: 'equal', reason: 'already identical on both sides' };
    }

    if (winner) {
        return direction === 'push'
            ? {
                  decision: loser ? 'local_is_modified_then_push' : 'local_is_created_then_push',
                  reason: loser ? 'forced: this device wins' : 'forced: missing on the server',
              }
            : {
                  decision: loser ? 'remote_is_modified_then_pull' : 'remote_is_created_then_pull',
                  reason: loser ? 'forced: the server wins' : 'forced: missing on this device',
              };
    }

    // Only the losing side has it, so the overwrite removes it.
    return direction === 'push'
        ? {
              decision: 'local_is_deleted_thus_also_delete_remote',
              reason: 'forced: not on this device',
          }
        : {
              decision: 'remote_is_deleted_thus_also_delete_local',
              reason: 'forced: not on the server',
          };
}

/**
 * Whether two sides hold what is almost certainly the same bytes.
 *
 * Deliberately weaker than the ordinary path's reasoning, which has `prev` to
 * compare each side against its own past. Here there is no past, so this is
 * size plus a timestamp within tolerance — enough to skip the obvious no-ops,
 * and never used to decide that something should be deleted.
 */
function sameContent(local: FileEntity, remote: FileEntity, tol: number): boolean {
    if (local.size !== remote.size) return false;
    return Math.abs(local.mtimeCli - remote.mtimeCli) <= tol;
}

// ── One path ─────────────────────────────────────────

function planFor(
    key: string,
    local: FileEntity | undefined,
    remote: FileEntity | undefined,
    prev: PrevSyncRecord | undefined,
    opts: PlanOptions
): SyncPlanItem {
    const base = { key, local, remote, prev };

    const skipped = guard(base, opts);
    if (skipped) return skipped;

    const { decision, reason, conflictCopyKey } = decide(local, remote, prev, opts, key);
    return { ...base, decision, reason, conflictCopyKey };
}

/**
 * The two reasons a path is left alone whatever else is true of it.
 *
 * Shared by both plan builders, and that sharing is the point: scope and the
 * size limit are promises about which files this engine will ever touch, and a
 * forced overwrite is still a sync run rather than a licence to ignore them.
 * A user who excluded a folder did not mean "unless I press the other button".
 *
 * Size is checked before any decision so an oversized file is left alone on
 * BOTH sides — half-applying a decision to it would be worse than skipping.
 */
function guard(
    base: { key: string; local?: FileEntity; remote?: FileEntity; prev?: PrevSyncRecord },
    opts: PlanOptions
): SyncPlanItem | null {
    if (opts.isExcluded(base.key)) {
        return { ...base, decision: 'skipped_excluded', reason: 'outside the configured scope' };
    }

    if (opts.maxFileSize > 0) {
        const biggest = Math.max(base.local?.size ?? 0, base.remote?.size ?? 0);
        if (biggest > opts.maxFileSize) {
            return { ...base, decision: 'skipped_too_large', reason: `larger than the size limit` };
        }
    }

    return null;
}

interface Verdict {
    decision: SyncDecision;
    reason: string;
    conflictCopyKey?: string;
}

function decide(
    local: FileEntity | undefined,
    remote: FileEntity | undefined,
    prev: PrevSyncRecord | undefined,
    opts: PlanOptions,
    key: string
): Verdict {
    const tol = opts.mtimeToleranceMs;

    // ── Gone from both sides ──
    if (!local && !remote) {
        return { decision: 'equal', reason: 'already gone from both sides' };
    }

    // ── No previous record: everything present is new ──
    // Never a deletion. See the rule in the file comment.
    if (!prev) {
        if (local && !remote) {
            return { decision: 'local_is_created_then_push', reason: 'new here, unknown remotely' };
        }
        if (!local && remote) {
            return { decision: 'remote_is_created_then_pull', reason: 'new remotely, unknown here' };
        }
        if (same(local, remote, tol)) {
            return { decision: 'equal', reason: 'appeared on both sides, identical' };
        }
        return settle(local as FileEntity, remote as FileEntity, opts, key, 'appeared on both sides');
    }

    // ── Present here, gone remotely ──
    if (local && !remote) {
        if (sameLocal(local, prev.local, tol)) {
            return {
                decision: 'remote_is_deleted_thus_also_delete_local',
                reason: 'deleted remotely, untouched here since the last sync',
            };
        }
        // Delete versus edit. The edit wins: a deletion the user has to repeat
        // costs one action, an edit thrown away costs work they may never
        // notice is missing.
        return {
            decision: 'local_is_modified_then_push',
            reason: 'deleted remotely, but edited here since — keeping the edit',
        };
    }

    // ── Gone here, present remotely ──
    if (!local && remote) {
        if (sameRemote(remote, prev.remote, tol)) {
            return {
                decision: 'local_is_deleted_thus_also_delete_remote',
                reason: 'deleted here, untouched remotely since the last sync',
            };
        }
        return {
            decision: 'remote_is_modified_then_pull',
            reason: 'deleted here, but edited remotely since — keeping the edit',
        };
    }

    // ── Present on both sides ──
    const l = local as FileEntity;
    const r = remote as FileEntity;
    const localMoved = !sameLocal(l, prev.local, tol);
    const remoteMoved = !sameRemote(r, prev.remote, tol);

    if (!localMoved && !remoteMoved) {
        return { decision: 'equal', reason: 'unchanged on both sides' };
    }
    if (localMoved && !remoteMoved) {
        return { decision: 'local_is_modified_then_push', reason: 'edited here' };
    }
    if (!localMoved && remoteMoved) {
        return { decision: 'remote_is_modified_then_pull', reason: 'edited remotely' };
    }
    if (same(l, r, tol)) {
        // Both edited, both arrived at the same bytes. Nothing to reconcile —
        // this is common when the same change is made twice deliberately.
        return { decision: 'equal', reason: 'edited on both sides to the same result' };
    }
    return settle(l, r, opts, key, 'edited on both sides');
}

/** Apply the configured conflict rule to two genuinely divergent copies. */
function settle(
    local: FileEntity,
    remote: FileEntity,
    opts: PlanOptions,
    key: string,
    why: string
): Verdict {
    // A file with one writer cannot really diverge: the other copy is that
    // writer's file as it was when it last arrived.
    const owner = opts.ownerOf?.(key) ?? null;
    if (owner === 'local') {
        return { decision: 'local_is_modified_then_push', reason: `${why} — written only here` };
    }
    if (owner === 'remote') {
        return {
            decision: 'remote_is_modified_then_pull',
            reason: `${why} — written only by its own device`,
        };
    }

    if (opts.conflictAction === 'smart') {
        // The plan cannot say whether the merge will succeed — it has metadata,
        // not contents. So it promises an attempt, and the engine reports what
        // actually happened; a failed attempt falls back to keeping both, which
        // loses nothing.
        //
        // A file the merger cannot reason about goes straight to keeping both,
        // rather than falling through to the newer copy. `smart` is the cautious
        // choice, and quietly discarding a version of an attachment would be a
        // stranger outcome than the setting promises.
        const mergeable = opts.isMergeable(key);
        return {
            decision: mergeable
                ? 'conflict_created_then_smart_merge'
                : 'conflict_created_then_keep_both',
            reason: mergeable
                ? `${why} — reconciling the note`
                : `${why} — not a note, keeping both copies`,
            conflictCopyKey: conflictCopyName(key, opts.deviceLabel, opts.now),
        };
    }

    if (opts.conflictAction === 'keep_both') {
        return {
            decision: 'conflict_created_then_keep_both',
            reason: `${why} — keeping both copies`,
            conflictCopyKey: conflictCopyName(key, opts.deviceLabel, opts.now),
        };
    }

    if (opts.conflictAction === 'keep_larger') {
        const keepLocal = local.size >= remote.size;
        return {
            decision: keepLocal
                ? 'conflict_created_then_keep_local'
                : 'conflict_created_then_keep_remote',
            reason: `${why} — keeping the larger copy`,
        };
    }

    // keep_newer, on the CLIENT timestamp. The server's own is when the upload
    // landed, which would hand every contest to whichever device synced last
    // rather than to whoever actually wrote most recently.
    const keepLocal = local.mtimeCli >= remote.mtimeCli;
    return {
        decision: keepLocal ? 'conflict_created_then_keep_local' : 'conflict_created_then_keep_remote',
        reason: `${why} — keeping the newer copy`,
    };
}

/**
 * Name for the losing copy under `keep_both`.
 *
 * Carries the device and the timestamp so a second conflict on the same file
 * does not overwrite the first — which would quietly turn "keep both" into
 * "keep one", the exact thing the setting exists to avoid. The suffix goes
 * before the extension so Obsidian still treats a Markdown conflict as
 * Markdown.
 */
export function conflictCopyName(key: string, deviceLabel: string, now: number): string {
    const stamp = new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const safeLabel = deviceLabel.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'device';
    const dot = key.lastIndexOf('.');
    const slash = key.lastIndexOf('/');
    if (dot > slash && dot !== -1) {
        return `${key.slice(0, dot)}.conflict-${safeLabel}-${stamp}${key.slice(dot)}`;
    }
    return `${key}.conflict-${safeLabel}-${stamp}`;
}

// ── Comparison ───────────────────────────────────────

/**
 * Whether two live sightings of a path are the same file.
 *
 * Size plus timestamp, not content: hashing every file on both sides on every
 * run would cost more than the transfer it is trying to avoid. The tolerance
 * absorbs filesystems and servers that store whole seconds — without it every
 * file reads as modified on every run and the engine ships the vault back and
 * forth indefinitely.
 *
 * Only meaningful across sides when the remote preserved the client's mtime.
 * Where it did not, two independent edits read as a conflict, which is the safe
 * direction to be wrong in.
 */
export function same(
    a: FileEntity | undefined,
    b: FileEntity | undefined,
    toleranceMs: number
): boolean {
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    return Math.abs(a.mtimeCli - b.mtimeCli) <= toleranceMs;
}

/** Has the local file moved since we last recorded it? */
export function sameLocal(
    entity: FileEntity | undefined,
    prev: PrevSide | undefined,
    toleranceMs: number
): boolean {
    if (!entity || !prev) return false;
    if (entity.size !== prev.size) return false;
    return Math.abs(entity.mtimeCli - prev.mtime) <= toleranceMs;
}

/**
 * Has the remote object moved since we last recorded it?
 *
 * An etag settles it outright when both sides have one — it is the server's own
 * statement about its own version, and beats any inference from size and time.
 * Otherwise the server's timestamp is compared, never the client's: on a server
 * that stamps uploads with its own clock, `mtimeCli` for a remote object is a
 * value we made up.
 */
export function sameRemote(
    entity: FileEntity | undefined,
    prev: PrevSide | undefined,
    toleranceMs: number
): boolean {
    if (!entity || !prev) return false;
    if (entity.etag && prev.etag) return entity.etag === prev.etag;
    if (entity.size !== prev.size) return false;
    return Math.abs((entity.mtimeSvr ?? entity.mtimeCli) - prev.mtime) <= toleranceMs;
}

/** Record both sides of a path as they stand now, for the next run. */
export function toPrevRecord(local: FileEntity, remote: FileEntity): PrevSyncRecord {
    return {
        key: local.key,
        local: { size: local.size, mtime: local.mtimeCli },
        remote: {
            size: remote.size,
            mtime: remote.mtimeSvr ?? remote.mtimeCli,
            etag: remote.etag,
        },
    };
}

// ── Aggregates ───────────────────────────────────────

function byKey(entities: FileEntity[]): Map<string, FileEntity> {
    const map = new Map<string, FileEntity>();
    for (const e of entities) map.set(e.key, e);
    return map;
}

function tally(items: SyncPlanItem[]): SyncPlanStats {
    const stats: SyncPlanStats = {
        push: 0,
        pull: 0,
        deleteLocal: 0,
        deleteRemote: 0,
        conflict: 0,
        skipped: 0,
        equal: 0,
    };

    for (const item of items) {
        switch (item.decision) {
            case 'local_is_created_then_push':
            case 'local_is_modified_then_push':
                stats.push++;
                break;
            case 'remote_is_created_then_pull':
            case 'remote_is_modified_then_pull':
                stats.pull++;
                break;
            case 'remote_is_deleted_thus_also_delete_local':
                stats.deleteLocal++;
                break;
            case 'local_is_deleted_thus_also_delete_remote':
                stats.deleteRemote++;
                break;
            case 'conflict_created_then_keep_local':
            case 'conflict_created_then_keep_remote':
            case 'conflict_created_then_keep_both':
            case 'conflict_created_then_smart_merge':
                stats.conflict++;
                break;
            case 'skipped_too_large':
            case 'skipped_excluded':
                stats.skipped++;
                break;
            case 'equal':
                stats.equal++;
                break;
        }
    }

    return stats;
}

/**
 * Whether this plan needs a human to look at it first.
 *
 * Two rails, both about the same worry: the engine can delete files, and the
 * failures that make it want to delete a lot of them at once are exactly the
 * ones a per-file check cannot see.
 */
function block(
    items: SyncPlanItem[],
    actionable: number,
    known: number,
    opts: PlanOptions
): SyncPlan['blocked'] {
    // Nothing to do is never worth interrupting for, whatever the rails say.
    if (actionable === 0) return null;

    if (opts.firstRun) {
        return { kind: 'first_run_requires_review', actionable, known };
    }

    if (known >= opts.protectMinFiles) {
        const destructive = items.filter((i) => DESTRUCTIVE_DECISIONS.has(i.decision)).length;
        // Measured on deletions rather than on all activity: pushing a hundred
        // new notes is a normal Tuesday, and blocking it would teach the user
        // to dismiss the warning that matters.
        const ratio = destructive / known;
        if (ratio > opts.protectModifyRatio) {
            return {
                kind: 'too_many_changes',
                ratio,
                limit: opts.protectModifyRatio,
                actionable: destructive,
                known,
            };
        }
    }

    return null;
}
