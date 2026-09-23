import { describe, it, expect } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import { syncBarState } from '../src/modules/sync/statusBarState';
import type { FileSyncStatus } from '../src/modules/sync/services/fileSync';
import type { SyncPlan } from '../src/modules/sync/fileSyncTypes';
import type { SyncProgress, SyncRunResult } from '../src/modules/sync/services/SyncEngine';

const t = translatorFor('en');

const status = (over: Partial<FileSyncStatus> = {}): FileSyncStatus => ({
    configured: true,
    running: false,
    plan: null,
    lastRunAt: 0,
    checkedAt: 0,
    lastResult: null,
    progress: null,
    error: null,
    ...over,
});

const progress: SyncProgress = {
    done: 12,
    total: 40,
    key: 'Notes/one.md',
    bytes: 0,
    totalBytes: 0,
    startedAt: Date.now(),
};

const plan = { actionable: 3 } as SyncPlan;

const failedRun = (at: number): Partial<FileSyncStatus> => ({
    lastRunAt: at,
    lastResult: {
        failed: [{ key: 'Notes/big.pdf', error: 'Too large' }],
    } as SyncRunResult,
});

describe('syncBarState', () => {
    // A vault that never set sync up should not carry an item about it.
    it('says nothing until file sync is configured', () => {
        expect(syncBarState(status({ configured: false }), true, t)).toBeNull();
    });

    it('shows the count while files are moving, over anything else', () => {
        const state = syncBarState(
            status({ running: true, progress, error: 'old', plan }),
            false,
            t
        );
        expect(state).toMatchObject({ icon: 'sync', spinning: true, text: '12 / 40' });
    });

    it('reports an error before a held plan', () => {
        const state = syncBarState(status({ error: 'Server said no', plan }), true, t);
        expect(state).toMatchObject({ tone: 'error', text: 'Error' });
        expect(state?.tooltip).toContain('Server said no');
    });

    it('says when a plan is waiting for review', () => {
        expect(syncBarState(status({ plan }), true, t)).toMatchObject({
            tone: 'held',
            text: 'Needs review',
        });
    });

    // Files left behind by the last run are an error until something confirms
    // the two sides agree again.
    it('reports files that failed, until a later check clears them', () => {
        const now = Date.now();
        const failed = syncBarState(status(failedRun(now)), true, t);
        expect(failed).toMatchObject({ tone: 'error', text: 'Failed: 1' });
        expect(failed?.tooltip).toContain('Notes/big.pdf');

        const cleared = syncBarState(status({ ...failedRun(now - 5000), checkedAt: now }), true, t);
        expect(cleared).toMatchObject({ tone: 'normal', icon: 'cloud' });
    });

    // A check is over in a second; relabelling the item for it would shove the
    // rest of the status bar sideways every time the window takes focus.
    it('keeps its words while checking and only turns the icon', () => {
        const at = Date.now() - 5 * 60_000;
        const idle = syncBarState(status({ checkedAt: at }), true, t);
        const checking = syncBarState(status({ checkedAt: at, running: true }), true, t);
        expect(idle?.text).toBe('5 min ago');
        expect(checking).toMatchObject({ spinning: true, text: '5 min ago' });
    });

    it('is quiet before the first check of the session', () => {
        expect(syncBarState(status(), true, t)).toMatchObject({
            tone: 'quiet',
            icon: 'cloud',
            text: '',
        });
    });

    it('shows when it last synced', () => {
        const state = syncBarState(status({ checkedAt: Date.now() }), true, t);
        expect(state).toMatchObject({ tone: 'normal', text: 'just now' });
        expect(state?.tooltip).toBe('Vault synced just now');
    });

    it('says it is offline rather than claiming a sync is recent', () => {
        const state = syncBarState(status({ checkedAt: Date.now() }), false, t);
        expect(state).toMatchObject({ tone: 'quiet', icon: 'offline' });
    });
});
