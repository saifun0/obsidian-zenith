import { describe, it, expect } from 'vitest';
import {
    collides,
    compact,
    sortItems,
    clampX,
    bottomOf,
    findFreeSpot,
    dropTargetCell,
    moveItem,
    resizeItem,
    addItem,
    removeItem,
    reconcileLayout,
    stackOrder,
    reorderIds,
    stackDropIndex,
    layoutsEqual,
    type WidgetSizeInfo,
} from '../src/modules/dashboard/grid/gridEngine';
import { sizeDims, type WidgetLayoutItem } from '../src/modules/dashboard/grid/gridTypes';

/** Shorthand for building layout items. */
const item = (id: string, x: number, y: number, size: 'sm' | 'md' | 'lg' = 'sm'): WidgetLayoutItem =>
    ({ id, x, y, size });

/** Compact "id@x,y" view of a layout, for readable assertions. */
const shape = (items: WidgetLayoutItem[]): string[] =>
    sortItems(items).map((i) => `${i.id}@${i.x},${i.y}`);

describe('collides', () => {
    it('detects overlap and ignores touching edges', () => {
        expect(collides({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
        // Side by side / stacked — sharing an edge is not an overlap.
        expect(collides({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
        expect(collides({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 })).toBe(false);
    });
});

describe('clampX', () => {
    it('keeps widgets inside the 4-column grid', () => {
        expect(clampX(-1, 2)).toBe(0);
        expect(clampX(3, 2)).toBe(2); // 4 - 2
        expect(clampX(1, 4)).toBe(0); // full-width can only sit at 0
    });
});

describe('compact', () => {
    it('floats items up into free space', () => {
        const layout = [item('a', 0, 5), item('b', 2, 9)];
        expect(shape(compact(layout))).toEqual(['a@0,0', 'b@2,0']);
    });

    it('keeps stacked items in order without overlapping', () => {
        const layout = [item('a', 0, 0), item('b', 0, 4), item('c', 0, 8)];
        expect(shape(compact(layout))).toEqual(['a@0,0', 'b@0,2', 'c@0,4']);
    });

    it('is idempotent', () => {
        const once = compact([item('a', 0, 3), item('b', 2, 1), item('c', 0, 7)]);
        expect(layoutsEqual(compact(once), once)).toBe(true);
    });
});

describe('bottomOf / findFreeSpot', () => {
    it('reports the first free row below everything', () => {
        expect(bottomOf([item('a', 0, 0), item('b', 0, 2)])).toBe(4);
        expect(bottomOf([])).toBe(0);
    });

    it('finds the topmost-leftmost gap that fits', () => {
        // 'a' occupies columns 0-1 on rows 0-1, so a small widget fits beside it.
        expect(findFreeSpot([item('a', 0, 0)], sizeDims('sm'))).toEqual({ x: 2, y: 0 });
        // A full-width widget cannot share that row.
        expect(findFreeSpot([item('a', 0, 0)], sizeDims('md'))).toEqual({ x: 0, y: 2 });
    });
});

describe('moveItem', () => {
    it('gives the dropped widget the slot and reflows the rest', () => {
        const layout = [item('a', 0, 0), item('b', 2, 0)];
        // Drop 'b' onto 'a'’s slot: 'b' wins it, 'a' is pushed aside/down.
        const next = moveItem(layout, 'b', 0, 0);
        expect(next.find((i) => i.id === 'b')).toMatchObject({ x: 0, y: 0 });
        expect(collides(
            { x: 0, y: 0, ...sizeDims('sm') },
            { ...sizeDims('sm'), x: next.find((i) => i.id === 'a')!.x, y: next.find((i) => i.id === 'a')!.y }
        )).toBe(false);
    });

    it('clamps out-of-bounds drops back into the grid', () => {
        const next = moveItem([item('a', 0, 0)], 'a', 9, -3);
        expect(next[0]).toMatchObject({ x: 2, y: 0 });
    });

    it('ignores unknown ids', () => {
        const layout = [item('a', 0, 0)];
        expect(moveItem(layout, 'nope', 2, 2)).toBe(layout);
    });

    it('leaves no vertical hole behind the moved widget', () => {
        const layout = [item('a', 0, 0), item('b', 0, 2), item('c', 0, 4)];
        const next = moveItem(layout, 'a', 0, 4);
        expect(bottomOf(next)).toBe(6); // three 2-row widgets, fully packed
    });

    // The regression that let a widget only ever travel upwards: placing the
    // dragged widget first meant nothing was above it, so compaction floated it
    // back to row 0 on every drop.
    it('moves a widget downwards past its neighbours', () => {
        const layout = [item('a', 0, 0), item('b', 0, 2), item('c', 0, 4)];
        const next = moveItem(layout, 'a', 0, 4);
        expect(shape(next)).toEqual(['b@0,0', 'a@0,2', 'c@0,4']);
    });

    it('drops a small widget below a full-width one', () => {
        // The dashboard's default shape: two small cards over a wide one.
        const layout = [item('clock', 0, 0), item('weather', 2, 0), item('tasks', 0, 2, 'lg')];
        const next = moveItem(layout, 'clock', 0, 6);
        const clock = next.find((i) => i.id === 'clock')!;
        const tasks = next.find((i) => i.id === 'tasks')!;
        expect(clock.y).toBeGreaterThanOrEqual(tasks.y + sizeDims('lg').h);
    });

    it('caps how far down a widget can go, so the grid cannot grow forever', () => {
        const layout = [item('a', 0, 0), item('b', 0, 2)];
        const far = moveItem(layout, 'a', 0, 500);
        // Clamped to the bottom of the others, then compacted — never runaway.
        expect(bottomOf(far)).toBe(4);
        expect(shape(far)).toEqual(['b@0,0', 'a@0,2']);
    });

    it('still lets a widget travel back up', () => {
        const layout = [item('a', 0, 0), item('b', 0, 2), item('c', 0, 4)];
        const next = moveItem(layout, 'c', 0, 0);
        expect(shape(next)).toEqual(['c@0,0', 'a@0,2', 'b@0,4']);
    });
});

describe('resizeItem', () => {
    it('re-flows neighbours when a widget grows', () => {
        const layout = [item('a', 0, 0), item('b', 2, 0)];
        const next = resizeItem(layout, 'a', 'md'); // 'a' becomes full-width
        expect(next.find((i) => i.id === 'a')).toMatchObject({ x: 0, y: 0, size: 'md' });
        expect(next.find((i) => i.id === 'b')!.y).toBe(2); // pushed below
    });

    it('pulls neighbours up when a widget shrinks', () => {
        const layout = [item('a', 0, 0, 'lg'), item('b', 0, 4)];
        const next = resizeItem(layout, 'a', 'sm');
        // 'a' shrinks from 4 rows to 2, so 'b' rises from row 4 to row 2. It
        // stays in its column: compaction is vertical only, never sideways.
        expect(next.find((i) => i.id === 'b')).toMatchObject({ x: 0, y: 2 });
    });

    // The regression the user hit: resizing a widget that sits *below* others
    // sent it flying to row 0 (it was placed first, so nothing was above it to
    // stop the upward float). It must stay anchored where it is.
    it('keeps a resized widget anchored instead of flinging it to the top', () => {
        const layout = [item('clock', 0, 0), item('weather', 2, 0), item('tasks', 0, 2, 'md')];
        const next = resizeItem(layout, 'tasks', 'lg');
        expect(next.find((i) => i.id === 'clock')).toMatchObject({ x: 0, y: 0 });
        expect(next.find((i) => i.id === 'weather')).toMatchObject({ x: 2, y: 0 });
        expect(next.find((i) => i.id === 'tasks')).toMatchObject({ x: 0, y: 2, size: 'lg' });
    });
});

describe('addItem / removeItem', () => {
    it('places a new widget in the first gap', () => {
        const next = addItem([item('a', 0, 0)], 'b', 'sm');
        expect(shape(next)).toEqual(['a@0,0', 'b@2,0']);
    });

    it('does not add the same widget twice', () => {
        const layout = [item('a', 0, 0)];
        expect(addItem(layout, 'a', 'sm')).toBe(layout);
    });

    it('compacts survivors after a removal', () => {
        const layout = [item('a', 0, 0, 'md'), item('b', 0, 2, 'md'), item('c', 0, 4, 'md')];
        expect(shape(removeItem(layout, 'a'))).toEqual(['b@0,0', 'c@0,2']);
    });

    it('ignores removing something that is not placed', () => {
        const layout = [item('a', 0, 0)];
        expect(removeItem(layout, 'nope')).toBe(layout);
    });
});

describe('reconcileLayout', () => {
    const info = (id: string, defaultSize: 'sm' | 'md' | 'lg' = 'sm'): WidgetSizeInfo => ({
        id,
        sizes: ['sm', 'md', 'lg'],
        defaultSize,
    });

    it('auto-places every widget when there is no saved layout', () => {
        const next = reconcileLayout([], [info('a'), info('b')]);
        expect(shape(next)).toEqual(['a@0,0', 'b@2,0']);
    });

    it('drops widgets that are no longer registered', () => {
        const next = reconcileLayout([item('a', 0, 0), item('gone', 2, 0)], [info('a')]);
        expect(shape(next)).toEqual(['a@0,0']);
    });

    it('keeps user-removed widgets out, but still places new ones', () => {
        const next = reconcileLayout([item('a', 0, 0)], [info('a'), info('b'), info('c')], ['b']);
        expect(shape(next)).toEqual(['a@0,0', 'c@2,0']);
    });

    it('repairs a size the widget no longer supports', () => {
        const limited: WidgetSizeInfo = { id: 'a', sizes: ['md'], defaultSize: 'md' };
        const next = reconcileLayout([item('a', 0, 0, 'sm')], [limited]);
        expect(next[0].size).toBe('md');
    });

    it('preserves existing positions instead of reshuffling', () => {
        const saved = [item('a', 2, 0), item('b', 0, 0)];
        const next = reconcileLayout(saved, [info('a'), info('b')]);
        expect(next.find((i) => i.id === 'a')).toMatchObject({ x: 2, y: 0 });
        expect(next.find((i) => i.id === 'b')).toMatchObject({ x: 0, y: 0 });
    });

    it('de-duplicates a corrupted layout', () => {
        const next = reconcileLayout([item('a', 0, 0), item('a', 2, 0)], [info('a')]);
        expect(next).toHaveLength(1);
    });

    it('survives a remove / re-add round trip', () => {
        const available = [info('a'), info('b')];
        const full = reconcileLayout([], available);
        expect(shape(full)).toEqual(['a@0,0', 'b@2,0']);

        // Removing drops it from the layout *and* records it as hidden.
        const afterRemove = reconcileLayout(removeItem(full, 'b'), available, ['b']);
        expect(shape(afterRemove)).toEqual(['a@0,0']);

        // Re-adding clears it from hidden and places it back.
        const afterAdd = reconcileLayout(addItem(afterRemove, 'b', 'sm'), available, []);
        expect(shape(afterAdd)).toEqual(['a@0,0', 'b@2,0']);
    });

    it('re-adds a dropped widget that was not recorded as hidden', () => {
        // The trap this guards: reconcile cannot tell "the user removed it" from
        // "it was just registered", so removal MUST also write hiddenWidgetIds —
        // otherwise the widget reappears on the very next render.
        const available = [info('a'), info('b')];
        const stripped = removeItem(reconcileLayout([], available), 'b');
        expect(shape(reconcileLayout(stripped, available, []))).toContain('b@2,0');
    });
});

describe('dropTargetCell', () => {
    // A 210px column + 16px gap = 226px per step; rows are 120 + 16 = 136px.
    const COL = 210;
    const colStep = COL + 16;
    const rowStep = 120 + 16;

    it('stays put when the pointer has not moved', () => {
        expect(dropTargetCell({ x: 2, y: 3 }, { dx: 0, dy: 0 }, COL)).toEqual({ x: 2, y: 3 });
    });

    it('flips to the next cell only past the halfway point', () => {
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: colStep * 0.49, dy: 0 }, COL).x).toBe(0);
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: colStep * 0.51, dy: 0 }, COL).x).toBe(1);
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: 0, dy: rowStep * 0.51 }, COL).y).toBe(1);
    });

    it('tracks multi-cell drags in both axes', () => {
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: colStep * 2, dy: rowStep * 3 }, COL)).toEqual({
            x: 2,
            y: 3,
        });
    });

    it('never returns a negative row', () => {
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: 0, dy: -rowStep * 5 }, COL).y).toBe(0);
    });

    it('leaves x unclamped for moveItem to resolve', () => {
        // Dragged far right — moveItem is what pulls it back into the grid.
        const target = dropTargetCell({ x: 0, y: 0 }, { dx: colStep * 9, dy: 0 }, COL);
        expect(target.x).toBe(9);
        expect(moveItem([item('a', 0, 0)], 'a', target.x, target.y)[0].x).toBe(2);
    });
});

describe('default dashboard layout', () => {
    it('places the four built-in widgets without gaps or overlaps', () => {
        // Registration order mirrors the modules' `order`: clock, weather, tasks, content.
        const available: WidgetSizeInfo[] = [
            { id: 'dashboard.clock', sizes: ['sm', 'md'], defaultSize: 'sm' },
            { id: 'weather.forecast', sizes: ['sm', 'md', 'lg'], defaultSize: 'sm' },
            { id: 'tasks.overview', sizes: ['md', 'lg'], defaultSize: 'lg' },
            { id: 'content.overview', sizes: ['md', 'lg'], defaultSize: 'md' },
        ];
        const layout = reconcileLayout([], available);

        // Clock and weather share the top row; the full-width widgets stack below.
        expect(shape(layout)).toEqual([
            'dashboard.clock@0,0',
            'weather.forecast@2,0',
            'tasks.overview@0,2',
            'content.overview@0,6',
        ]);

        // No two widgets may overlap.
        for (let i = 0; i < layout.length; i++) {
            for (let j = i + 1; j < layout.length; j++) {
                const a = layout[i];
                const b = layout[j];
                expect(
                    collides(
                        { x: a.x, y: a.y, ...sizeDims(a.size) },
                        { x: b.x, y: b.y, ...sizeDims(b.size) }
                    )
                ).toBe(false);
            }
        }
    });
});

describe('stacked (one-column) ordering', () => {
    it('honours the saved order and appends unknown widgets in reading order', () => {
        const layout = [item('a', 0, 0), item('b', 2, 0), item('c', 0, 2)];
        // 'c' first, then whatever the grid order says for the rest.
        expect(stackOrder(layout, ['c']).map((i) => i.id)).toEqual(['c', 'a', 'b']);
    });

    it('ignores saved ids that are no longer placed', () => {
        const layout = [item('a', 0, 0)];
        expect(stackOrder(layout, ['gone', 'a']).map((i) => i.id)).toEqual(['a']);
    });

    it('falls back to grid reading order when nothing is saved', () => {
        const layout = [item('b', 2, 0), item('a', 0, 0), item('c', 0, 2)];
        expect(stackOrder(layout, []).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('reorderIds', () => {
    it('moves an id to the requested slot', () => {
        expect(reorderIds(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
        expect(reorderIds(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    });

    it('clamps out-of-range indexes and ignores unknown ids', () => {
        expect(reorderIds(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
        expect(reorderIds(['a', 'b'], 'a', -5)).toEqual(['a', 'b']);
        expect(reorderIds(['a', 'b'], 'zzz', 0)).toEqual(['a', 'b']);
    });
});

describe('stackDropIndex', () => {
    // Three stacked cards, 100px tall each: tops 0, 100, 200.
    const tops = [0, 100, 200];
    const heights = [100, 100, 100];

    it('keeps the slot until the card is pulled past a neighbour’s middle', () => {
        expect(stackDropIndex(tops, heights, 0, 0)).toBe(0);
        expect(stackDropIndex(tops, heights, 0, 49)).toBe(0);
        expect(stackDropIndex(tops, heights, 0, 51)).toBe(1); // past card 2's centre
    });

    it('tracks a drag all the way to the bottom and back to the top', () => {
        expect(stackDropIndex(tops, heights, 0, 200)).toBe(2);
        expect(stackDropIndex(tops, heights, 2, -200)).toBe(0);
    });
});

describe('layoutsEqual', () => {
    it('compares by position and size, not array order', () => {
        expect(layoutsEqual([item('a', 0, 0), item('b', 2, 0)], [item('b', 2, 0), item('a', 0, 0)])).toBe(true);
        expect(layoutsEqual([item('a', 0, 0)], [item('a', 0, 1)])).toBe(false);
        expect(layoutsEqual([item('a', 0, 0, 'sm')], [item('a', 0, 0, 'md')])).toBe(false);
        expect(layoutsEqual([item('a', 0, 0)], [])).toBe(false);
    });
});
