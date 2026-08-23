import { describe, it, expect } from 'vitest';
import { normalizeEdgeSides } from '../src/modules/canvas/services/edges';
import { layoutCanvas } from '../src/modules/canvas/services/layout';
import type { CanvasData, CanvasEdge, CanvasNode } from '../src/modules/canvas/canvasTypes';

const node = (id: string, x: number, y: number, w = 200, h = 100): CanvasNode =>
    ({ id, type: 'text', x, y, width: w, height: h, text: id }) as CanvasNode;

const edge = (from: string, to: string, extra: Partial<CanvasEdge> = {}): CanvasEdge => ({
    id: `${from}-${to}`,
    fromNode: from,
    toNode: to,
    ...extra,
});

const sides = (data: CanvasData, id: string) => {
    const e = data.edges.find((x) => x.id === id)!;
    return `${e.fromSide}->${e.toSide}`;
};

describe('normalizeEdgeSides', () => {
    it('joins a node above to one below, bottom to top', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('b', 0, 400)],
            edges: [edge('a', 'b')],
        });
        expect(sides(out, 'a-b')).toBe('bottom->top');
    });

    it('flips when the arrow points upward', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 400), node('b', 0, 0)],
            edges: [edge('a', 'b')],
        });
        expect(sides(out, 'a-b')).toBe('top->bottom');
    });

    it('joins side by side, right to left', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('b', 600, 0)],
            edges: [edge('a', 'b')],
        });
        expect(sides(out, 'a-b')).toBe('right->left');
    });

    it('prefers the vertical join for nodes sharing a column, however far apart', () => {
        // Overlap decides it: an arrow that leaves sideways only to double back
        // reads as a mistake, even when the vertical distance is larger.
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('b', 40, 3000)],
            edges: [edge('a', 'b')],
        });
        expect(sides(out, 'a-b')).toBe('bottom->top');
    });

    it('prefers the horizontal join for nodes sharing a row', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('b', 3000, 20)],
            edges: [edge('a', 'b')],
        });
        expect(sides(out, 'a-b')).toBe('right->left');
    });

    it('falls back to the larger delta for a diagonal neighbour', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('wide', 900, 150), node('tall', 250, 900)],
            edges: [edge('a', 'wide'), edge('a', 'tall')],
        });
        expect(sides(out, 'a-wide')).toBe('right->left');
        expect(sides(out, 'a-tall')).toBe('bottom->top');
    });

    it('forces the axis when the caller names one', () => {
        // A downward tree wants every arrow leaving the bottom, including the
        // one to a child sitting far off to the side.
        const data: CanvasData = {
            nodes: [node('parent', 1000, 0), node('child', 0, 200)],
            edges: [edge('parent', 'child')],
        };
        expect(sides(normalizeEdgeSides(data, 'auto'), 'parent-child')).toBe('left->right');
        expect(sides(normalizeEdgeSides(data, 'vertical'), 'parent-child')).toBe('bottom->top');
    });

    it('repairs any edge touching a moved node, and no others', () => {
        // `b-c` counts as touched: b moved, so that arrow's attachment is stale
        // too. Only `x-y`, with neither end selected, keeps what it had.
        const data: CanvasData = {
            nodes: [node('a', 0, 0), node('b', 0, 400), node('c', 0, 800), node('x', 9000, 0), node('y', 9000, 400)],
            edges: [
                edge('a', 'b', { fromSide: 'left', toSide: 'right' }),
                edge('b', 'c', { fromSide: 'left', toSide: 'right' }),
                edge('x', 'y', { fromSide: 'left', toSide: 'right' }),
            ],
        };
        const out = normalizeEdgeSides(data, 'auto', new Set(['a', 'b']));
        expect(sides(out, 'a-b')).toBe('bottom->top');
        expect(sides(out, 'b-c')).toBe('bottom->top');
        expect(sides(out, 'x-y')).toBe('left->right');
    });

    it('returns the same object when every arrow already fits', () => {
        const data: CanvasData = {
            nodes: [node('a', 0, 0), node('b', 0, 400)],
            edges: [edge('a', 'b', { fromSide: 'bottom', toSide: 'top' })],
        };
        expect(normalizeEdgeSides(data)).toBe(data);
    });

    it('ignores an edge whose endpoint is missing rather than throwing', () => {
        const data: CanvasData = { nodes: [node('a', 0, 0)], edges: [edge('a', 'ghost')] };
        expect(() => normalizeEdgeSides(data)).not.toThrow();
        expect(normalizeEdgeSides(data)).toBe(data);
    });

    it('keeps every other property of the edge', () => {
        const out = normalizeEdgeSides({
            nodes: [node('a', 0, 0), node('b', 0, 400)],
            edges: [edge('a', 'b', { label: 'leads to', color: '4', toEnd: 'arrow' })],
        });
        const e = out.edges[0];
        expect(e.label).toBe('leads to');
        expect(e.color).toBe('4');
        expect(e.toEnd).toBe('arrow');
    });
});

describe('layouts reattach their own arrows', () => {
    const built = (): CanvasData => ({
        nodes: ['root', 'a', 'b', 'c'].map((id) => node(id, 0, 0)),
        // Deliberately wrong to start with, as a hand-dragged canvas often is.
        edges: [
            edge('root', 'a', { fromSide: 'left', toSide: 'right' }),
            edge('root', 'b', { fromSide: 'left', toSide: 'right' }),
            edge('a', 'c', { fromSide: 'top', toSide: 'bottom' }),
        ],
    });

    it('a downward tree sends every arrow out of the bottom', () => {
        const out = layoutCanvas(built(), 'tree', { direction: 'down' });
        for (const e of out.edges) expect(`${e.fromSide}->${e.toSide}`).toBe('bottom->top');
    });

    it('a rightward tree sends every arrow out of the right', () => {
        const out = layoutCanvas(built(), 'tree', { direction: 'right' });
        for (const e of out.edges) expect(`${e.fromSide}->${e.toSide}`).toBe('right->left');
    });

    it('a grid lets the geometry decide', () => {
        const out = layoutCanvas(built(), 'grid');
        for (const e of out.edges) {
            expect(['bottom->top', 'top->bottom', 'left->right', 'right->left']).toContain(
                `${e.fromSide}->${e.toSide}`
            );
        }
    });

    it('does not restyle arrows away from the selection', () => {
        const data: CanvasData = {
            nodes: [node('a', 0, 0), node('b', 0, 0), node('x', 5000, 0), node('y', 5000, 400)],
            edges: [edge('a', 'b'), edge('x', 'y', { fromSide: 'left', toSide: 'right' })],
        };
        const out = layoutCanvas(data, 'tree', { only: new Set(['a', 'b']) });
        expect(sides(out, 'x-y')).toBe('left->right');
    });
});
