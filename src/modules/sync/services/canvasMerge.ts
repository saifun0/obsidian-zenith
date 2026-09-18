import { parseCanvas, serializeCanvas } from './canvasFormat';
import type { CanvasData, CanvasEdge, CanvasNode } from './canvasFormat';
import type { MergeNote, MergeOptions, MergeOutcome } from './conflictResolve';

/**
 * Reconcile two versions of a `.canvas` file by structure rather than by line.
 *
 * A canvas is JSON, and `mergeMarkdown` sees JSON as prose: the moment both
 * devices touch a canvas its lines differ on both sides, the merger correctly
 * refuses, and the user gets two files to reconcile by hand. That is safe but
 * far too blunt, because the common case is not a conflict at all — two devices
 * that moved different cards have made two independent edits to one document.
 *
 * Nodes and edges carry stable ids, which is what makes a real merge possible:
 * work can be matched up instead of guessed at from position in the file.
 *
 * WHAT THIS CANNOT DO. The engine keeps no copy of the last agreed version —
 * `PrevSide` records size, mtime and etag, nothing else — so this is a two-way
 * merge with no common ancestor, and two facts follow from that.
 *
 * A node on one side only is ambiguous: added here, or deleted there. It is
 * kept. Restoring a card someone deleted is visible and one keystroke to undo;
 * dropping a card someone drew is invisible and permanent.
 *
 * A node that differs on both sides cannot be told apart from a node only one
 * side touched, so `prefer` picks a winner and the other side's version of that
 * node is lost. Two devices that each moved a different card will therefore
 * keep one set of positions rather than both. That is the same bargain
 * `mergeMarkdown` already strikes on frontmatter scalars, and it buys the thing
 * a line merge cannot do at all: cards and arrows added on either side all
 * survive, instead of the whole file being refused.
 */

type Side = 'local' | 'remote';

function sameShape(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** Merge one id-keyed collection, preferring `opts.prefer` on a real clash. */
function mergeById<T extends { id: string }>(
    local: readonly T[],
    remote: readonly T[],
    prefer: Side,
    onClash: (item: T) => void
): T[] {
    const remoteById = new Map(remote.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const merged: T[] = [];

    // Local order first: node order is Obsidian's z-order, and the side the
    // user is looking at should keep its stacking.
    for (const mine of local) {
        seen.add(mine.id);
        const theirs = remoteById.get(mine.id);
        if (!theirs || sameShape(mine, theirs)) {
            merged.push(mine);
            continue;
        }
        onClash(mine);
        merged.push(prefer === 'local' ? mine : theirs);
    }

    for (const theirs of remote) {
        if (!seen.has(theirs.id)) merged.push(theirs);
    }

    return merged;
}

function describeNode(node: CanvasNode): string {
    if (node.type === 'text') return node.text.trim().split(/\r?\n/)[0].slice(0, 60) || 'card';
    if (node.type === 'file') return node.file;
    if (node.type === 'link') return node.url;
    return node.label?.trim() || 'group';
}

export function mergeCanvas(local: string, remote: string, opts: MergeOptions): MergeOutcome {
    let mine: CanvasData;
    let theirs: CanvasData;
    try {
        mine = parseCanvas(local);
        theirs = parseCanvas(remote);
    } catch {
        // Corrupt on one side: keeping both copies is the only honest answer.
        return { kind: 'unmergeable', reason: 'not_canvas' };
    }

    if (serializeCanvas(mine) === serializeCanvas(theirs)) return { kind: 'identical' };

    const notes: MergeNote[] = [];
    const nodes = mergeById<CanvasNode>(mine.nodes, theirs.nodes, opts.prefer, (node) =>
        notes.push({ kind: 'node', key: node.id, detail: describeNode(node) })
    );

    // No dangling-edge filter is needed here, and adding one would be dead
    // code: `parseCanvas` drops edges with a missing endpoint on the way in,
    // and nodes are only ever unioned, so every endpoint that arrived survives.
    // Obsidian rejects a whole canvas over one dangling edge, so the guarantee
    // matters — it just belongs in the parser, where it already is.
    const edges = mergeById<CanvasEdge>(mine.edges, theirs.edges, opts.prefer, (edge) =>
        notes.push({ kind: 'edge', key: edge.id, detail: edge.label?.trim() || 'arrow' })
    );

    // Deliberately not short-circuiting when the result equals the local side:
    // `identical` means the two inputs agreed, and reporting it because the
    // merge happened to resolve local's way would tell the engine a different
    // thing than what occurred.
    return { kind: 'merged', text: serializeCanvas({ nodes, edges }), notes };
}
