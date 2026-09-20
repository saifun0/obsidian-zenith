import { describe, it, expect } from 'vitest';
import { autoHold, planSignature } from '../src/modules/sync/autoPolicy';
import type { ConflictAction, SyncPlan, SyncPlanStats } from '../src/modules/sync/fileSyncTypes';

/**
 * The gate between "sync happens by itself" and "sync waits for you".
 *
 * Worth its own file and this much prose because it is the only function in
 * the automatic path whose wrong answer costs somebody their notes. Everything
 * it clears runs with nobody watching.
 */

const stats = (patch: Partial<SyncPlanStats> = {}): SyncPlanStats => ({
    push: 0,
    pull: 0,
    deleteLocal: 0,
    deleteRemote: 0,
    conflict: 0,
    skipped: 0,
    equal: 0,
    ...patch,
});

const plan = (patch: Partial<SyncPlan> = {}): SyncPlan => ({
    items: [],
    stats: stats(),
    actionable: 1,
    blocked: null,
    ...patch,
});

const SAFE: ConflictAction[] = ['smart', 'keep_both'];
const LOSSY: ConflictAction[] = ['keep_newer', 'keep_larger'];

describe('a plan may run unattended when', () => {
    it('it only moves bytes around', () => {
        const p = plan({ stats: stats({ push: 12, pull: 30 }), actionable: 42 });
        expect(autoHold(p, 'smart')).toBeNull();
    });

    /**
     * The case the whole feature stands or falls on.
     *
     * Deleting a note on the laptop and expecting it gone from the phone is
     * the most ordinary thing anybody does with a sync tool. If that needed a
     * press, "automatic" would mean "automatic except for the thing you do
     * every day", and the engine would be back to being opened by hand.
     *
     * What keeps this safe is not a rule here but the protect percentage,
     * which has already run by the time we see the plan: a run that wanted to
     * delete a quarter of the vault would arrive with `blocked` set.
     */
    it('it deletes a few files and the safety rail let it through', () => {
        const p = plan({ stats: stats({ deleteLocal: 1, deleteRemote: 2 }), actionable: 3 });
        expect(autoHold(p, 'smart')).toBeNull();
    });

    it.each(SAFE)('a conflict is settled without discarding anything (%s)', (action) => {
        const p = plan({ stats: stats({ conflict: 4 }), actionable: 4 });
        expect(autoHold(p, action)).toBeNull();
    });
});

describe('a plan waits for the user when', () => {
    it('nothing has ever been synced against this server', () => {
        const p = plan({
            blocked: { kind: 'first_run_requires_review', actionable: 900, known: 900 },
        });
        expect(autoHold(p, 'smart')).toBe('first_run_requires_review');
    });

    it('it would delete more than the safety limit allows', () => {
        const p = plan({
            stats: stats({ deleteLocal: 400 }),
            actionable: 400,
            blocked: { kind: 'too_many_changes', ratio: 0.8, limit: 0.25 },
        });
        expect(autoHold(p, 'smart')).toBe('too_many_changes');
    });

    /**
     * Two of the four conflict rules throw a version away. Doing that with
     * nobody watching is the one outcome no amount of convenience pays for —
     * the user would never learn which of their edits went missing, or when.
     */
    it.each(LOSSY)('a conflict would discard one of the versions (%s)', (action) => {
        const p = plan({ stats: stats({ conflict: 1 }), actionable: 1 });
        expect(autoHold(p, action)).toBe('conflict_discards_a_version');
    });

    /**
     * The engine's own verdict is taken first. If it ever disagreed with this
     * function the user would get whichever reason happened to be checked
     * earlier, which is how a "first run" gets reported as a conflict.
     */
    it('the engine blocked it, whatever else is true of it', () => {
        const p = plan({
            stats: stats({ conflict: 3 }),
            blocked: { kind: 'too_many_changes', ratio: 0.9, limit: 0.25 },
        });
        expect(autoHold(p, 'keep_newer')).toBe('too_many_changes');
    });
});

describe('the held-plan signature', () => {
    /**
     * A vault nobody is touching produces the same held plan every few
     * minutes. Told about it each time, the user learns to dismiss the notice
     * — including the one that mattered.
     */
    it('is the same for a plan that was merely recomputed', () => {
        const a = plan({ stats: stats({ push: 3, conflict: 1 }) });
        const b = plan({ stats: stats({ push: 3, conflict: 1 }) });
        expect(planSignature(a)).toBe(planSignature(b));
    });

    it('changes when the plan grows', () => {
        const a = plan({ stats: stats({ push: 3 }) });
        const b = plan({ stats: stats({ push: 4 }) });
        expect(planSignature(a)).not.toBe(planSignature(b));
    });

    it('changes when the reason it is held changes', () => {
        const open = plan({ stats: stats({ push: 3 }) });
        const held = plan({
            stats: stats({ push: 3 }),
            blocked: { kind: 'too_many_changes', ratio: 0.9, limit: 0.25 },
        });
        expect(planSignature(open)).not.toBe(planSignature(held));
    });
});
