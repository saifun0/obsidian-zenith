import type { ConflictAction, SyncPlan, SyncPlanBlockKind } from './fileSyncTypes';

/**
 * Whether a plan may run without a human looking at it first.
 *
 * Split out from the scheduler and kept pure, because this is the one function
 * in the automatic path whose wrong answer costs the user files. It is the
 * whole of "maximally automatic, but not recklessly so": everything it lets
 * through happens silently, and everything it stops waits on the sync page
 * with the plan still attached.
 *
 * It deliberately does NOT invent a second opinion about safety. The engine
 * already decides what needs review — see `block()` in `syncPlan`, which
 * exempts a first run and measures deletions against the protect percentage —
 * and a rule here that disagreed with it would mean the preview and the
 * automatic path had different ideas of danger. So `plan.blocked` is taken as
 * given and exactly one rule is added on top of it.
 *
 * That rule is about conflicts. A conflict means both sides moved, and what
 * happens to the losing side depends on a setting:
 *
 *   · `smart` reconciles what it can prove and keeps both copies otherwise;
 *   · `keep_both` keeps both by definition;
 *   · `keep_newer` and `keep_larger` throw one version away.
 *
 * The first two lose nothing, so they are fine to apply unattended. The last
 * two silently discard edits somebody made, and a silent discard is the one
 * outcome no amount of convenience pays for.
 *
 * Note what is NOT on the list: ordinary deletions. Deleting a note on the
 * laptop and expecting it gone from the phone is the single most common thing
 * anybody does with a sync tool, and holding every one of those for approval
 * would make the automatic mode useless. The protect percentage is what tells
 * one deleted note apart from a remote that came back empty after an auth
 * failure, and it is a far better judge of that than a count.
 */
export type AutoHold =
    /**
     * The engine itself asked for review, for whatever reason it gives.
     *
     * Spelled as the block kind rather than as a list of its members, so a new
     * kind — `forced_overwrite` was one — is held back the day it is added
     * instead of the day somebody notices it was not.
     */
    | SyncPlanBlockKind
    /** Applying this would throw away one side of an edit. */
    | 'conflict_discards_a_version';

/** Conflict rules that resolve by dropping a version rather than keeping it. */
const LOSSY_CONFLICT: ReadonlySet<ConflictAction> = new Set<ConflictAction>([
    'keep_newer',
    'keep_larger',
]);

/** Why this plan must wait for the user, or null when it may just run. */
export function autoHold(plan: SyncPlan, conflictAction: ConflictAction): AutoHold | null {
    if (plan.blocked) return plan.blocked.kind;
    if (plan.stats.conflict > 0 && LOSSY_CONFLICT.has(conflictAction)) {
        return 'conflict_discards_a_version';
    }
    return null;
}

/**
 * A short fingerprint of what a plan proposes.
 *
 * The scheduler holds a blocked plan and checks again on the next tick, which
 * on a vault nobody is touching produces the same plan every few minutes. Told
 * about it each time, the user would learn to ignore the telling. So the
 * notice fires when this string changes and stays quiet while it does not.
 *
 * Built from the counts rather than the paths: a plan that grew by one more
 * file to upload is genuinely news, and one that merely got recomputed is not.
 */
export function planSignature(plan: SyncPlan): string {
    const s = plan.stats;
    return [
        plan.blocked?.kind ?? 'open',
        s.push,
        s.pull,
        s.deleteLocal,
        s.deleteRemote,
        s.conflict,
    ].join(':');
}
