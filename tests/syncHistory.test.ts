import { describe, it, expect } from 'vitest';
import { groupHistory } from '../src/modules/sync/components/historyGroups';
import type { JournalEntry } from '../src/modules/sync/syncTypes';

let clock = 0;

/** Newest first, the way `readHistory` returns them. */
const entry = (
    kind: JournalEntry['kind'],
    keys: string[],
    over: Partial<JournalEntry> = {}
): JournalEntry => ({
    at: String(1_000_000 - clock++).padStart(12, '0'),
    wall: 1_800_000_000_000 - clock * 1000,
    deviceId: 'desktop',
    kind,
    keys,
    ...over,
});

describe('groupHistory', () => {
    // The fault it exists for: dragging one widget writes six journal lines that
    // all say `dashboardBgSource`, and the page drew six identical rows.
    it('collapses a run of identical lines into one row', () => {
        const groups = groupHistory([
            entry('publish', ['dashboardBgSource']),
            entry('publish', ['dashboardBgSource']),
            entry('publish', ['dashboardBgSource']),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(3);
        expect(groups[0].keys).toEqual(['dashboardBgSource']);
    });

    // Consecutive, never global: "sent, received, sent again" is a story, and
    // "sent ×2, received ×1" is not.
    it('keeps the order, so a merge between two publishes stays between them', () => {
        const groups = groupHistory([
            entry('publish', ['a']),
            entry('merge', ['a']),
            entry('publish', ['a']),
        ]);

        expect(groups.map((g) => g.kind)).toEqual(['publish', 'merge', 'publish']);
        expect(groups.every((g) => g.count === 1)).toBe(true);
    });

    it('does not merge rows that report different keys', () => {
        const groups = groupHistory([
            entry('publish', ['a']),
            entry('publish', ['b']),
            entry('publish', ['a', 'b']),
        ]);
        expect(groups).toHaveLength(3);
    });

    // The key order comes out of a diff and means nothing; two lines listing the
    // same settings are the same line.
    it('ignores the order the keys arrived in', () => {
        const groups = groupHistory([entry('publish', ['a', 'b']), entry('publish', ['b', 'a'])]);
        expect(groups).toHaveLength(1);
        expect(groups[0].count).toBe(2);
    });

    // Undo acts on the newest line of a run, because each line's `before` is the
    // state just before that line — the group's own timestamp is the newest too.
    it('points the undo at the newest line of the run', () => {
        const newest = entry('merge', ['a'], { before: { a: 1 } });
        const older = entry('merge', ['a'], { before: { a: 0 } });
        const [group] = groupHistory([newest, older]);

        expect(group.latest).toBe(newest);
        expect(group.at).toBe(newest.wall);
        expect(group.undoable).toBe(true);
    });

    // A publish changed nothing that was not already this device's own choice,
    // so it records no previous values and cannot be undone.
    it('offers no undo where nothing was recorded to undo to', () => {
        const [group] = groupHistory([entry('publish', ['a'])]);
        expect(group.undoable).toBe(false);
        expect(groupHistory([entry('merge', ['a'], { before: {} })])[0].undoable).toBe(false);
    });

    it('has nothing to say about an empty journal', () => {
        expect(groupHistory([])).toEqual([]);
    });
});
