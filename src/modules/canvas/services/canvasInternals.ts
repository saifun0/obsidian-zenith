import type { WorkspaceLeaf } from 'obsidian';

/**
 * A narrow, checked view of Obsidian's private canvas object.
 *
 * Obsidian publishes no Canvas API, so everything here is reverse-engineered —
 * the shape was captured from a running canvas by the module's probe command
 * rather than remembered, and it can change in any release. The point of this
 * file is that it is the ONLY place that knows those names: features ask the
 * bridge, the bridge asks the object, and when a method disappears the answer
 * is `false` instead of a crash somewhere in the UI.
 *
 * Every method therefore reports whether it worked, and no caller may treat a
 * bridge as guaranteed. The file-level features stay authoritative.
 */

/** A node as the live canvas holds it — geometry plus whatever it displays. */
export interface LiveNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    text?: string;
    file?: { path: string; basename: string };
    label?: string;
    unknownData?: { type?: string };
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Viewport {
    /** Pan offset, in screen units. */
    tx: number;
    ty: number;
    /** Zoom factor: 1 is actual size. */
    scale: number;
}

type Fn = (...args: unknown[]) => unknown;

interface RawCanvas {
    nodes?: Map<string, LiveNode>;
    edges?: Map<string, { id: string; from?: { node?: LiveNode }; to?: { node?: LiveNode } }>;
    selection?: Set<LiveNode>;
    tx?: number;
    ty?: number;
    scale?: number;
    readonly?: boolean;
    [key: string]: unknown;
}

/** What a node shows in a list: its own text, its file name, or a group label. */
export function nodeLabel(node: LiveNode): string {
    const text = node.text?.trim();
    if (text) return text.split(/\r?\n/)[0].replace(/^#+\s*/, '');
    if (node.file) return node.file.basename ?? node.file.path;
    const label = node.label?.trim();
    if (label) return label;
    return '(untitled)';
}

export class CanvasBridge {
    private constructor(private readonly canvas: RawCanvas) {}

    /**
     * Wrap a leaf's canvas, or return null when there is nothing to wrap —
     * a non-canvas leaf, or a future Obsidian that keeps its state elsewhere.
     */
    static from(leaf: WorkspaceLeaf | null | undefined): CanvasBridge | null {
        const canvas = (leaf?.view as unknown as { canvas?: RawCanvas })?.canvas;
        if (!canvas || typeof canvas !== 'object') return null;
        // `nodes` is the one field every feature needs; without it the rest is
        // not worth probing.
        if (!(canvas.nodes instanceof Map)) return null;
        return new CanvasBridge(canvas);
    }

    private fn(name: string): Fn | null {
        const value = this.canvas[name];
        return typeof value === 'function' ? (value as Fn) : null;
    }

    private call(name: string, ...args: unknown[]): boolean {
        const fn = this.fn(name);
        if (!fn) return false;
        try {
            fn.apply(this.canvas, args);
            return true;
        } catch {
            // A private method that exists but rejects our arguments must not
            // take the command down with it.
            return false;
        }
    }

    get isReadonly(): boolean {
        return this.canvas.readonly === true;
    }

    nodes(): LiveNode[] {
        return [...(this.canvas.nodes?.values() ?? [])];
    }

    nodeById(id: string): LiveNode | null {
        return this.canvas.nodes?.get(id) ?? null;
    }

    viewport(): Viewport | null {
        const { tx, ty, scale } = this.canvas;
        if (typeof tx !== 'number' || typeof ty !== 'number' || typeof scale !== 'number') return null;
        return { tx, ty, scale };
    }

    selection(): LiveNode[] {
        return [...(this.canvas.selection?.values() ?? [])];
    }

    /** Edges as plain id pairs, for walking the graph without touching internals. */
    edgePairs(): Array<{ from: string; to: string }> {
        const pairs: Array<{ from: string; to: string }> = [];
        for (const edge of this.canvas.edges?.values() ?? []) {
            const from = edge.from?.node?.id;
            const to = edge.to?.node?.id;
            if (from && to) pairs.push({ from, to });
        }
        return pairs;
    }

    selectOnly(node: LiveNode): boolean {
        // `selectOnly` is the single-step version; falling back to clearing and
        // selecting covers a build that only has the primitives.
        if (this.call('selectOnly', node)) return true;
        this.call('deselectAll');
        return this.call('select', node);
    }

    deselectAll(): boolean {
        return this.call('deselectAll');
    }

    /**
     * Bring a node into view. Zooming to its box frames it properly; panning is
     * the fallback, and merely scrolling it into view is better than nothing.
     */
    revealNode(node: LiveNode): boolean {
        if (node.bbox && this.call('zoomToBbox', node.bbox)) return true;
        if (this.call('panTo', node.x + node.width / 2, node.y + node.height / 2)) return true;
        return this.call('panIntoView', node);
    }

    zoomToFit(): boolean {
        return this.call('zoomToFit');
    }

    zoomToSelection(): boolean {
        return this.call('zoomToSelection');
    }

    setViewport(tx: number, ty: number, scale: number): boolean {
        return this.call('setViewport', tx, ty, scale);
    }

    /** Ask the view to redraw after something was changed underneath it. */
    requestSave(): boolean {
        return this.call('requestSave');
    }
}
