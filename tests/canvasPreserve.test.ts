import { describe, it, expect } from 'vitest';
import { parseCanvas, serializeCanvas, type CanvasData } from '../src/modules/canvas/canvasTypes';
import { layoutCanvas } from '../src/modules/canvas/services/layout';
import { fitNodes } from '../src/modules/canvas/services/fit';
import { normalizeEdgeSides } from '../src/modules/canvas/services/edges';

const card = (id: string, x = 0, y = 0) => ({
    id,
    type: 'text',
    x,
    y,
    width: 200,
    height: 100,
    text: id,
});

const file = (nodes: unknown[], edges: unknown[] = []) => JSON.stringify({ nodes, edges });

/** What `updateCanvasFile` ends up putting back on disk. */
const rewrite = (raw: string, transform: (d: CanvasData) => CanvasData): unknown =>
    JSON.parse(serializeCanvas(transform(parseCanvas(raw))));

describe('nodes the parser cannot read survive a rewrite', () => {
    it('keeps a node whose type this version does not know', () => {
        const raw = file([
            card('a'),
            { id: 'x', type: 'mermaid', x: 0, y: 300, width: 200, height: 100, code: 'graph TD' },
            card('c', 400),
        ]);

        const out = rewrite(raw, (d) => layoutCanvas(d, 'grid')) as { nodes: Array<{ id: string }> };
        expect(out.nodes.map((n) => n.id)).toEqual(['a', 'x', 'c']);
        expect(out.nodes[1]).toEqual({
            id: 'x',
            type: 'mermaid',
            x: 0,
            y: 300,
            width: 200,
            height: 100,
            code: 'graph TD',
        });
    });

    it('keeps a node with unusable geometry, untouched', () => {
        const raw = file([card('a'), { id: 'broken', type: 'text', x: 0, y: 0, width: 200, text: 'hi' }]);
        const out = rewrite(raw, (d) => fitNodes(d)) as { nodes: Array<{ id: string }> };
        expect(out.nodes.map((n) => n.id)).toEqual(['a', 'broken']);
    });

    it('puts it back in its original slot, so z-ordering is unchanged', () => {
        // The unreadable node sits in the middle; appending it to the end would
        // lift it above everything Obsidian draws after it.
        const raw = file([card('a'), { id: 'x', type: 'mermaid' }, card('c', 400), card('d', 800)]);
        const out = rewrite(raw, (d) => layoutCanvas(d, 'grid')) as { nodes: Array<{ id: string }> };
        expect(out.nodes.map((n) => n.id)).toEqual(['a', 'x', 'c', 'd']);
    });

    it('keeps an edge that points at a node it could not read', () => {
        const raw = file(
            [card('a'), { id: 'x', type: 'mermaid', x: 0, y: 300, width: 200, height: 100 }],
            [{ id: 'e1', fromNode: 'a', toNode: 'x' }]
        );
        const out = rewrite(raw, (d) => normalizeEdgeSides(d)) as { edges: Array<{ id: string }> };
        expect(out.edges.map((e) => e.id)).toEqual(['e1']);
    });

    it('still drops an edge whose endpoint is nowhere in the file', () => {
        // Obsidian refuses to open a canvas carrying one of these, so passing it
        // through would be preserving the user's data by destroying their file.
        const raw = file([card('a'), card('b', 400)], [
            { id: 'good', fromNode: 'a', toNode: 'b' },
            { id: 'dangling', fromNode: 'a', toNode: 'ghost' },
        ]);
        const out = rewrite(raw, (d) => normalizeEdgeSides(d)) as { edges: Array<{ id: string }> };
        expect(out.edges.map((e) => e.id)).toEqual(['good']);
    });

    it('adds nothing to a canvas it understands completely', () => {
        const raw = file([card('a'), card('b', 400)], [{ id: 'e', fromNode: 'a', toNode: 'b' }]);
        const parsed = parseCanvas(raw);
        expect(parsed.preserved).toBeUndefined();
        expect(JSON.parse(serializeCanvas(parsed))).toEqual(JSON.parse(raw));
    });
});
