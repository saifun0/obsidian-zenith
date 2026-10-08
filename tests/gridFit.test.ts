import { describe, it, expect } from 'vitest';
import {
    fitLayout,
    rowsFor,
    setFixed,
    sortItems,
} from '../src/modules/dashboard/grid/gridEngine';
import { dimsOf, pxHeight, type WidgetLayoutItem } from '../src/modules/dashboard/grid/gridTypes';

/**
 * Cards that are only as tall as what is in them.
 *
 * A list of three lines in a cell four rows tall is mostly an empty cell, so a
 * card whose widget can be measured is drawn at the rows its content needs.
 * The saved layout keeps the height the user gave it — that is the ceiling —
 * and everything here is about the layout as *drawn*.
 */

const ROW = 120;
const GAP = 16;

const item = (
    id: string,
    x: number,
    y: number,
    size: 'sm' | 'md' | 'lg' = 'sm',
    over: Partial<WidgetLayoutItem> = {}
): WidgetLayoutItem => ({ id, x, y, size, ...over });

const shape = (items: WidgetLayoutItem[]): string[] =>
    sortItems(items).map((i) => `${i.id}@${i.x},${i.y}×${dimsOf(i, 4).h}`);

const fit = (items: WidgetLayoutItem[], needed: Record<string, number>) =>
    fitLayout(items, new Map(Object.entries(needed)), ROW, GAP, 4);

describe('rowsFor', () => {
    it('is the fewest rows the height fits in', () => {
        expect(rowsFor(pxHeight(1, ROW, GAP), ROW, GAP)).toBe(1);
        expect(rowsFor(pxHeight(1, ROW, GAP) + 1, ROW, GAP)).toBe(2);
        expect(rowsFor(pxHeight(2, ROW, GAP), ROW, GAP)).toBe(2);
        expect(rowsFor(pxHeight(3, ROW, GAP) - 5, ROW, GAP)).toBe(3);
    });

    it('is never less than a row, whatever it is handed', () => {
        expect(rowsFor(0, ROW, GAP)).toBe(1);
        expect(rowsFor(-40, ROW, GAP)).toBe(1);
        expect(rowsFor(Number.NaN, ROW, GAP)).toBe(1);
    });
});

describe('fitLayout', () => {
    // A tall list above a card: the case on the board that started this.
    const board = [item('tasks', 0, 0, 'lg'), item('text', 0, 4, 'sm'), item('clock', 2, 4, 'sm')];

    it('draws a measured card at the rows its content needs', () => {
        const drawn = fit(board, { tasks: 240 });
        expect(shape(drawn)).toContain('tasks@0,0×2');
    });

    it('floats what stood below into the room that leaves', () => {
        const drawn = fit(board, { tasks: 240 });
        expect(shape(drawn)).toEqual(['tasks@0,0×2', 'text@0,2×2', 'clock@2,2×2']);
    });

    it('never draws a card taller than the height it was given', () => {
        const drawn = fit(board, { tasks: 5000 });
        expect(shape(drawn)).toContain('tasks@0,0×4');
    });

    it('leaves a card nobody measured exactly as saved', () => {
        expect(fit(board, {})).toBe(board);
        expect(shape(fit(board, { text: 100 }))).toContain('tasks@0,0×4');
    });

    it('leaves a card held at its height alone, whatever it holds', () => {
        const held = [item('tasks', 0, 0, 'lg', { fixed: true }), item('text', 0, 4)];
        expect(shape(fit(held, { tasks: 100 }))).toEqual(['tasks@0,0×4', 'text@0,4×2']);
    });

    it('takes the ceiling from a height set by hand, not only from the preset', () => {
        const tall = [item('links', 0, 0, 'sm', { h: 5 })];
        expect(shape(fit(tall, { links: pxHeight(3, ROW, GAP) }))).toEqual(['links@0,0×3']);
        expect(shape(fit(tall, { links: 9999 }))).toEqual(['links@0,0×5']);
    });

    it('does not move a neighbour that has nothing above it to rise into', () => {
        const side = [item('links', 0, 0, 'sm'), item('clock', 2, 0, 'sm'), item('text', 0, 2, 'md')];
        // Links shrinks to a row; the full-width card below still has the clock above it.
        expect(shape(fit(side, { links: 100 }))).toEqual([
            'links@0,0×1',
            'clock@2,0×2',
            'text@0,2×2',
        ]);
    });

    it('does not change what is saved', () => {
        const before = JSON.stringify(board);
        fit(board, { tasks: 240, text: 100 });
        expect(JSON.stringify(board)).toBe(before);
    });
});

describe('setFixed', () => {
    const board = [item('tasks', 0, 0, 'lg'), item('text', 0, 4)];

    it('holds one card at its height and leaves the rest', () => {
        const held = setFixed(board, 'tasks', true);
        expect(held[0].fixed).toBe(true);
        expect(held[1]).toBe(board[1]);
    });

    it('lets it follow its content again without leaving a flag behind', () => {
        const back = setFixed(setFixed(board, 'tasks', true), 'tasks', false);
        expect('fixed' in back[0]).toBe(false);
        expect(back).toEqual(board);
    });
});
