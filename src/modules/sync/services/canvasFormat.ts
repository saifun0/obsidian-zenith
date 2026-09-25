/**
 * The `.canvas` file format — as much of it as a merge needs.
 *
 * Obsidian ships no public Canvas API — `obsidian.d.ts` does not mention canvas
 * once — so everything a plugin can rely on lives here, in the JSON on disk.
 * That file format IS documented and stable, which is why `canvasMerge` is
 * built on it: a merge expressed as a file transform keeps working across
 * Obsidian releases, while anything reaching into the live view does not.
 *
 * Reference: https://jsoncanvas.org — the spec Obsidian implements.
 */

/** Obsidian's six palette slots. Any other string is a raw hex colour. */
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | (string & {});

export interface CanvasNodeBase {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: CanvasColor;
}

export interface CanvasTextNode extends CanvasNodeBase {
    type: 'text';
    text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
    type: 'file';
    /** Vault-relative path, e.g. `10 Inbox/testing.md`. */
    file: string;
    /** Heading or block reference within the file, including the leading `#`. */
    subpath?: string;
}

export interface CanvasLinkNode extends CanvasNodeBase {
    type: 'link';
    url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
    type: 'group';
    label?: string;
    background?: string;
    backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEnd = 'none' | 'arrow';

export interface CanvasEdge {
    id: string;
    fromNode: string;
    fromSide?: CanvasSide;
    fromEnd?: CanvasEnd;
    toNode: string;
    toSide?: CanvasSide;
    toEnd?: CanvasEnd;
    color?: CanvasColor;
    label?: string;
}

/**
 * A node or edge the parser could not validate, kept exactly as it was read
 * together with where it sat in the file.
 *
 * `at` is the slot it must land on again when the canvas is written. Obsidian
 * draws nodes in file order, so appending these to the end instead would
 * quietly bring a background group to the front.
 */
export interface PreservedEntry {
    at: number;
    value: unknown;
}

export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    /**
     * Everything `parseCanvas` did not recognise, carried through untouched.
     *
     * A merged canvas is written wholesale, so anything the parser drops is
     * deleted from the user's file. Unknown node types are the ordinary case —
     * a newer Obsidian, or another plugin's own node — and none of that is ours
     * to discard just because we cannot match it up.
     */
    preserved?: { nodes: PreservedEntry[]; edges: PreservedEntry[] };
}

class CanvasParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CanvasParseError';
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parse a `.canvas` file.
 *
 * Unknown keys on a node or edge are preserved rather than dropped: other
 * plugins store their own data alongside Obsidian's, and rewriting a canvas
 * must not quietly delete it. Nodes that are structurally broken are skipped
 * instead of throwing, so one bad entry cannot make a whole canvas unusable.
 */
export function parseCanvas(raw: string): CanvasData {
    const trimmed = raw.trim();
    // Obsidian creates canvases as a zero-byte file before writing anything.
    if (!trimmed) return { nodes: [], edges: [] };

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        throw new CanvasParseError(`not valid JSON: ${(e as Error).message}`);
    }
    if (!isRecord(parsed)) throw new CanvasParseError('expected a JSON object at the top level');

    const rawNodes: unknown[] = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];

    const nodes: CanvasNode[] = [];
    const heldNodes: PreservedEntry[] = [];
    rawNodes.forEach((candidate, at) => {
        if (isKnownNode(candidate)) nodes.push(candidate);
        else heldNodes.push({ at, value: candidate });
    });

    // Two sets, because they answer different questions. `known` is what the
    // merge is allowed to touch; `present` is everything that will still be in
    // the file afterwards, including what we are only passing through — an edge
    // may legitimately point at a node we do not understand.
    const known = new Set(nodes.map((n) => n.id));
    const present = new Set(known);
    for (const held of heldNodes) {
        const id = isRecord(held.value) ? held.value.id : undefined;
        if (typeof id === 'string') present.add(id);
    }

    const edges: CanvasEdge[] = [];
    const heldEdges: PreservedEntry[] = [];
    // Counts only the edges that survive, so the recorded slot is the one the
    // edge must occupy in the file we write, not the one it had on the way in.
    let slot = 0;
    for (const candidate of rawEdges) {
        if (!isRecord(candidate)) continue;
        const { id, fromNode, toNode } = candidate;
        if (typeof id !== 'string') continue;
        if (typeof fromNode !== 'string' || typeof toNode !== 'string') continue;
        // An edge pointing at a node that is in no part of the file makes
        // Obsidian drop the whole canvas, so a truly dangling one is still cut.
        if (!present.has(fromNode) || !present.has(toNode)) continue;
        if (known.has(fromNode) && known.has(toNode)) {
            edges.push(candidate as unknown as CanvasEdge);
            slot++;
        } else {
            heldEdges.push({ at: slot++, value: candidate });
        }
    }

    if (!heldNodes.length && !heldEdges.length) return { nodes, edges };
    return { nodes, edges, preserved: { nodes: heldNodes, edges: heldEdges } };
}

/** Everything the merge knows how to match up and write back. */
function isKnownNode(candidate: unknown): candidate is CanvasNode {
    if (!isRecord(candidate)) return false;
    const { id, type, x, y, width, height } = candidate;
    if (typeof id !== 'string' || typeof type !== 'string') return false;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return false;
    if (!isFiniteNumber(width) || !isFiniteNumber(height)) return false;
    return type === 'text' || type === 'file' || type === 'link' || type === 'group';
}

/** Put the untouched entries back into the slots they came from. */
function reinsert(kept: readonly unknown[], held: readonly PreservedEntry[]): unknown[] {
    if (!held.length) return kept as unknown[];
    const bySlot = new Map(held.map((h) => [h.at, h.value]));
    const out: unknown[] = [];
    let next = 0;
    for (let i = 0; i < kept.length + held.length; i++) {
        if (bySlot.has(i)) out.push(bySlot.get(i));
        else out.push(kept[next++]);
    }
    return out;
}

/**
 * Serialise back to disk. Tab-indented to match what Obsidian writes, so a
 * canvas Zenith merged does not show up as a whole-file diff in git.
 */
export function serializeCanvas(data: CanvasData): string {
    return JSON.stringify(
        {
            nodes: reinsert(data.nodes, data.preserved?.nodes ?? []),
            edges: reinsert(data.edges, data.preserved?.edges ?? []),
        },
        null,
        '\t'
    );
}
