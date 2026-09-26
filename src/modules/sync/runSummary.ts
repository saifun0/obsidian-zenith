import { ACTIONABLE_DECISIONS, type SyncDecision } from './fileSyncTypes';
import type { SyncRunResult } from './services/SyncEngine';

/**
 * What a file run did, in the few numbers the sync dialog shows, and the
 * record of it each device keeps between starts.
 *
 * Kept small on purpose: a run's result holds its whole plan, every file on
 * both sides, and none of that is worth carrying past the run. The dialog
 * wants to say "3 sent, 1 received, 312 MB on the server, 5 minutes ago" —
 * after a restart as much as before one, which is what the record is for.
 */

export interface RunSummary {
    sent: number;
    received: number;
    deleted: number;
    conflicts: number;
    failed: number;
}

/** Counted from what actually happened: a file that failed is not sent or received. */
export function summarizeRun(result: SyncRunResult): RunSummary {
    const failed = new Set(result.failed.map((f) => f.key));
    const summary: RunSummary = {
        sent: 0,
        received: 0,
        deleted: 0,
        conflicts: 0,
        failed: failed.size,
    };
    if (result.refused) return summary;
    for (const item of result.plan.items) {
        if (!ACTIONABLE_DECISIONS.has(item.decision) || failed.has(item.key)) continue;
        summary[kindOf(item.decision)]++;
    }
    return summary;
}

function kindOf(decision: SyncDecision): Exclude<keyof RunSummary, 'failed'> {
    if (decision.startsWith('conflict_')) return 'conflicts';
    if (decision.endsWith('_delete_remote') || decision.endsWith('_delete_local')) return 'deleted';
    return decision.endsWith('_push') ? 'sent' : 'received';
}

/** What a device remembers of its sync between starts. */
export interface SyncMemory {
    lastRunAt: number;
    checkedAt: number;
    lastRun: RunSummary | null;
    remoteBytes: number | null;
}

export const EMPTY_MEMORY: SyncMemory = {
    lastRunAt: 0,
    checkedAt: 0,
    lastRun: null,
    remoteBytes: null,
};

/** A record read back from storage, trusted field by field and no further. */
export function readMemory(raw: unknown): SyncMemory {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_MEMORY };
    const r = raw as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    const run =
        r.lastRun && typeof r.lastRun === 'object' ? (r.lastRun as Record<string, unknown>) : null;
    return {
        lastRunAt: num(r.lastRunAt),
        checkedAt: num(r.checkedAt),
        lastRun: run
            ? {
                  sent: num(run.sent),
                  received: num(run.received),
                  deleted: num(run.deleted),
                  conflicts: num(run.conflicts),
                  failed: num(run.failed),
              }
            : null,
        remoteBytes: typeof r.remoteBytes === 'number' ? num(r.remoteBytes) : null,
    };
}
