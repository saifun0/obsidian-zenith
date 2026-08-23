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

export interface CanvasData {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
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
    for (const candidate of rawNodes) {
        if (!isRecord(candidate)) continue;
        const { id, type, x, y, width, height } = candidate;
        if (typeof id !== 'string' || typeof type !== 'string') continue;
        if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;
        if (!isFiniteNumber(width) || !isFiniteNumber(height)) continue;
        if (type !== 'text' && type !== 'file' && type !== 'link' && type !== 'group') continue;
        nodes.push(candidate as unknown as CanvasNode);
    }

    const known = new Set(nodes.map((n) => n.id));
    const edges: CanvasEdge[] = [];
    for (const candidate of rawEdges) {
        if (!isRecord(candidate)) continue;
        const { id, fromNode, toNode } = candidate;
        if (typeof id !== 'string') continue;
        if (typeof fromNode !== 'string' || typeof toNode !== 'string') continue;
        // An edge pointing at a deleted node makes Obsidian drop the whole file.
        if (!known.has(fromNode) || !known.has(toNode)) continue;
        edges.push(candidate as unknown as CanvasEdge);
    }

    return { nodes, edges };
}

/**
 * Serialise back to disk. Tab-indented to match what Obsidian writes, so a
 * canvas touched by this module does not show up as a whole-file diff in git.
 */
export function serializeCanvas(data: CanvasData): string {
    return JSON.stringify({ nodes: data.nodes, edges: data.edges }, null, '\t');
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
