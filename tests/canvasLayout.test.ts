import { describe, it, expect } from 'vitest';
import { layoutCanvas } from '../src/modules/canvas/services/layout';
import {
    boundsOf,
    parseCanvas,
    serializeCanvas,
    type CanvasData,
    type CanvasEdge,
    type CanvasNode,
} from '../src/modules/canvas/canvasTypes';

const node = (
    id: string,
    x: number,
    y: number,
    width = 200,
    height = 100,
    type: CanvasNode['type'] = 'text'
): CanvasNode =>
    ({ id, type, x, y, width, height, ...(type === 'text' ? { text: id } : {}) }) as CanvasNode;

const group = (id: string, x: number, y: number, width: number, height: number): CanvasNode =>
    ({ id, type: 'group', x, y, width, height, label: id }) as CanvasNode;

const edge = (from: string, to: string): CanvasEdge => ({ id: `${from}-${to}`, fromNode: from, toNode: to });

const canvas = (nodes: CanvasNode[], edges: CanvasEdge[] = []): CanvasData => ({ nodes, edges });

/** Every pair of non-group nodes must be disjoint. */
function overlaps(data: CanvasData): Array<[string, string]> {
    const boxes = data.nodes.filter((n) => n.type !== 'group');
    const hits: Array<[string, string]> = [];
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            const apart =
                a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
            if (!apart) hits.push([a.id, b.id]);
        }
    }
    return hits;
}

const byId = (data: CanvasData, id: string) => data.nodes.find((n) => n.id === id)!;

describe('parseCanvas', () => {
    it('reads an empty canvas as Obsidian writes it', () => {
        expect(parseCanvas('{\n\t"nodes":[],\n\t"edges":[]\n}')).toEqual({ nodes: [], edges: [] });
    });

    it('treats a brand new zero-byte canvas as empty rather than throwing', () => {
        expect(parseCanvas('')).toEqual({ nodes: [], edges: [] });
        expect(parseCanvas('   \n ')).toEqual({ nodes: [], edges: [] });
    });

    it('rejects malformed JSON loudly', () => {
        expect(() => parseCanvas('{ nope')).toThrow(/not valid JSON/);
    });

    it('skips structurally broken nodes instead of losing the whole canvas', () => {
        const raw = JSON.stringify({
            nodes: [
                { id: 'good', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'hi' },
                { id: 'noSize', type: 'text', x: 0, y: 0 },
                { id: 'badType', type: 'sticker', x: 0, y: 0, width: 10, height: 10 },
                'not an object',
            ],
            edges: [],
        });
        expect(parseCanvas(raw).nodes.map((n) => n.id)).toEqual(['good']);
    });

    it('drops edges that point at a missing node', () => {
        const raw = JSON.stringify({
            nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'a' }],
            edges: [
                { id: 'e1', fromNode: 'a', toNode: 'ghost' },
                { id: 'e2', fromNode: 'a', toNode: 'a' },
            ],
        });
        expect(parseCanvas(raw).edges.map((e) => e.id)).toEqual(['e2']);
    });

    it('preserves keys written by other plugins through a round trip', () => {
        const raw = JSON.stringify({
            nodes: [
                {
                    id: 'a',
                    type: 'text',
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                    text: 'a',
                    styleAttributes: { shape: 'diamond' },
                },
            ],
            edges: [],
        });
        const again = parseCanvas(serializeCanvas(parseCanvas(raw)));
        expect((again.nodes[0] as unknown as Record<string, unknown>).styleAttributes).toEqual({
            shape: 'diamond',
        });
    });
});

describe('layoutCanvas', () => {
    it('leaves a canvas with fewer than two nodes untouched', () => {
        const one = canvas([node('a', 17, 42)]);
        expect(layoutCanvas(one, 'grid')).toBe(one);
    });

    it('does not mutate its input', () => {
        const input = canvas([node('a', 0, 0), node('b', 5, 5)]);
        const snapshot = JSON.stringify(input);
        layoutCanvas(input, 'grid');
        expect(JSON.stringify(input)).toEqual(snapshot);
    });

    for (const kind of ['grid', 'tree', 'radial'] as const) {
        it(`${kind}: separates overlapping nodes`, () => {
            const piled = canvas(
                ['a', 'b', 'c', 'd', 'e'].map((id) => node(id, 0, 0)),
                [edge('a', 'b'), edge('b', 'c'), edge('a', 'd')]
            );
            expect(overlaps(layoutCanvas(piled, kind))).toEqual([]);
        });

        it(`${kind}: keeps every node and edge`, () => {
            const input = canvas(
                ['a', 'b', 'c'].map((id, i) => node(id, i * 10, 0)),
                [edge('a', 'b')]
            );
            const out = layoutCanvas(input, kind);
            expect(out.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
            // Edges survive, but not untouched: a layout reattaches them to the
            // faces the new positions call for. Endpoints are what must hold.
            expect(out.edges).toHaveLength(1);
            expect(out.edges[0]).toMatchObject({ id: 'a-b', fromNode: 'a', toNode: 'b' });
        });

        it(`${kind}: preserves node order, which Obsidian uses for z-order`, () => {
            const input = canvas([node('back', 0, 0), node('mid', 1, 1), node('front', 2, 2)]);
            expect(layoutCanvas(input, kind).nodes.map((n) => n.id)).toEqual(['back', 'mid', 'front']);
        });
    }

    it('grid: uses a roughly square grid when no column count is given', () => {
        const out = layoutCanvas(
            canvas(['a', 'b', 'c', 'd'].map((id, i) => node(id, i, 0))),
            'grid'
        );
        // Four blocks over two columns means two distinct rows.
        expect(new Set(out.nodes.map((n) => n.y)).size).toBe(2);
        expect(new Set(out.nodes.map((n) => n.x)).size).toBe(2);
    });

    it('grid: sizes each column to its widest member so a large node does not overlap', () => {
        const out = layoutCanvas(
            canvas([node('wide', 0, 0, 600, 100), node('narrow', 10, 0, 100, 100)]),
            'grid',
            { columns: 2, gap: 50 }
        );
        expect(byId(out, 'narrow').x).toBe(byId(out, 'wide').x + 600 + 50);
    });

    it('tree: puts each generation on its own level', () => {
        const out = layoutCanvas(
            canvas(
                ['root', 'childA', 'childB', 'grandchild'].map((id) => node(id, 0, 0)),
                [edge('root', 'childA'), edge('root', 'childB'), edge('childA', 'grandchild')]
            ),
            'tree',
            { direction: 'right' }
        );
        const x = (id: string) => byId(out, id).x;
        expect(x('childA')).toBeGreaterThan(x('root'));
        expect(x('childA')).toEqual(x('childB'));
        expect(x('grandchild')).toBeGreaterThan(x('childA'));
    });

    it('tree: grows downward when asked', () => {
        const out = layoutCanvas(
            canvas(
                ['root', 'child'].map((id) => node(id, 0, 0)),
                [edge('root', 'child')]
            ),
            'tree',
            { direction: 'down' }
        );
        expect(byId(out, 'child').y).toBeGreaterThan(byId(out, 'root').y);
        expect(byId(out, 'child').x).toEqual(byId(out, 'root').x);
    });

    // The earlier version placed each level in reading order and centred every
    // node inside the slice it was allotted. That passes an overlap check while
    // still drawing a staircase of crossing edges, so these pin the two
    // properties that actually make a tree readable.
    const centreX = (data: CanvasData, id: string) => byId(data, id).x + byId(data, id).width / 2;

    it('tree: centres a parent between its outermost children', () => {
        const out = layoutCanvas(
            canvas(
                ['root', 'a', 'b', 'c'].map((id) => node(id, 0, 0)),
                [edge('root', 'a'), edge('root', 'b'), edge('root', 'c')]
            ),
            'tree',
            { direction: 'down' }
        );
        expect(centreX(out, 'root')).toBeCloseTo((centreX(out, 'a') + centreX(out, 'c')) / 2, 6);
        expect(centreX(out, 'root')).toBeCloseTo(centreX(out, 'b'), 6);
    });

    it('tree: stays centred when one branch is far bushier than the other', () => {
        // The exact shape that exposed the bug: centring on the allotted slice
        // instead of on the children drags the parent away from the wide branch.
        const out = layoutCanvas(
            canvas(
                ['root', 'thin', 'wide', 'w1', 'w2', 'w3'].map((id) => node(id, 0, 0)),
                [
                    edge('root', 'thin'),
                    edge('root', 'wide'),
                    edge('wide', 'w1'),
                    edge('wide', 'w2'),
                    edge('wide', 'w3'),
                ]
            ),
            'tree',
            { direction: 'down' }
        );
        expect(centreX(out, 'root')).toBeCloseTo((centreX(out, 'thin') + centreX(out, 'wide')) / 2, 6);
        expect(centreX(out, 'wide')).toBeCloseTo((centreX(out, 'w1') + centreX(out, 'w3')) / 2, 6);
        expect(centreX(out, 'wide')).toBeCloseTo(centreX(out, 'w2'), 6);
    });

    it('tree: keeps siblings together instead of interleaving other branches', () => {
        const out = layoutCanvas(
            canvas(
                ['root', 'left', 'right', 'l1', 'l2', 'r1', 'r2'].map((id) => node(id, 0, 0)),
                [
                    edge('root', 'left'),
                    edge('root', 'right'),
                    edge('left', 'l1'),
                    edge('left', 'l2'),
                    edge('right', 'r1'),
                    edge('right', 'r2'),
                ]
            ),
            'tree',
            { direction: 'down' }
        );
        const leaves = ['l1', 'l2', 'r1', 'r2']
            .map((id) => ({ id, x: centreX(out, id) }))
            .sort((a, b) => a.x - b.x)
            .map((n) => n.id[0]);
        // One family, then the other — never l, r, l, r.
        expect(leaves.join('')).toMatch(/^(llrr|rrll)$/);
    });

    it('tree: spaces levels evenly along the growth axis', () => {
        const out = layoutCanvas(
            canvas(
                ['a', 'b', 'c'].map((id) => node(id, 0, 0, 200, 100)),
                [edge('a', 'b'), edge('b', 'c')]
            ),
            'tree',
            { direction: 'down', gap: 40 }
        );
        expect(byId(out, 'b').y - byId(out, 'a').y).toBe(140);
        expect(byId(out, 'c').y - byId(out, 'b').y).toBe(140);
    });

    it('tree: gives a node reached by two parents a single home', () => {
        const out = layoutCanvas(
            canvas(
                ['a', 'b', 'shared'].map((id) => node(id, 0, 0)),
                [edge('a', 'shared'), edge('b', 'shared')]
            ),
            'tree'
        );
        expect(overlaps(out)).toEqual([]);
    });

    it('tree: terminates on a cycle rather than looping forever', () => {
        const out = layoutCanvas(
            canvas(
                ['a', 'b', 'c'].map((id) => node(id, 0, 0)),
                [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
            ),
            'tree'
        );
        expect(overlaps(out)).toEqual([]);
    });

    it('tree: places nodes that no edge reaches instead of stacking them at the origin', () => {
        const out = layoutCanvas(
            canvas(
                ['a', 'b', 'lonely'].map((id) => node(id, 0, 0)),
                [edge('a', 'b')]
            ),
            'tree'
        );
        expect(overlaps(out)).toEqual([]);
    });

    it('radial: puts a single root at the centre of the ring around it', () => {
        const out = layoutCanvas(
            canvas(
                ['root', 'a', 'b', 'c', 'd'].map((id) => node(id, 0, 0)),
                [edge('root', 'a'), edge('root', 'b'), edge('root', 'c'), edge('root', 'd')]
            ),
            'radial'
        );
        const root = byId(out, 'root');
        const rootCentre = { x: root.x + root.width / 2, y: root.y + root.height / 2 };
        const radii = ['a', 'b', 'c', 'd'].map((id) => {
            const n = byId(out, id);
            return Math.hypot(n.x + n.width / 2 - rootCentre.x, n.y + n.height / 2 - rootCentre.y);
        });
        // Every child sits on one ring, so the spread between radii is tiny.
        expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1);
    });
});

describe('layoutCanvas and groups', () => {
    // Group membership in Obsidian is purely geometric: a node belongs to a
    // group when it is inside its rectangle. A layout that moves nodes freely
    // therefore silently empties groups, which is the bug these guard.
    const grouped = () =>
        canvas([
            group('g', 0, 0, 500, 300),
            node('inside1', 20, 20, 100, 80),
            node('inside2', 20, 150, 100, 80),
            node('outside', 900, 0, 200, 100),
        ]);

    function stillInside(data: CanvasData, groupId: string, nodeId: string): boolean {
        const g = byId(data, groupId);
        const n = byId(data, nodeId);
        return n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height;
    }

    for (const kind of ['grid', 'tree', 'radial'] as const) {
        it(`${kind}: keeps grouped nodes inside their group`, () => {
            const out = layoutCanvas(grouped(), kind);
            expect(stillInside(out, 'g', 'inside1')).toBe(true);
            expect(stillInside(out, 'g', 'inside2')).toBe(true);
        });

        it(`${kind}: moves a group and its contents by the same offset`, () => {
            const before = grouped();
            const after = layoutCanvas(before, kind);
            const dx = byId(after, 'g').x - byId(before, 'g').x;
            const dy = byId(after, 'g').y - byId(before, 'g').y;
            for (const id of ['inside1', 'inside2']) {
                expect(byId(after, id).x - byId(before, id).x).toBe(dx);
                expect(byId(after, id).y - byId(before, id).y).toBe(dy);
            }
        });

        it(`${kind}: does not pull an outside node into the group`, () => {
            expect(stillInside(layoutCanvas(grouped(), kind), 'g', 'outside')).toBe(false);
        });
    }

    it('treats a group as one block, so the whole group is spaced from other nodes', () => {
        const out = layoutCanvas(grouped(), 'grid', { columns: 2, gap: 40 });
        const g = byId(out, 'g');
        const outside = byId(out, 'outside');
        const apart = outside.x >= g.x + g.width || g.x >= outside.x + outside.width;
        expect(apart).toBe(true);
    });

    it('keeps an inner group travelling with its outer one', () => {
        const nested = canvas([
            group('outer', 0, 0, 600, 400),
            group('inner', 50, 50, 200, 150),
            node('deep', 70, 70, 80, 60),
            node('far', 1000, 0, 100, 100),
        ]);
        const out = layoutCanvas(nested, 'grid');
        const dx = byId(out, 'outer').x - byId(nested, 'outer').x;
        expect(byId(out, 'inner').x - byId(nested, 'inner').x).toBe(dx);
        expect(byId(out, 'deep').x - byId(nested, 'deep').x).toBe(dx);
    });
});

describe('boundsOf', () => {
    it('returns null for nothing to measure', () => {
        expect(boundsOf([])).toBeNull();
    });

    it('spans every corner', () => {
        expect(boundsOf([node('a', -10, -20, 30, 40), node('b', 100, 5, 10, 10)])).toEqual({
            minX: -10,
            minY: -20,
            maxX: 110,
            maxY: 20,
            width: 120,
            height: 40,
        });
    });
});

describe('groups that share nodes', () => {
    /** Offsets from the first node, which a rigid block has to preserve exactly. */
    const shape = (data: CanvasData, ids: string[]): string => {
        const at = (id: string) => data.nodes.find((n) => n.id === id)!;
        const base = at(ids[0]);
        return ids.map((id) => `${at(id).x - base.x},${at(id).y - base.y}`).join(' ');
    };

    it('two overlapping groups move as one block', () => {
        // Neither group contains the other; they simply overlap, and one node
        // sits in the overlap. Claiming outermost-first used to give that node
        // to the larger group and move the smaller one out from under it.
        const tied = ['ga', 'gb', 'shared', 'onlyA', 'onlyB'];
        const before = canvas([
            group('ga', 0, 0, 300, 300),
            group('gb', 200, 200, 300, 300),
            node('shared', 210, 210, 50, 50),
            node('onlyA', 10, 10, 50, 50),
            node('onlyB', 400, 400, 50, 50),
            node('far', 2000, 0),
        ]);

        expect(shape(layoutCanvas(before, 'grid'), tied)).toBe(shape(before, tied));
    });

    it('nested groups still move as one block', () => {
        const tied = ['outer', 'inner', 'deep'];
        const before = canvas([
            group('outer', 0, 0, 400, 400),
            group('inner', 50, 50, 200, 200),
            node('deep', 60, 60, 50, 50),
            node('far', 2000, 0),
        ]);

        expect(shape(layoutCanvas(before, 'grid'), tied)).toBe(shape(before, tied));
    });
});
