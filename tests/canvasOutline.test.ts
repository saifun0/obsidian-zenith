import { describe, it, expect } from 'vitest';
import {
    canvasToOutline,
    outlineToCanvas,
    parseHeadings,
    type OutlineHeading,
} from '../src/modules/canvas/services/outline';
import type { CanvasData, CanvasNode } from '../src/modules/canvas/canvasTypes';

const h = (level: number, text: string): OutlineHeading => ({ level, text });

/** `parent -> child` pairs, by node text, so assertions read like the outline. */
function links(data: CanvasData): string[] {
    const text = (id: string) => {
        const n = data.nodes.find((x) => x.id === id);
        return n && n.type === 'text' ? n.text : id;
    };
    return data.edges.map((e) => `${text(e.fromNode)} -> ${text(e.toNode)}`);
}

const roots = (data: CanvasData) => {
    const attached = new Set(data.edges.map((e) => e.toNode));
    return data.nodes.filter((n) => !attached.has(n.id)).map((n) => (n as { text: string }).text);
};

describe('outlineToCanvas', () => {
    it('nests each heading under the nearest shallower one', () => {
        const out = outlineToCanvas([h(1, 'Top'), h(2, 'One'), h(2, 'Two'), h(1, 'Next')]);
        expect(roots(out)).toEqual(['Top', 'Next']);
        expect(links(out)).toEqual(['Top -> One', 'Top -> Two']);
    });

    it('goes back up several levels at once', () => {
        const out = outlineToCanvas([h(1, 'A'), h(2, 'B'), h(3, 'C'), h(1, 'D')]);
        expect(links(out)).toEqual(['A -> B', 'B -> C']);
        expect(roots(out)).toEqual(['A', 'D']);
    });

    it('still nests across a skipped level', () => {
        // `#` straight to `###` is common in real notes and must not orphan.
        const out = outlineToCanvas([h(1, 'A'), h(3, 'deep')]);
        expect(links(out)).toEqual(['A -> deep']);
    });

    it('treats a note that starts at ## as starting at its own top level', () => {
        const out = outlineToCanvas([h(2, 'First'), h(3, 'Under'), h(2, 'Second')]);
        expect(roots(out)).toEqual(['First', 'Second']);
        expect(links(out)).toEqual(['First -> Under']);
    });

    it('connects bottom to top, so the tree layout draws downward', () => {
        const out = outlineToCanvas([h(1, 'A'), h(2, 'B')]);
        expect(out.edges[0].fromSide).toBe('bottom');
        expect(out.edges[0].toSide).toBe('top');
    });

    it('skips blank headings rather than making empty nodes', () => {
        const out = outlineToCanvas([h(1, 'Real'), h(2, '   ')]);
        expect(out.nodes).toHaveLength(1);
        expect(out.edges).toHaveLength(0);
    });

    it('gives every node and edge a distinct id', () => {
        const out = outlineToCanvas([h(1, 'A'), h(2, 'B'), h(2, 'C')]);
        const ids = [...out.nodes.map((n) => n.id), ...out.edges.map((e) => e.id)];
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('produces nothing from nothing', () => {
        expect(outlineToCanvas([])).toEqual({ nodes: [], edges: [] });
    });
});

describe('parseHeadings', () => {
    it('reads level and text', () => {
        expect(parseHeadings('# One\n\ntext\n\n### Three')).toEqual([
            { level: 1, text: 'One' },
            { level: 3, text: 'Three' },
        ]);
    });

    it('ignores hashes inside a fenced code block', () => {
        const md = ['# Real', '', '```bash', '# not a heading', '```', '', '## Also real'].join('\n');
        expect(parseHeadings(md).map((x) => x.text)).toEqual(['Real', 'Also real']);
    });

    it('handles tilde fences too', () => {
        const md = ['~~~', '# hidden', '~~~', '# shown'].join('\n');
        expect(parseHeadings(md).map((x) => x.text)).toEqual(['shown']);
    });

    it('strips closing hashes', () => {
        expect(parseHeadings('## Middle ##')).toEqual([{ level: 2, text: 'Middle' }]);
    });

    it('does not treat a bare # or #tag as a heading', () => {
        expect(parseHeadings('#\n#tag\n#### Fine')).toEqual([{ level: 4, text: 'Fine' }]);
    });
});

describe('canvasToOutline', () => {
    const node = (id: string, text: string, y: number): CanvasNode =>
        ({ id, type: 'text', x: 0, y, width: 200, height: 60, text }) as CanvasNode;
    const edge = (from: string, to: string) => ({ id: `${from}${to}`, fromNode: from, toNode: to });

    it('turns depth into heading level', () => {
        const out = canvasToOutline({
            nodes: [node('a', 'Root', 0), node('b', 'Child', 100), node('c', 'Grandchild', 200)],
            edges: [edge('a', 'b'), edge('b', 'c')],
        });
        expect(out).toContain('# Root');
        expect(out).toContain('## Child');
        expect(out).toContain('### Grandchild');
    });

    it('follows the canvas top to bottom', () => {
        const out = canvasToOutline({
            nodes: [node('b', 'Second', 100), node('a', 'First', 0)],
            edges: [],
        });
        expect(out.indexOf('First')).toBeLessThan(out.indexOf('Second'));
    });

    it('keeps a node no root can reach instead of dropping it', () => {
        // Two nodes pointing at each other are reachable from neither.
        const out = canvasToOutline({
            nodes: [node('a', 'Alpha', 0), node('b', 'Beta', 100)],
            edges: [edge('a', 'b'), edge('b', 'a')],
        });
        expect(out).toContain('Alpha');
        expect(out).toContain('Beta');
    });

    it('titles a multi-line node with its first line and keeps the rest as body', () => {
        const out = canvasToOutline({
            nodes: [node('a', 'Title\nbody line', 0)],
            edges: [],
        });
        expect(out).toContain('# Title');
        expect(out).toContain('body line');
        expect(out).not.toContain('# Title\nbody');
    });

    it('renders file, link and group nodes readably', () => {
        const out = canvasToOutline({
            nodes: [
                { id: 'f', type: 'file', x: 0, y: 0, width: 1, height: 1, file: 'Notes/Idea.md' },
                { id: 'l', type: 'link', x: 0, y: 10, width: 1, height: 1, url: 'https://example.com' },
                { id: 'g', type: 'group', x: 0, y: 20, width: 1, height: 1, label: 'Phase one' },
            ] as CanvasNode[],
            edges: [],
        });
        expect(out).toContain('[[Notes/Idea]]');
        expect(out).toContain('https://example.com');
        expect(out).toContain('Phase one');
    });

    it('never emits more than six hashes', () => {
        const chain = Array.from({ length: 9 }, (_, i) => node(`n${i}`, `L${i}`, i * 10));
        const edges = chain.slice(1).map((n, i) => edge(chain[i].id, n.id));
        const out = canvasToOutline({ nodes: chain, edges });
        expect(out).not.toMatch(/^#{7,}/m);
        expect(out).toContain('###### L6');
    });

    it('ends with exactly one trailing newline', () => {
        const out = canvasToOutline({ nodes: [node('a', 'Only', 0)], edges: [] });
        expect(out.endsWith('\n')).toBe(true);
        expect(out.endsWith('\n\n')).toBe(false);
    });
});

describe('note → canvas → note', () => {
    it('preserves the heading structure through a round trip', () => {
        const source = ['# Plan', '## Research', '### Sources', '## Build', '# Later'].join('\n');
        const outline = canvasToOutline(outlineToCanvas(parseHeadings(source)));
        expect(parseHeadings(outline)).toEqual(parseHeadings(source));
    });

    it('survives a note whose headings start below level one', () => {
        const source = ['## A', '### A1', '## B'].join('\n');
        // Levels are rebased to the canvas depth, so compare shape, not depth.
        const shape = parseHeadings(canvasToOutline(outlineToCanvas(parseHeadings(source))));
        expect(shape).toEqual([
            { level: 1, text: 'A' },
            { level: 2, text: 'A1' },
            { level: 1, text: 'B' },
        ]);
    });
});
