import { describe, it, expect } from 'vitest';
import { mergeCanvas } from '../src/modules/sync/services/canvasMerge';
import { parseCanvas, serializeCanvas } from '../src/modules/canvas/canvasTypes';
import type { CanvasData, CanvasNode } from '../src/modules/canvas/canvasTypes';

const node = (id: string, x = 0, y = 0, text = id): CanvasNode =>
    ({ id, type: 'text', x, y, width: 200, height: 100, text }) as CanvasNode;

const doc = (nodes: CanvasNode[], edges: CanvasData['edges'] = []) =>
    serializeCanvas({ nodes, edges });

const local = { prefer: 'local' as const };
const remote = { prefer: 'remote' as const };

/** The merged canvas, or a failure if the merge refused. */
function merged(outcome: ReturnType<typeof mergeCanvas>): CanvasData {
    if (outcome.kind !== 'merged') throw new Error(`expected a merge, got ${outcome.kind}`);
    return parseCanvas(outcome.text);
}

const ids = (data: CanvasData) => data.nodes.map((n) => n.id);

describe('mergeCanvas', () => {
    it('reports identical canvases as identical', () => {
        const same = doc([node('a')]);
        expect(mergeCanvas(same, same, local).kind).toBe('identical');
    });

    it('sees past cosmetic formatting differences', () => {
        const compact = JSON.stringify({ nodes: [node('a')], edges: [] });
        const pretty = doc([node('a')]);
        expect(mergeCanvas(compact, pretty, local).kind).toBe('identical');
    });

    it('keeps a card added on each side — the case a line merge cannot handle', () => {
        const out = merged(mergeCanvas(doc([node('shared'), node('mine')]), doc([node('shared'), node('theirs')]), local));
        expect(ids(out).sort()).toEqual(['mine', 'shared', 'theirs']);
    });

    it('passes untouched cards through and resolves only the one that differs', () => {
        const out = merged(
            mergeCanvas(doc([node('same', 10, 0), node('moved', 500, 0)]), doc([node('same', 10, 0), node('moved', 900, 0)]), local)
        );
        expect(out.nodes.find((n) => n.id === 'same')!.x).toBe(10);
        expect(out.nodes.find((n) => n.id === 'moved')!.x).toBe(500);
    });

    it('cannot keep both moves when each side moved a different card', () => {
        // Documenting a real limit, not an aspiration. With no record of the
        // last agreed version, "I moved a" and "you moved b" is indistinguishable
        // from "we both rewrote a and b", so `prefer` takes every differing node.
        const out = merged(
            mergeCanvas(doc([node('a', 500, 0), node('b', 0, 0)]), doc([node('a', 0, 0), node('b', 900, 0)]), local)
        );
        expect(out.nodes.find((n) => n.id === 'a')!.x).toBe(500);
        expect(out.nodes.find((n) => n.id === 'b')!.x).toBe(0);
    });

    it('falls back to the preferred side when both moved the same card', () => {
        const mine = doc([node('a', 100, 0)]);
        const theirs = doc([node('a', 700, 0)]);
        expect(merged(mergeCanvas(mine, theirs, local)).nodes[0].x).toBe(100);
        expect(merged(mergeCanvas(mine, theirs, remote)).nodes[0].x).toBe(700);
    });

    it('records a note naming the card that clashed', () => {
        const outcome = mergeCanvas(doc([node('a', 0, 0, 'Ideas')]), doc([node('a', 900, 0, 'Ideas')]), local);
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(outcome.notes).toHaveLength(1);
        expect(outcome.notes[0]).toMatchObject({ kind: 'node', key: 'a', detail: 'Ideas' });
    });

    it('keeps a card the other side no longer has', () => {
        // Without a common ancestor this is either "added here" or "deleted
        // there". Keeping it is recoverable; dropping it is not.
        const out = merged(mergeCanvas(doc([node('a'), node('b')]), doc([node('a')]), local));
        expect(ids(out).sort()).toEqual(['a', 'b']);
    });

    it('preserves local order, which Obsidian reads as z-order', () => {
        const out = merged(
            mergeCanvas(doc([node('back'), node('front')]), doc([node('front'), node('back')]), local)
        );
        expect(ids(out)).toEqual(['back', 'front']);
    });

    it('unions edges from both sides', () => {
        const out = merged(
            mergeCanvas(
                doc([node('a'), node('b'), node('c')], [{ id: 'e1', fromNode: 'a', toNode: 'b' }]),
                doc([node('a'), node('b'), node('c')], [{ id: 'e2', fromNode: 'b', toNode: 'c' }]),
                local
            )
        );
        expect(out.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('never emits an edge whose endpoint is missing', () => {
        // Obsidian rejects the whole file over one dangling edge, so a merge
        // that produced one would corrupt the canvas it was meant to save.
        // The guard lives in the parser; this checks the guarantee holds all
        // the way through a merge, wherever it is enforced.
        const outcome = mergeCanvas(
            doc([node('a'), node('b')], [{ id: 'e', fromNode: 'a', toNode: 'gone' }]),
            doc([node('a'), node('b'), node('c')], [{ id: 'e2', fromNode: 'a', toNode: 'b' }]),
            local
        );
        if (outcome.kind !== 'merged') throw new Error(`expected a merge, got ${outcome.kind}`);
        const out = parseCanvas(outcome.text);
        const known = new Set(out.nodes.map((n) => n.id));
        for (const e of out.edges) {
            expect(known.has(e.fromNode) && known.has(e.toNode)).toBe(true);
        }
        expect(out.edges.map((e) => e.id)).toEqual(['e2']);
    });

    it('refuses when one side will not parse, rather than guessing', () => {
        const outcome = mergeCanvas(doc([node('a')]), '{ not json', local);
        expect(outcome).toEqual({ kind: 'unmergeable', reason: 'not_canvas' });
    });

    it('treats an empty file as an empty canvas rather than a failure', () => {
        // Obsidian creates a canvas as a zero-byte file before writing to it.
        const out = mergeCanvas('', doc([node('a')]), local);
        expect(out.kind).toBe('merged');
        expect(merged(out).nodes.map((n) => n.id)).toEqual(['a']);
    });

    it('produces a canvas Obsidian can reopen', () => {
        const outcome = mergeCanvas(
            doc([node('a'), node('b')], [{ id: 'e', fromNode: 'a', toNode: 'b' }]),
            doc([node('a'), node('c')]),
            local
        );
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(() => JSON.parse(outcome.text)).not.toThrow();
        const reparsed = parseCanvas(outcome.text);
        expect(reparsed.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
        expect(reparsed.edges).toHaveLength(1);
    });

    it('is stable: merging the result again changes nothing', () => {
        const outcome = mergeCanvas(doc([node('a'), node('b')]), doc([node('a'), node('c')]), local);
        if (outcome.kind !== 'merged') throw new Error('expected a merge');
        expect(mergeCanvas(outcome.text, outcome.text, local).kind).toBe('identical');
    });

    it('gives the same set of cards whichever side is called local', () => {
        const mine = doc([node('a'), node('b')]);
        const theirs = doc([node('a'), node('c')]);
        const forward = merged(mergeCanvas(mine, theirs, local));
        const backward = merged(mergeCanvas(theirs, mine, remote));
        expect(ids(forward).sort()).toEqual(ids(backward).sort());
    });
});
