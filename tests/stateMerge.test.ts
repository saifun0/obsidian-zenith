import { describe, it, expect } from 'vitest';
import { encode } from '../src/modules/sync/hlc';
import {
    deepEqual,
    emptyState,
    mergeSharedState,
    type SharedState,
} from '../src/modules/sync/stateMerge';
import type { ZenithSettings } from '../src/store/settingsSlice';

/**
 * Build a shared-state document. `at` is the wall time every stamp gets, which
 * is enough to control who wins: a higher `at` is a later edit.
 */
function state(values: Partial<ZenithSettings>, at: number, node: string): SharedState {
    const s = emptyState();
    s.values = values;
    for (const key of Object.keys(values)) {
        s.stamps[key] = encode({ wall: at, counter: 0, node });
    }
    return s;
}

const OPTS = { node: 'device-a' };

describe('deepEqual', () => {
    it('ignores object key order', () => {
        expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('respects array order', () => {
        expect(deepEqual([1, 2], [2, 1])).toBe(false);
    });

    it('separates null from undefined and from empty objects', () => {
        expect(deepEqual(null, undefined)).toBe(false);
        expect(deepEqual({}, null)).toBe(false);
        expect(deepEqual([], {})).toBe(false);
    });
});

describe('independent edits', () => {
    it('keeps both when two devices change different settings', () => {
        // This is the bug the whole module exists for: today one of these two
        // silently overwrites the other, along with the other ~58 keys.
        const base = state({ weatherUnit: 'c', language: 'en' }, 100, 'a');
        const local = state({ weatherUnit: 'f', language: 'en' }, 200, 'a');
        const remote = state({ weatherUnit: 'c', language: 'ru' }, 200, 'b');

        const { state: merged, conflicts } = mergeSharedState(base, local, remote, OPTS);

        expect(merged.values.weatherUnit).toBe('f');
        expect(merged.values.language).toBe('ru');
        expect(conflicts).toEqual([]);
    });

    it('reports the incoming key as changed so the store can be updated', () => {
        const base = state({ language: 'en' }, 100, 'a');
        const local = state({ language: 'en' }, 100, 'a');
        const remote = state({ language: 'ru' }, 200, 'b');

        const { changedKeys } = mergeSharedState(base, local, remote, OPTS);
        expect(changedKeys).toEqual(['language']);
    });

    it('leaves a key alone when only this device moved it', () => {
        const base = state({ language: 'en' }, 100, 'a');
        const local = state({ language: 'ru' }, 200, 'a');
        const remote = state({ language: 'en' }, 100, 'b');

        const { state: merged, changedKeys } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.language).toBe('ru');
        expect(changedKeys).toEqual([]);
    });
});

describe('genuine collisions', () => {
    it('is not a conflict when the later stamp carries an unchanged value', () => {
        // A newer stamp alone is not a change. The remote re-saved settings
        // without touching this key, so our edit stands.
        const base = state({ language: 'en' }, 100, 'a');
        const local = state({ language: 'ru' }, 200, 'a');
        const remote = state({ language: 'en' }, 300, 'b');

        const { state: merged, conflicts } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.language).toBe('ru');
        expect(conflicts).toEqual([]);
    });

    it('resolves a real disagreement by stamp and records it for the UI', () => {
        const base = state({ language: 'en' }, 100, 'a');
        const local = state({ language: 'ru' }, 200, 'a');
        const remote = state({ language: 'auto' }, 300, 'b');

        const { state: merged, conflicts } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.language).toBe('auto');
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            key: 'language',
            local: 'ru',
            remote: 'auto',
            winner: 'remote',
        });
    });

    it('does not call it a conflict when both sides landed on the same value', () => {
        const base = state({ weatherUnit: 'c' }, 100, 'a');
        const local = state({ weatherUnit: 'f' }, 200, 'a');
        const remote = state({ weatherUnit: 'f' }, 300, 'b');

        const { conflicts, changedKeys } = mergeSharedState(base, local, remote, OPTS);
        expect(conflicts).toEqual([]);
        expect(changedKeys).toEqual([]);
    });
});

describe('byId collections', () => {
    const t = (id: string, label: string) => ({ id, label, icon: '', color: '', kind: 'check' });

    it('keeps additions made on both devices', () => {
        // Two additions are not a contest. LWW would throw one away.
        const base = state({ journalTrackers: [t('sleep', 'Sleep')] } as never, 100, 'a');
        const local = state(
            { journalTrackers: [t('sleep', 'Sleep'), t('water', 'Water')] } as never,
            200,
            'a'
        );
        const remote = state(
            { journalTrackers: [t('sleep', 'Sleep'), t('steps', 'Steps')] } as never,
            200,
            'b'
        );

        const { state: merged, conflicts } = mergeSharedState(base, local, remote, OPTS);
        const ids = (merged.values.journalTrackers ?? []).map((x) => x.id);
        expect(ids).toEqual(['sleep', 'water', 'steps']);
        // A structural merge kept everyone's work — nothing to report.
        expect(conflicts).toEqual([]);
    });

    it('propagates a deletion the other device did not touch', () => {
        const base = state({ journalTrackers: [t('sleep', 'Sleep'), t('water', 'Water')] } as never, 100, 'a');
        const local = state({ journalTrackers: [t('sleep', 'Sleep'), t('water', 'Water')] } as never, 100, 'a');
        const remote = state({ journalTrackers: [t('sleep', 'Sleep')] } as never, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect((merged.values.journalTrackers ?? []).map((x) => x.id)).toEqual(['sleep']);
    });

    it('keeps an edit that raced a deletion', () => {
        // Losing a deletion costs the user one click; losing an edit costs them
        // work they may never notice is gone.
        const base = state({ journalTrackers: [t('water', 'Water')] } as never, 100, 'a');
        const local = state({ journalTrackers: [t('water', 'Water intake')] } as never, 200, 'a');
        const remote = state({ journalTrackers: [] } as never, 300, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.journalTrackers).toHaveLength(1);
        expect((merged.values.journalTrackers ?? [])[0].label).toBe('Water intake');
    });

    it('settles an element both devices edited by stamp', () => {
        const base = state({ journalTrackers: [t('water', 'Water')] } as never, 100, 'a');
        const local = state({ journalTrackers: [t('water', 'Local')] } as never, 200, 'a');
        const remote = state({ journalTrackers: [t('water', 'Remote')] } as never, 300, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect((merged.values.journalTrackers ?? [])[0].label).toBe('Remote');
    });

    it('keeps this device ordering rather than reshuffling it', () => {
        const base = state({ journalTrackers: [] } as never, 100, 'a');
        const local = state({ journalTrackers: [t('b', 'B'), t('a', 'A')] } as never, 200, 'a');
        const remote = state({ journalTrackers: [t('c', 'C')] } as never, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect((merged.values.journalTrackers ?? []).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    });
});

describe('record collections', () => {
    it('merges folder icons key by key', () => {
        const base = state({ folderIcons: { '10 Tasks': 'check' } }, 100, 'a');
        const local = state({ folderIcons: { '10 Tasks': 'check', '20 Notes': 'file' } }, 200, 'a');
        const remote = state({ folderIcons: { '10 Tasks': 'check', '30 Media': 'image' } }, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.folderIcons).toEqual({
            '10 Tasks': 'check',
            '20 Notes': 'file',
            '30 Media': 'image',
        });
    });

    it('honours a removal the other side left alone', () => {
        const base = state({ folderIcons: { a: '1', b: '2' } }, 100, 'a');
        const local = state({ folderIcons: { a: '1', b: '2' } }, 100, 'a');
        const remote = state({ folderIcons: { a: '1' } }, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.folderIcons).toEqual({ a: '1' });
    });
});

describe('set collections', () => {
    it('unions additions and honours removals', () => {
        const base = state({ mediaSaved: ['one.gif'] }, 100, 'a');
        const local = state({ mediaSaved: ['one.gif', 'two.gif'] }, 200, 'a');
        const remote = state({ mediaSaved: ['one.gif', 'three.gif'] }, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.mediaSaved).toEqual(['one.gif', 'two.gif', 'three.gif']);
    });

    it('drops an item one device removed and the other left untouched', () => {
        const base = state({ mediaSaved: ['one.gif', 'two.gif'] }, 100, 'a');
        const local = state({ mediaSaved: ['one.gif', 'two.gif'] }, 100, 'a');
        const remote = state({ mediaSaved: ['one.gif'] }, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.mediaSaved).toEqual(['one.gif']);
    });
});

describe('the running timer', () => {
    const session = (taskId: string) => ({
        taskId,
        filePath: 'tasks/inbox.md',
        lineNumber: 1,
        title: 'Write',
        startedAt: 1000,
        countdownMinutes: 25,
        baseMinutes: 0,
        notified: false,
    });

    it('hands a started timer to the other device', () => {
        const base = state({ activeTimer: null }, 100, 'a');
        const local = state({ activeTimer: null }, 100, 'a');
        const remote = state({ activeTimer: session('t1') } as never, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.activeTimer).toMatchObject({ taskId: 't1' });
    });

    it('lets a stop beat a start, even from the older stamp', () => {
        // Otherwise a timer stopped on the phone is resurrected by the
        // desktop's stale copy and the user cannot make it stop.
        const base = state({ activeTimer: session('t1') } as never, 100, 'a');
        const local = state({ activeTimer: null }, 200, 'a');
        const remote = state({ activeTimer: session('t1') } as never, 900, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.activeTimer).toBeNull();
    });

    it('stops when the remote stopped and we left it running', () => {
        const base = state({ activeTimer: session('t1') } as never, 100, 'a');
        const local = state({ activeTimer: session('t1') } as never, 100, 'a');
        const remote = state({ activeTimer: null }, 200, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.activeTimer).toBeNull();
    });

    it('shows the most recently started of two competing timers', () => {
        const base = state({ activeTimer: null }, 100, 'a');
        const local = state({ activeTimer: session('t1') } as never, 200, 'a');
        const remote = state({ activeTimer: session('t2') } as never, 300, 'b');

        const { state: merged } = mergeSharedState(base, local, remote, OPTS);
        expect(merged.values.activeTimer).toMatchObject({ taskId: 't2' });
    });
});

describe('first merge, with no base', () => {
    it('unions collections rather than pruning them', () => {
        // With no base every difference reads as "both sides changed". Keeping
        // an item that was deleted before sync was switched on is a far better
        // failure than deleting one nobody asked to delete.
        const local = state({ mediaSaved: ['one.gif'] }, 100, 'a');
        const remote = state({ mediaSaved: ['two.gif'] }, 200, 'b');

        const { state: merged } = mergeSharedState(null, local, remote, OPTS);
        expect(merged.values.mediaSaved).toEqual(['one.gif', 'two.gif']);
    });

    it('takes a key only one side has ever seen', () => {
        const local = state({ weatherUnit: 'f' }, 100, 'a');
        const remote = state({ language: 'ru' }, 100, 'b');

        const { state: merged } = mergeSharedState(null, local, remote, OPTS);
        expect(merged.values.weatherUnit).toBe('f');
        expect(merged.values.language).toBe('ru');
    });
});

describe('device-scoped keys', () => {
    it('are never carried by the shared document', () => {
        const local = state({ uiDensity: 'compact' } as never, 100, 'a');
        const remote = state({ uiDensity: 'spacious' } as never, 200, 'b');

        const { state: merged } = mergeSharedState(null, local, remote, OPTS);
        expect('uiDensity' in merged.values).toBe(false);
    });
});
