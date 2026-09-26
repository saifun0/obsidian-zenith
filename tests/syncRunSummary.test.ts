import { describe, expect, it } from 'vitest';
import { readMemory, summarizeRun } from '../src/modules/sync/runSummary';
import type { SyncRunResult } from '../src/modules/sync/services/SyncEngine';
import type { SyncDecision, SyncPlan } from '../src/modules/sync/fileSyncTypes';

function result(decisions: Array<[string, SyncDecision]>, failed: string[] = [], refused = false) {
    const plan = {
        items: decisions.map(([key, decision]) => ({ key, decision })),
        stats: {
            push: 0,
            pull: 0,
            deleteLocal: 0,
            deleteRemote: 0,
            conflict: 0,
            skipped: 0,
            equal: 0,
        },
        actionable: decisions.length,
        blocked: null,
    } as unknown as SyncPlan;
    return {
        plan,
        applied: decisions.length - failed.length,
        failed: failed.map((key) => ({ key, error: 'no' })),
        refused,
        merges: [],
        settingsArrived: false,
        remoteBytes: 0,
    } as SyncRunResult;
}

describe('what a run did', () => {
    it('counts what was sent, received, deleted and in conflict', () => {
        const summary = summarizeRun(
            result([
                ['a', 'local_is_created_then_push'],
                ['b', 'local_is_modified_then_push'],
                ['c', 'remote_is_created_then_pull'],
                ['d', 'local_is_deleted_thus_also_delete_remote'],
                ['e', 'remote_is_deleted_thus_also_delete_local'],
                ['f', 'conflict_created_then_keep_both'],
                ['g', 'equal'],
            ])
        );
        expect(summary).toEqual({ sent: 2, received: 1, deleted: 2, conflicts: 1, failed: 0 });
    });

    it('counts a failed file as failed, not as moved', () => {
        const summary = summarizeRun(
            result(
                [
                    ['a', 'local_is_created_then_push'],
                    ['b', 'local_is_created_then_push'],
                ],
                ['b']
            )
        );
        expect(summary).toEqual({ sent: 1, received: 0, deleted: 0, conflicts: 0, failed: 1 });
    });

    it('counts nothing for a run that refused', () => {
        const summary = summarizeRun(result([['a', 'local_is_created_then_push']], [], true));
        expect(summary.sent).toBe(0);
    });
});

describe('the record a device keeps', () => {
    it('reads back what was kept', () => {
        const kept = {
            lastRunAt: 5,
            checkedAt: 7,
            lastRun: { sent: 1, received: 2, deleted: 0, conflicts: 0, failed: 0 },
            remoteBytes: 1024,
        };
        expect(readMemory(kept)).toEqual(kept);
    });

    it('starts empty from nothing, or from something unreadable', () => {
        expect(readMemory(null)).toEqual({
            lastRunAt: 0,
            checkedAt: 0,
            lastRun: null,
            remoteBytes: null,
        });
        expect(readMemory('x').lastRun).toBeNull();
        expect(readMemory({ lastRunAt: -3, checkedAt: 'soon', remoteBytes: 'big' })).toEqual({
            lastRunAt: 0,
            checkedAt: 0,
            lastRun: null,
            remoteBytes: null,
        });
    });
});
