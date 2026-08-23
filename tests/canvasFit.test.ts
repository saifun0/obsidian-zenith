import { describe, it, expect } from 'vitest';
import { DEFAULT_FIT_OPTIONS, fitNodes, heightForText } from '../src/modules/canvas/services/fit';
import { layoutCanvas } from '../src/modules/canvas/services/layout';
import type { CanvasData, CanvasNode } from '../src/modules/canvas/canvasTypes';

const opts = DEFAULT_FIT_OPTIONS;

const text = (id: string, body: string, width = 250, height = 400): CanvasNode =>
    ({ id, type: 'text', x: 0, y: 0, width, height, text: body }) as CanvasNode;

const byId = (data: CanvasData, id: string) => data.nodes.find((n) => n.id === id)!;

describe('heightForText', () => {
    it('never goes below the floor, however little the card holds', () => {
        expect(heightForText('hi', 250, opts)).toBe(opts.minHeight);
        expect(heightForText('', 250, opts)).toBe(opts.minHeight);
    });

    it('grows with the number of lines', () => {
        const one = heightForText('one', 250, opts);
        const three = heightForText('one\ntwo\nthree', 250, opts);
        expect(three).toBeGreaterThan(one);
    });

    it('counts a wrapped line as more than one', () => {
        const short = heightForText('word', 250, opts);
        const long = heightForText('word '.repeat(60).trim(), 250, opts);
        expect(long).toBeGreaterThan(short * 2);
    });

    it('needs less height when the card is wider', () => {
        const body = 'word '.repeat(40).trim();
        expect(heightForText(body, 600, opts)).toBeLessThan(heightForText(body, 200, opts));
    });

    it('gives a heading more room than body text of the same length', () => {
        expect(heightForText('# Title', 250, opts)).toBeGreaterThan(heightForText('Title', 250, opts));
        expect(heightForText('# Title', 250, opts)).toBeGreaterThan(heightForText('### Title', 250, opts));
    });

    it('respects the ceiling rather than producing a mile-long card', () => {
        expect(heightForText('word '.repeat(5000), 250, opts)).toBe(opts.maxHeight);
    });

    it('treats a blank line as a paragraph break that takes space', () => {
        expect(heightForText('a\n\nb', 250, { ...opts, minHeight: 0 })).toBeGreaterThan(
            heightForText('a\nb', 250, { ...opts, minHeight: 0 })
        );
    });

    it('never divides by a non-positive line width on an absurdly narrow card', () => {
        expect(Number.isFinite(heightForText('some text', 1, opts))).toBe(true);
    });
});

describe('fitNodes', () => {
    it('shrinks an oversized card', () => {
        const out = fitNodes({ nodes: [text('a', 'short', 250, 400)], edges: [] });
        expect(byId(out, 'a').height).toBeLessThan(400);
    });

    it('leaves width alone — that is the dimension people set on purpose', () => {
        const out = fitNodes({ nodes: [text('a', 'short', 321, 400)], edges: [] });
        expect(byId(out, 'a').width).toBe(321);
    });

    it('returns the very same object when nothing needs changing', () => {
        const once = fitNodes({ nodes: [text('a', 'short', 250, 400)], edges: [] });
        expect(fitNodes(once)).toBe(once);
    });

    it('does not touch file, link or group nodes', () => {
        const data: CanvasData = {
            nodes: [
                { id: 'f', type: 'file', x: 0, y: 0, width: 400, height: 400, file: 'a.md' },
                { id: 'l', type: 'link', x: 0, y: 0, width: 400, height: 400, url: 'https://x.dev' },
                { id: 'g', type: 'group', x: 0, y: 0, width: 900, height: 900, label: 'G' },
            ] as CanvasNode[],
            edges: [],
        };
        expect(fitNodes(data)).toBe(data);
    });

    it('honours a selection', () => {
        const data: CanvasData = {
            nodes: [text('a', 'short', 250, 400), text('b', 'short', 250, 400)],
            edges: [],
        };
        const out = fitNodes(data, { only: new Set(['a']) });
        expect(byId(out, 'a').height).toBeLessThan(400);
        expect(byId(out, 'b').height).toBe(400);
    });

    it('does not mutate its input', () => {
        const data: CanvasData = { nodes: [text('a', 'short', 250, 400)], edges: [] };
        const snapshot = JSON.stringify(data);
        fitNodes(data);
        expect(JSON.stringify(data)).toBe(snapshot);
    });
});

describe('layoutCanvas with a selection', () => {
    const node = (id: string, x: number, y: number): CanvasNode =>
        ({ id, type: 'text', x, y, width: 200, height: 100, text: id }) as CanvasNode;

    it('leaves unselected nodes exactly where they were', () => {
        const data: CanvasData = {
            nodes: [node('a', 0, 0), node('b', 0, 0), node('untouched', 5000, 5000)],
            edges: [],
        };
        const out = layoutCanvas(data, 'grid', { only: new Set(['a', 'b']) });
        expect(byId(out, 'untouched').x).toBe(5000);
        expect(byId(out, 'untouched').y).toBe(5000);
        expect(byId(out, 'a')).not.toEqual(byId(out, 'b'));
    });

    it('rearranges in place rather than teleporting the branch', () => {
        const data: CanvasData = {
            nodes: [node('a', 3000, 3000), node('b', 3000, 3000), node('far', 0, 0)],
            edges: [],
        };
        const out = layoutCanvas(data, 'grid', { only: new Set(['a', 'b']) });
        // The selection starts where it already sat, not at the canvas origin.
        expect(Math.min(byId(out, 'a').x, byId(out, 'b').x)).toBe(3000);
    });

    it('does nothing when fewer than two blocks are selected', () => {
        const data: CanvasData = { nodes: [node('a', 0, 0), node('b', 0, 0)], edges: [] };
        expect(layoutCanvas(data, 'grid', { only: new Set(['a']) })).toBe(data);
    });

    it('moves a whole group when a node inside it is selected', () => {
        // Membership is geometric, so moving only the picked node would empty
        // the group without the user ever asking for that.
        const data: CanvasData = {
            nodes: [
                { id: 'g', type: 'group', x: 0, y: 0, width: 600, height: 400, label: 'G' },
                node('inside', 40, 40),
                node('other', 2000, 0),
            ] as CanvasNode[],
            edges: [],
        };
        const out = layoutCanvas(data, 'grid', { only: new Set(['inside', 'other']) });
        const dx = byId(out, 'g').x - byId(data, 'g').x;
        expect(byId(out, 'inside').x - byId(data, 'inside').x).toBe(dx);
    });

    it('centres a radial selection on the selection, not on the canvas', () => {
        const data: CanvasData = {
            nodes: [node('a', 4000, 4000), node('b', 4200, 4000), node('c', 4100, 4200), node('far', 0, 0)],
            edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
        };
        const out = layoutCanvas(data, 'radial', { only: new Set(['a', 'b', 'c']) });
        for (const id of ['a', 'b', 'c']) {
            expect(byId(out, id).x).toBeGreaterThan(2000);
            expect(byId(out, id).y).toBeGreaterThan(2000);
        }
    });
});
