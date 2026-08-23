import { describe, it, expect } from 'vitest';
import {
    sizeDims,
    dimsOf,
    rectOf,
    pxHeight,
    normalizeGridConfig,
    DEFAULT_GRID_CONFIG,
    GRID_LIMITS,
    MAX_ROWS,
    CANVAS_WIDTH,
    normalizeCanvasWidth,
    stepCanvasWidth,
} from '../src/modules/dashboard/grid/gridTypes';
import {
    addItem,
    clampX,
    compact,
    findFreeSpot,
    moveItem,
    dropTargetCell,
    reconcileLayout,
    repack,
    resizeItem,
    setHeight,
    setWidth,
    type WidgetSizeInfo,
} from '../src/modules/dashboard/grid/gridEngine';
import type { WidgetLayoutItem } from '../src/modules/dashboard/grid/gridTypes';

const item = (id: string, x: number, y: number, size: 'sm' | 'md' | 'lg' = 'sm'): WidgetLayoutItem => ({
    id,
    x,
    y,
    size,
});

describe('sizeDims', () => {
    it('keeps today’s dimensions on the default 4 columns', () => {
        expect(sizeDims('sm', 4)).toEqual({ w: 2, h: 2 });
        expect(sizeDims('md', 4)).toEqual({ w: 4, h: 2 });
        expect(sizeDims('lg', 4)).toEqual({ w: 4, h: 4 });
    });

    it('scales with the column count instead of staying absolute', () => {
        expect(sizeDims('md', 6)).toEqual({ w: 6, h: 2 });
        expect(sizeDims('md', 2)).toEqual({ w: 2, h: 2 });
        expect(sizeDims('lg', 6)).toEqual({ w: 6, h: 4 });
    });

    it('rounds "half" down so two small widgets always fit side by side', () => {
        for (const cols of [2, 3, 4, 5, 6]) {
            const { w } = sizeDims('sm', cols);
            expect(w * 2).toBeLessThanOrEqual(cols);
        }
        expect(sizeDims('sm', 5)).toEqual({ w: 2, h: 2 });
        expect(sizeDims('sm', 3)).toEqual({ w: 1, h: 2 });
    });

    it('never produces a zero-width widget', () => {
        expect(sizeDims('sm', 1).w).toBe(1);
    });

    it('is what rectOf resolves through', () => {
        expect(rectOf(item('a', 1, 2, 'md'), 6)).toEqual({ x: 1, y: 2, w: 6, h: 2 });
    });
});

describe('normalizeGridConfig', () => {
    it('falls back to the defaults for missing or junk values', () => {
        expect(normalizeGridConfig(undefined)).toEqual(DEFAULT_GRID_CONFIG);
        expect(normalizeGridConfig({ columns: NaN, rowHeight: NaN, gap: NaN })).toEqual(
            DEFAULT_GRID_CONFIG
        );
    });

    it('clamps hand-edited settings into range', () => {
        const [minCols, maxCols] = GRID_LIMITS.columns;
        expect(normalizeGridConfig({ columns: 0 }).columns).toBe(minCols);
        expect(normalizeGridConfig({ columns: 99 }).columns).toBe(maxCols);
        expect(normalizeGridConfig({ rowHeight: 10 }).rowHeight).toBe(GRID_LIMITS.rowHeight[0]);
        expect(normalizeGridConfig({ gap: -5 }).gap).toBe(GRID_LIMITS.gap[0]);
    });

    it('keeps values that are already valid', () => {
        expect(normalizeGridConfig({ columns: 6, rowHeight: 150, gap: 8, maxWidth: 1200 })).toEqual({
            columns: 6,
            rowHeight: 150,
            gap: 8,
            maxWidth: 1200,
        });
    });

    it('fills in the canvas width for configs saved before it existed', () => {
        expect(normalizeGridConfig({ columns: 4 }).maxWidth).toBe(DEFAULT_GRID_CONFIG.maxWidth);
    });
});

describe('canvas width', () => {
    it('keeps 0 as "full width"', () => {
        expect(normalizeCanvasWidth(0)).toBe(0);
        expect(normalizeGridConfig({ maxWidth: 0 }).maxWidth).toBe(0);
    });

    it('snaps an arbitrary width onto the nearest offered step', () => {
        expect(normalizeCanvasWidth(1000)).toBe(1040);
        expect(normalizeCanvasWidth(910)).toBe(920);
        expect(normalizeCanvasWidth(99999)).toBe(1600);
        expect(normalizeCanvasWidth(-5)).toBe(CANVAS_WIDTH);
        expect(normalizeCanvasWidth('nonsense')).toBe(CANVAS_WIDTH);
    });

    it('steps through the list, with "full" as the widest setting', () => {
        expect(stepCanvasWidth(720, 1)).toBe(840);
        expect(stepCanvasWidth(840, -1)).toBe(720);
        // One past the widest fixed size is "full".
        expect(stepCanvasWidth(1600, 1)).toBe(0);
        expect(stepCanvasWidth(0, -1)).toBe(1600);
    });

    it('stops at both ends instead of wrapping', () => {
        expect(stepCanvasWidth(720, -1)).toBe(720);
        expect(stepCanvasWidth(0, 1)).toBe(0);
    });
});

describe('pxHeight', () => {
    it('honours a custom row height and gap', () => {
        expect(pxHeight(2)).toBe(2 * 120 + 16);
        expect(pxHeight(2, 100, 8)).toBe(208);
        expect(pxHeight(1, 100, 8)).toBe(100);
    });
});

describe('engine at a non-default column count', () => {
    it('clamps x to the configured width', () => {
        expect(clampX(9, 2, 6)).toBe(4);
        expect(clampX(9, 2, 4)).toBe(2);
    });

    it('packs two small widgets per row on a 6-column grid', () => {
        // sm is 3 wide at 6 columns, so exactly two fit.
        const layout = compact([item('a', 0, 0), item('b', 3, 0), item('c', 0, 2)], 6);
        expect(layout.find((i) => i.id === 'b')).toMatchObject({ x: 3, y: 0 });
        expect(layout.find((i) => i.id === 'c')).toMatchObject({ y: 2 });
    });

    it('finds a free spot within the configured columns', () => {
        const spot = findFreeSpot([item('a', 0, 0, 'md')], sizeDims('sm', 6), 6);
        expect(spot).toEqual({ x: 0, y: 2 });
    });

    it('re-flows a full-width widget when the grid narrows', () => {
        // 'md' is full width, so on 2 columns it can't share a row.
        const layout = compact([item('a', 0, 0, 'md'), item('b', 0, 0, 'md')], 2);
        expect(layout.map((i) => i.y)).toEqual([0, 2]);
        expect(layout.every((i) => i.x === 0)).toBe(true);
    });

    it('keeps a dragged widget inside a narrower grid', () => {
        const layout = moveItem([item('a', 0, 0), item('b', 2, 0)], 'b', 5, 0, 4);
        expect(layout.find((i) => i.id === 'b')?.x).toBeLessThanOrEqual(2);
    });

    it('adds new widgets using the configured columns', () => {
        const layout = addItem([item('a', 0, 0, 'md')], 'b', 'sm', 6);
        expect(layout.find((i) => i.id === 'b')).toMatchObject({ x: 0, y: 2 });
    });

    it('reconciles a saved layout against a changed column count', () => {
        const available: WidgetSizeInfo[] = [
            { id: 'a', sizes: ['sm', 'md'], defaultSize: 'sm' },
            { id: 'b', sizes: ['sm', 'md'], defaultSize: 'sm' },
        ];
        // Saved against 4 columns, now rendered on 2 — 'b' at x:2 no longer fits.
        const layout = reconcileLayout([item('a', 0, 0), item('b', 2, 0)], available, [], 2);
        expect(layout.every((i) => i.x + sizeDims(i.size, 2).w <= 2)).toBe(true);
        expect(layout).toHaveLength(2);
    });
});

describe('explicit widths', () => {
    it('overrides the preset, clamped to the grid', () => {
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), w: 3 }, 6)).toEqual({ w: 3, h: 2 });
        // Wider than the whole grid is impossible.
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), w: 9 }, 4)).toEqual({ w: 4, h: 2 });
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), w: 0 }, 4)).toEqual({ w: 1, h: 2 });
    });

    it('falls back to the preset when unset', () => {
        expect(dimsOf(item('a', 0, 0, 'sm'), 6)).toEqual(sizeDims('sm', 6));
    });

    it('is what makes the column count matter', () => {
        // The presets alone are proportional: half of 4 and half of 6 are the
        // same fraction, so the dashboard looks identical either way.
        expect(sizeDims('sm', 4).w / 4).toBe(sizeDims('sm', 6).w / 6);
        // With explicit spans, 6 columns fit three 2-wide cards in a row where
        // 4 columns only fit two.
        const three = [item('a', 0, 0), item('b', 0, 0), item('c', 0, 0)].map((i) => ({ ...i, w: 2 }));
        // repack, not compact: compaction keeps each saved x, so three widgets
        // all stored at x:0 would stack regardless of how wide the grid is.
        expect(repack(three, 6).every((i) => i.y === 0)).toBe(true);
        expect(repack(three, 4).filter((i) => i.y === 0)).toHaveLength(2);
    });

    it('re-flows neighbours when a widget is widened', () => {
        const layout = setWidth([item('a', 0, 0), item('b', 2, 0)], 'a', 4, 4);
        expect(layout.find((i) => i.id === 'a')).toMatchObject({ x: 0, y: 0, w: 4 });
        // 'b' can no longer share the row.
        expect(layout.find((i) => i.id === 'b')?.y).toBe(2);
    });

    it('clears the manual span when a preset is picked again', () => {
        const widened = setWidth([item('a', 0, 0)], 'a', 4, 4);
        expect(widened[0].w).toBe(4);
        expect(resizeItem(widened, 'a', 'sm', 4)[0].w).toBeUndefined();
    });

    it('survives a change of column count, clamped on read', () => {
        const wide = setWidth([item('a', 0, 0)], 'a', 6, 6);
        expect(dimsOf(wide[0], 2).w).toBe(2);
        // The stored value is untouched, so widening the grid restores it.
        expect(dimsOf(wide[0], 6).w).toBe(6);
    });
});

describe('repack', () => {
    it('pairs half-width widgets up when the grid widens', () => {
        // Saved on 4 columns: two `sm` side by side at x 0 and 2.
        const saved = [item('a', 0, 0), item('b', 2, 0)];
        // On 6 columns `sm` is 3 wide, so their old x values now overlap.
        // Compaction alone would strand 'b' on its own row.
        expect(compact(saved, 6).find((i) => i.id === 'b')?.y).toBe(2);
        const packed = repack(saved, 6);
        expect(packed.map((i) => ({ id: i.id, x: i.x, y: i.y }))).toEqual([
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 3, y: 0 },
        ]);
    });

    it('keeps reading order when the grid narrows', () => {
        const saved = [item('a', 0, 0), item('b', 2, 0), item('c', 0, 2)];
        const packed = repack(saved, 2);
        expect(packed.map((i) => i.id)).toEqual(['a', 'b', 'c']);
        expect(packed.every((i) => i.x + sizeDims(i.size, 2).w <= 2)).toBe(true);
    });

    it('leaves a single full-width column alone', () => {
        const saved = [item('a', 0, 0, 'md'), item('b', 0, 2, 'md')];
        expect(repack(saved, 4)).toEqual(saved);
    });
});

describe('dropTargetCell', () => {
    it('snaps using the configured row height and gap', () => {
        // One row step down = rowHeight + gap.
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: 0, dy: 108 }, 100, 100, 8)).toEqual({ x: 0, y: 1 });
        // Just under half a step still rounds back to the original row.
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: 0, dy: 50 }, 100, 100, 8)).toEqual({ x: 0, y: 0 });
    });

    it('defaults to the built-in geometry', () => {
        expect(dropTargetCell({ x: 0, y: 0 }, { dx: 0, dy: 136 }, 100)).toEqual({ x: 0, y: 1 });
    });
});

describe('explicit heights', () => {
    it('overrides the preset and clamps to MAX_ROWS', () => {
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), h: 5 }, 4).h).toBe(5);
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), h: 99 }, 4).h).toBe(MAX_ROWS);
        expect(dimsOf({ ...item('a', 0, 0, 'sm'), h: 0 }, 4).h).toBe(1);
    });

    it('pushes the widgets below it down', () => {
        const layout = setHeight([item('a', 0, 0, 'md'), item('b', 0, 2, 'md')], 'a', 4, 4);
        expect(layout.find((i) => i.id === 'b')?.y).toBe(4);
    });

    it('is cleared along with the width when a preset is picked', () => {
        const custom = setHeight(setWidth([item('a', 0, 0)], 'a', 3, 4), 'a', 6, 4);
        expect(custom[0].h).toBe(6);
        const reset = resizeItem(custom, 'a', 'sm', 4);
        expect(reset[0].h).toBeUndefined();
        expect(reset[0].w).toBeUndefined();
    });
});
