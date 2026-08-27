/**
 * The `.canvas` file format.
 *
 * Obsidian ships no public Canvas API — `obsidian.d.ts` does not mention canvas
 * once — so everything a plugin can rely on lives here, in the JSON on disk.
 * That file format IS documented and stable, which is why the module is built
 * on it: features expressed as file transforms keep working across Obsidian
 * releases, while anything reaching into the live view does not.
 *
 * Reference: https://jsoncanvas.org — the spec Obsidian implements.
 */

export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';

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
 * A node or edge this module could not validate, kept exactly as it was read
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
     * A canvas is rewritten wholesale, so anything the parser drops is deleted
     * from the user's file the moment any command runs. Unknown node types are
     * the ordinary case — a newer Obsidian, or another plugin's own node — and
     * none of that is ours to discard just because we cannot lay it out.
     */
    preserved?: { nodes: PreservedEntry[]; edges: PreservedEntry[] };
}

export const EMPTY_CANVAS: CanvasData = { nodes: [], edges: [] };

/** Obsidian's own defaults for a new card, matched so generated canvases feel native. */
export const DEFAULT_NODE_WIDTH = 400;
export const DEFAULT_NODE_HEIGHT = 400;
export const DEFAULT_TEXT_HEIGHT = 60;

export function isGroupNode(node: CanvasNode): node is CanvasGroupNode {
    return node.type === 'group';
}

export function isTextNode(node: CanvasNode): node is CanvasTextNode {
    return node.type === 'text';
}

export function isFileNode(node: CanvasNode): node is CanvasFileNode {
    return node.type === 'file';
}

/**
 * Does `outer` fully hold `inner`?
 *
 * This is the entirety of group membership on a canvas: Obsidian stores no
 * member list, so a node belongs to a group when it sits inside the group's
 * rectangle and nowhere else. Every feature that moves or resizes anything has
 * to agree on this exact test, or one of them will resize a card out of a group
 * that another is still treating as a member.
 */
export function contains(outer: CanvasNodeBase, inner: CanvasNodeBase): boolean {
    return (
        inner.x >= outer.x &&
        inner.y >= outer.y &&
        inner.x + inner.width <= outer.x + outer.width &&
        inner.y + inner.height <= outer.y + outer.height
    );
}

/**
 * Obsidian's ids are 16 lowercase hex characters. Matching that shape matters:
 * ids appear in edge references, and a canvas whose ids look foreign is harder
 * to debug when hand-editing the JSON.
 */
export function createCanvasId(): string {
    let id = '';
    for (let i = 0; i < 16; i++) id += Math.floor(Math.random() * 16).toString(16);
    return id;
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

    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];

    const nodes: CanvasNode[] = [];
    const heldNodes: PreservedEntry[] = [];
    rawNodes.forEach((candidate, at) => {
        if (isKnownNode(candidate)) nodes.push(candidate as unknown as CanvasNode);
        else heldNodes.push({ at, value: candidate });
    });

    // Two sets, because they answer different questions. `known` is what the
    // transforms are allowed to touch; `present` is everything that will still
    // be in the file afterwards, including what we are only passing through —
    // an edge may legitimately point at a node we do not understand.
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

/** Everything the transforms know how to move, resize and re-attach. */
function isKnownNode(candidate: unknown): boolean {
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
 * canvas touched by this module does not show up as a whole-file diff in git.
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

/** Axis-aligned bounds of a set of nodes, or null when there are none. */
export function boundsOf(nodes: readonly CanvasNode[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
} | null {
    if (!nodes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
