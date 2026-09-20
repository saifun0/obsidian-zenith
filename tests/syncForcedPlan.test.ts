import { describe, it, expect } from 'vitest';
import { buildForcedPlan } from '../src/modules/sync/services/syncPlan';
import { autoHold } from '../src/modules/sync/autoPolicy';
import type {
    FileEntity,
    PlanOptions,
    PrevSyncRecord,
} from '../src/modules/sync/fileSyncTypes';

/**
 * Overwriting one side with the other, on purpose.
 *
 * The ordinary planner is careful because it is guessing: it has three
 * listings and has to work out which side moved. This one is not guessing —
 * it has been told — so what these tests are about is the opposite worry.
 * A builder that has permission to delete must still respect the boundaries
 * that were never about permission: scope, the size limit, and the promise
 * that nothing runs unattended.
 */

const f = (key: string, size: number, mtimeCli: number): FileEntity => ({ key, size, mtimeCli });

const T = 1_700_000_000_000;

const OPTS: PlanOptions = {
    conflictAction: 'smart',
    protectModifyRatio: 0.25,
    protectMinFiles: 10,
    maxFileSize: 0,
    mtimeToleranceMs: 2000,
    isExcluded: () => false,
    isMergeable: (k: string) => k.endsWith('.md'),
    deviceLabel: 'desktop',
    now: T,
    firstRun: false,
};

const opts = (patch: Partial<PlanOptions> = {}): PlanOptions => ({ ...OPTS, ...patch });

/** The decision this plan reached for one path. */
const at = (plan: ReturnType<typeof buildForcedPlan>, key: string) =>
    plan.items.find((i) => i.key === key)?.decision;

describe('forced push makes the server match this device', () => {
    const local = [f('a.md', 10, T), f('b.md', 20, T)];
    const remote = [f('b.md', 999, T - 60_000), f('gone.md', 5, T)];
    const prev: PrevSyncRecord[] = [];

    const plan = buildForcedPlan(local, remote, prev, 'push', opts());

    it('uploads a file the server has never seen', () => {
        expect(at(plan, 'a.md')).toBe('local_is_created_then_push');
    });

    it('overwrites the server copy even though it is newer and bigger', () => {
        // The ordinary planner would call this a conflict and try to reconcile
        // it. That is exactly the judgement the user has just overruled.
        expect(at(plan, 'b.md')).toBe('local_is_modified_then_push');
    });

    it('deletes what only the server has', () => {
        expect(at(plan, 'gone.md')).toBe('local_is_deleted_thus_also_delete_remote');
    });

    it('never deletes anything locally', () => {
        expect(plan.stats.deleteLocal).toBe(0);
    });
});

describe('forced pull makes this device match the server', () => {
    const local = [f('mine.md', 10, T), f('both.md', 20, T)];
    const remote = [f('both.md', 999, T - 60_000), f('theirs.md', 5, T)];

    const plan = buildForcedPlan(local, remote, [], 'pull', opts());

    it('downloads a file this device has never seen', () => {
        expect(at(plan, 'theirs.md')).toBe('remote_is_created_then_pull');
    });

    it('overwrites the local copy even though it is newer', () => {
        expect(at(plan, 'both.md')).toBe('remote_is_modified_then_pull');
    });

    it('deletes what only this device has', () => {
        expect(at(plan, 'mine.md')).toBe('remote_is_deleted_thus_also_delete_local');
    });

    it('never deletes anything on the server', () => {
        expect(plan.stats.deleteRemote).toBe(0);
    });
});

describe('a forced plan still keeps the promises that were not about permission', () => {
    /**
     * Scope is not a preference that a different button overrules. Somebody who
     * excluded a folder did not mean "unless I force it" — they meant this
     * engine does not touch those files, and a forced run is still this engine.
     */
    it('leaves excluded paths alone in both directions', () => {
        const local = [f('secret/keys.md', 10, T)];
        const remote = [f('secret/other.md', 10, T)];
        const isExcluded = (k: string) => k.startsWith('secret/');

        for (const direction of ['push', 'pull'] as const) {
            const plan = buildForcedPlan(local, remote, [], direction, opts({ isExcluded }));
            expect(at(plan, 'secret/keys.md')).toBe('skipped_excluded');
            expect(at(plan, 'secret/other.md')).toBe('skipped_excluded');
            expect(plan.actionable).toBe(0);
        }
    });

    it('leaves oversized files alone in both directions', () => {
        const local = [f('huge.bin', 50_000, T)];
        const remote = [f('alsohuge.bin', 50_000, T)];

        for (const direction of ['push', 'pull'] as const) {
            const plan = buildForcedPlan(local, remote, [], direction, opts({ maxFileSize: 1000 }));
            expect(at(plan, 'huge.bin')).toBe('skipped_too_large');
            expect(at(plan, 'alsohuge.bin')).toBe('skipped_too_large');
        }
    });

    /**
     * A forced push of a vault that was already in step should cost nothing.
     * Without this the button would re-upload every file in the vault to say
     * what the server already said, which on a slow connection is the
     * difference between a useful escape hatch and one nobody dares press.
     */
    it('does not move files that are already identical', () => {
        const same = [f('a.md', 10, T), f('b.md', 20, T)];
        const plan = buildForcedPlan(same, [...same], [], 'push', opts());

        expect(plan.actionable).toBe(0);
        expect(plan.stats.equal).toBe(2);
    });

    /** A path both sides have already forgotten is not worth a row. */
    it('does not report paths that exist on neither side', () => {
        const prev: PrevSyncRecord[] = [
            { key: 'ancient.md', local: { size: 1, mtime: T }, remote: { size: 1, mtime: T } },
        ];
        const plan = buildForcedPlan([f('a.md', 1, T)], [], prev, 'push', opts());

        expect(plan.items.map((i) => i.key)).toEqual(['a.md']);
    });

    /**
     * Carried through so `recordPrev` writes correct bookkeeping afterwards,
     * and the next ordinary run has a truthful baseline rather than treating
     * everything the forced run touched as brand new.
     */
    it('carries the previous-sync record on each item', () => {
        const prev: PrevSyncRecord[] = [
            { key: 'a.md', local: { size: 1, mtime: T }, remote: { size: 1, mtime: T } },
        ];
        const plan = buildForcedPlan([f('a.md', 9, T)], [], prev, 'push', opts());

        expect(plan.items[0].prev).toEqual(prev[0]);
    });
});

describe('a forced plan cannot run unattended', () => {
    it('comes back blocked whenever it would do anything', () => {
        const plan = buildForcedPlan([f('a.md', 1, T)], [], [], 'push', opts());
        expect(plan.blocked?.kind).toBe('forced_overwrite');
    });

    /**
     * Blocked by construction rather than by measurement: a single-file force
     * push is nowhere near the protect ratio, and it is still an instruction
     * to ignore the comparison, which is worth reading back.
     */
    it('is blocked even when it deletes nothing at all', () => {
        const plan = buildForcedPlan([f('a.md', 1, T)], [f('a.md', 2, T)], [], 'push', opts());
        expect(plan.stats.deleteRemote).toBe(0);
        expect(plan.blocked?.kind).toBe('forced_overwrite');
    });

    it('is not blocked when there is nothing to do', () => {
        const same = [f('a.md', 10, T)];
        const plan = buildForcedPlan(same, [...same], [], 'pull', opts());
        expect(plan.blocked).toBeNull();
    });

    /**
     * The scheduler asks `autoHold` before applying anything. A forced plan
     * must never clear it, however it got into the service's status.
     */
    it('is held back by the automatic gate', () => {
        const plan = buildForcedPlan([f('a.md', 1, T)], [], [], 'push', opts());
        expect(autoHold(plan, 'smart')).toBe('forced_overwrite');
    });
});
