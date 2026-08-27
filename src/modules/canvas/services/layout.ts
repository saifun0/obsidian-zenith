import {
    boundsOf,
    contains,
    isGroupNode,
    type CanvasData,
    type CanvasEdge,
    type CanvasNode,
} from '../canvasTypes';
import { normalizeEdgeSides, type SideMode } from './edges';

export type LayoutKind = 'grid' | 'tree' | 'radial';

export interface LayoutOptions {
    /** Space between blocks, in canvas units. */
    gap: number;
    /** `grid` only. 0 means "pick a roughly square grid". */
    columns: number;
    /** `tree` only — which way the tree grows. */
    direction: 'right' | 'down';
    /**
     * Restrict the rearrangement to these node ids; everything else stays put.
     *
     * Rearranging a large canvas wholesale is a frightening thing to invoke,
     * because there is no way to preview it and undo is one keystroke away from
     * losing the previous arrangement entirely. Tidying one branch is the
     * version people actually reach for.
     */
    only?: ReadonlySet<string>;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
    gap: 64,
    columns: 0,
    direction: 'down',
};

/** Top-left corner the arrangement starts from. */
interface Origin {
    minX: number;
    minY: number;
}

/**
 * A group plus everything inside it, moved as one rigid unit.
 *
 * Obsidian has no membership field: a node belongs to a group when it sits
 * inside the group's rectangle, and nowhere else. So any layout that moves
 * nodes independently silently rips groups apart — the nodes stay where the
 * algorithm put them and quietly stop being members. Treating each group and
 * its contents as a single indivisible block is what keeps that from happening.
 */
interface Block {
    id: string;
    nodes: CanvasNode[];
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A node that belongs to no group, and so moves entirely on its own. */
function soloBlock(node: CanvasNode): Block {
    return {
        id: node.id,
        nodes: [node],
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
    };
}

/**
 * Partition nodes into movable blocks.
 *
 * The rule is that two groups holding the same node cannot be laid out
 * independently: whichever moved second would leave the shared node behind and
 * silently lose it as a member. So groups are merged into one block whenever
 * they share a node, which covers both the nested case (an inner group is held
 * by the outer one, and so is everything in it) and the merely overlapping case
 * — two groups the user dragged across each other, which claiming
 * outermost-first used to tear apart.
 */
function toBlocks(nodes: readonly CanvasNode[]): Block[] {
    const groups = nodes.filter(isGroupNode);
    if (!groups.length) return nodes.map(soloBlock);

    const parent = new Map<string, string>(groups.map((g) => [g.id, g.id]));
    const find = (id: string): string => {
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root)!;
        let walk = id;
        while (parent.get(walk) !== root) {
            const next = parent.get(walk)!;
            parent.set(walk, root);
            walk = next;
        }
        return root;
    };
    const union = (a: string, b: string): void => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };

    // Every group holding this node. More than one means those groups are tied
    // together from now on.
    const holders = new Map<string, string[]>();
    for (const node of nodes) {
        const held = groups.filter((g) => g.id !== node.id && contains(g, node));
        if (!held.length) continue;
        holders.set(
            node.id,
            held.map((g) => g.id)
        );
        for (let i = 1; i < held.length; i++) union(held[0].id, held[i].id);
    }

    const members = new Map<string, CanvasNode[]>();
    const claimed = new Set<string>();
    for (const node of nodes) {
        const held = holders.get(node.id);
        const root = held ? find(held[0]) : isGroupNode(node) ? find(node.id) : null;
        if (root === null) continue;
        const bucket = members.get(root);
        if (bucket) bucket.push(node);
        else members.set(root, [node]);
        claimed.add(node.id);
    }

    const blocks: Block[] = [];
    for (const [root, all] of members) {
        const b = boundsOf(all)!;
        blocks.push({ id: root, nodes: all, x: b.minX, y: b.minY, width: b.width, height: b.height });
    }
    for (const node of nodes) if (!claimed.has(node.id)) blocks.push(soloBlock(node));
    return blocks;
}

/** Move every node of a block so the block's top-left lands on (x, y). */
function placeBlock(block: Block, x: number, y: number): CanvasNode[] {
    const dx = x - block.x;
    const dy = y - block.y;
    if (dx === 0 && dy === 0) return block.nodes;
    return block.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
}

function applyPlacements(
    data: CanvasData,
    blocks: readonly Block[],
    at: ReadonlyMap<string, { x: number; y: number }>
): CanvasData {
    const moved = new Map<string, CanvasNode>();
    for (const block of blocks) {
        const target = at.get(block.id);
        if (!target) continue;
        // Whole pixels: Obsidian stores coordinates verbatim, and trigonometry
        // otherwise leaves values like -1005.2895794188314 in the saved file.
        const x = Math.round(target.x);
        const y = Math.round(target.y);
        for (const node of placeBlock(block, x, y)) moved.set(node.id, node);
    }
    // Preserve the original node order: Obsidian uses it for z-ordering, so
    // reordering would silently bring background groups to the front. The
    // spread carries `preserved` along; dropping it here would delete whatever
    // the parser could not read.
    return {
        ...data,
        nodes: data.nodes.map((n) => moved.get(n.id) ?? n),
        edges: data.edges,
    };
}

/** Reading order — roughly how the canvas looks now, so a tidy-up is not a reshuffle. */
function inReadingOrder(blocks: readonly Block[]): Block[] {
    return blocks.slice().sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

function layoutGrid(data: CanvasData, blocks: Block[], opts: LayoutOptions, origin: Origin): CanvasData {
    const ordered = inReadingOrder(blocks);
    const columns = opts.columns > 0 ? opts.columns : Math.max(1, Math.ceil(Math.sqrt(ordered.length)));

    // Uniform cells would waste space when one node is huge, so each column is
    // as wide as its widest block and each row as tall as its tallest.
    const colWidth: number[] = [];
    const rowHeight: number[] = [];
    ordered.forEach((b, i) => {
        const c = i % columns;
        const r = Math.floor(i / columns);
        colWidth[c] = Math.max(colWidth[c] ?? 0, b.width);
        rowHeight[r] = Math.max(rowHeight[r] ?? 0, b.height);
    });

    const at = new Map<string, { x: number; y: number }>();
    ordered.forEach((b, i) => {
        const c = i % columns;
        const r = Math.floor(i / columns);
        let x = origin.minX;
        for (let k = 0; k < c; k++) x += colWidth[k] + opts.gap;
        let y = origin.minY;
        for (let k = 0; k < r; k++) y += rowHeight[k] + opts.gap;
        at.set(b.id, { x, y });
    });

    return applyPlacements(data, blocks, at);
}

/** Map every node id to the block that carries it, so edges can be read as block links. */
function blockOfNode(blocks: readonly Block[]): Map<string, string> {
    const owner = new Map<string, string>();
    for (const b of blocks) for (const n of b.nodes) owner.set(n.id, b.id);
    return owner;
}

interface Graph {
    children: Map<string, string[]>;
    indegree: Map<string, number>;
}

function buildGraph(blocks: readonly Block[], edges: readonly CanvasEdge[]): Graph {
    const owner = blockOfNode(blocks);
    const children = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    for (const b of blocks) {
        children.set(b.id, []);
        indegree.set(b.id, 0);
    }
    const seen = new Set<string>();
    for (const edge of edges) {
        const from = owner.get(edge.fromNode);
        const to = owner.get(edge.toNode);
        // Edges inside one group are structure within a block, not between blocks.
        if (!from || !to || from === to) continue;
        const key = `${from}>${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        children.get(from)!.push(to);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
    return { children, indegree };
}

interface Forest {
    /** Child lists with every block appearing under exactly one parent. */
    children: Map<string, string[]>;
    roots: string[];
    depth: Map<string, number>;
}

/**
 * Reduce the edge graph to a forest — every block under at most one parent.
 *
 * Canvases are not trees. People draw diamonds, back-references and outright
 * cycles, and a node reached twice cannot be in two places at once. The first
 * parent to reach a block keeps it; later edges still render, they just stop
 * dictating position. Anything no root can reach — an island, or a node that
 * exists only inside a cycle — is promoted to a root of its own, so nothing is
 * left stacked at the origin.
 */
function buildForest(blocks: readonly Block[], graph: Graph): Forest {
    const ordered = inReadingOrder(blocks);
    const children = new Map<string, string[]>();
    const depth = new Map<string, number>();
    for (const b of blocks) children.set(b.id, []);

    const roots: string[] = [];
    const queue: string[] = [];
    const claim = (id: string, d: number) => {
        depth.set(id, d);
        queue.push(id);
    };

    for (const b of ordered) {
        if ((graph.indegree.get(b.id) ?? 0) === 0) {
            roots.push(b.id);
            claim(b.id, 0);
        }
    }

    // Walk breadth-first, promoting anything still unclaimed once the current
    // roots are exhausted. Restarting the same queue keeps a cycle-only cluster
    // hanging off one arbitrary member rather than scattering it.
    for (let head = 0; head < queue.length || depth.size < blocks.length; head++) {
        if (head >= queue.length) {
            const orphan = ordered.find((b) => !depth.has(b.id));
            if (!orphan) break;
            roots.push(orphan.id);
            claim(orphan.id, 0);
        }
        const id = queue[head];
        const d = depth.get(id)!;
        for (const child of graph.children.get(id) ?? []) {
            if (depth.has(child)) continue;
            children.get(id)!.push(child);
            claim(child, d + 1);
        }
    }

    return { children, roots, depth };
}

/**
 * A tidy layered tree.
 *
 * Two properties make the difference between a readable diagram and a staircase
 * of crossing lines, and both are about the cross axis: siblings must be packed
 * next to each other, and a parent must sit centred over the span its children
 * occupy. Laying each level out in the order the nodes happened to be in gets
 * the levels right and the picture wrong.
 *
 * Sizing is bottom-up (how much room does this subtree need?) and placement is
 * top-down (here is your slice — centre yourself in it), which avoids the
 * shifting pass a naive left-to-right placement needs.
 */
function layoutTree(data: CanvasData, blocks: Block[], opts: LayoutOptions, origin: Origin): CanvasData {
    const forest = buildForest(blocks, buildGraph(blocks, data.edges));
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const down = opts.direction === 'down';
    const across = (b: Block) => (down ? b.width : b.height);
    const along = (b: Block) => (down ? b.height : b.width);

    // Each level is as thick as its thickest block, so levels never collide.
    const levelThickness = new Map<number, number>();
    for (const b of blocks) {
        const d = forest.depth.get(b.id) ?? 0;
        levelThickness.set(d, Math.max(levelThickness.get(d) ?? 0, along(b)));
    }
    const levelOffset = new Map<number, number>();
    let running = 0;
    for (const d of [...levelThickness.keys()].sort((a, b) => a - b)) {
        levelOffset.set(d, running);
        running += levelThickness.get(d)! + opts.gap;
    }

    const extents = new Map<string, number>();
    const extentOf = (id: string): number => {
        const cached = extents.get(id);
        if (cached !== undefined) return cached;
        const kids = forest.children.get(id) ?? [];
        const own = across(byId.get(id)!);
        let value = own;
        if (kids.length) {
            const total = kids.reduce((sum, k) => sum + extentOf(k), 0) + opts.gap * (kids.length - 1);
            value = Math.max(own, total);
        }
        extents.set(id, value);
        return value;
    };

    const at = new Map<string, { x: number; y: number }>();

    /** Places a subtree inside `[start, start + extent]` and returns its own centre. */
    const place = (id: string, start: number): number => {
        const block = byId.get(id)!;
        const extent = extentOf(id);
        const size = across(block);
        const kids = forest.children.get(id) ?? [];

        let centre: number;
        if (!kids.length) {
            centre = start + extent / 2;
        } else {
            const childrenSpan =
                kids.reduce((sum, k) => sum + extentOf(k), 0) + opts.gap * (kids.length - 1);
            let cursor = start + (extent - childrenSpan) / 2;
            const childCentres: number[] = [];
            for (const kid of kids) {
                childCentres.push(place(kid, cursor));
                cursor += extentOf(kid) + opts.gap;
            }
            // Centre on the children themselves, not on the slice they were
            // given. The two only coincide when subtrees are the same size:
            // let one child carry a big subtree and the parent drifts off to
            // the side of the branch it belongs to.
            centre = (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
        }

        // Never let the node escape its own slice, or it would collide with a
        // sibling subtree.
        const acrossPos = Math.min(Math.max(centre - size / 2, start), start + extent - size);
        const alongPos = (down ? origin.minY : origin.minX) + levelOffset.get(forest.depth.get(id) ?? 0)!;
        at.set(
            id,
            down
                ? { x: origin.minX + acrossPos, y: alongPos }
                : { x: alongPos, y: origin.minY + acrossPos }
        );
        return acrossPos + size / 2;
    };

    let cursor = 0;
    for (const root of forest.roots) {
        place(root, cursor);
        cursor += extentOf(root) + opts.gap;
    }

    return applyPlacements(data, blocks, at);
}

/**
 * A radial tree: rings by depth, with each subtree owning an angular slice.
 *
 * The slice is proportional to how many leaves the subtree carries, so a bushy
 * branch gets the room it needs and a thin one does not hog a quadrant. Simply
 * spreading each ring evenly — which is the obvious first attempt — scatters
 * siblings around the circle and produces a starburst of crossing edges.
 */
function layoutRadial(data: CanvasData, blocks: Block[], opts: LayoutOptions, origin: Origin): CanvasData {
    const forest = buildForest(blocks, buildGraph(blocks, data.edges));
    const byId = new Map(blocks.map((b) => [b.id, b]));
    // Centre on what is actually moving, not on the whole canvas: with a
    // selection those differ, and the rings would form around empty space.
    const bounds = boundsOf(blocks.flatMap((b) => b.nodes));
    const centreX = bounds ? bounds.minX + bounds.width / 2 : origin.minX;
    const centreY = bounds ? bounds.minY + bounds.height / 2 : origin.minY;

    const leaves = new Map<string, number>();
    const leafCount = (id: string): number => {
        const cached = leaves.get(id);
        if (cached !== undefined) return cached;
        const kids = forest.children.get(id) ?? [];
        const value = kids.length ? kids.reduce((sum, k) => sum + leafCount(k), 0) : 1;
        leaves.set(id, value);
        return value;
    };

    // A single root sits in the middle; several share the first ring, because
    // stacking them all on the centre point would just pile them up.
    const singleRoot = forest.roots.length === 1;
    const ringOf = (id: string) => (forest.depth.get(id) ?? 0) + (singleRoot ? 0 : 1);

    const perRing = new Map<number, Block[]>();
    for (const b of blocks) {
        const r = ringOf(b.id);
        if (!perRing.has(r)) perRing.set(r, []);
        perRing.get(r)!.push(b);
    }

    const radius = new Map<number, number>();
    let previous = 0;
    let previousSize = 0;
    for (const ring of [...perRing.keys()].sort((a, b) => a - b)) {
        const members = perRing.get(ring)!;
        const widest = Math.max(...members.map((b) => Math.max(b.width, b.height)));
        if (ring === 0) {
            radius.set(0, 0);
            previousSize = widest;
            continue;
        }
        // Far enough not to touch the ring inside, and long enough around that
        // its own members fit side by side.
        const clearance = previous + previousSize / 2 + widest / 2 + opts.gap;
        const circumference = (members.length * (widest + opts.gap)) / (2 * Math.PI);
        const r = Math.max(clearance, circumference);
        radius.set(ring, r);
        previous = r;
        previousSize = widest;
    }

    const at = new Map<string, { x: number; y: number }>();
    const place = (id: string, from: number, to: number): void => {
        const block = byId.get(id)!;
        const angle = (from + to) / 2;
        const r = radius.get(ringOf(id)) ?? 0;
        at.set(id, {
            x: centreX + r * Math.cos(angle) - block.width / 2,
            y: centreY + r * Math.sin(angle) - block.height / 2,
        });

        const kids = forest.children.get(id) ?? [];
        if (!kids.length) return;
        const total = kids.reduce((sum, k) => sum + leafCount(k), 0);
        let cursor = from;
        for (const kid of kids) {
            const slice = ((to - from) * leafCount(kid)) / total;
            place(kid, cursor, cursor + slice);
            cursor += slice;
        }
    };

    const rootTotal = forest.roots.reduce((sum, r) => sum + leafCount(r), 0);
    let sweep = -Math.PI / 2;
    for (const root of forest.roots) {
        const slice = (2 * Math.PI * leafCount(root)) / rootTotal;
        place(root, sweep, sweep + slice);
        sweep += slice;
    }

    return applyPlacements(data, blocks, at);
}

/**
 * Rearrange a canvas. Pure: the input is never mutated, so a caller can diff
 * the result and decide whether the write is worth making.
 */
export function layoutCanvas(
    data: CanvasData,
    kind: LayoutKind,
    options: Partial<LayoutOptions> = {}
): CanvasData {
    const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
    if (data.nodes.length < 2) return data;

    const all = toBlocks(data.nodes);
    // A block takes part when any of its nodes was chosen. Picking a node
    // inside a group therefore moves the whole group, which is the only
    // answer that keeps membership intact.
    const blocks = opts.only
        ? all.filter((b) => b.nodes.some((n) => opts.only!.has(n.id)))
        : all;
    if (blocks.length < 2) return data;

    // Start from where the moving blocks already are, so tidying a branch
    // rearranges it in place instead of teleporting it across the canvas.
    const origin = boundsOf(blocks.flatMap((b) => b.nodes)) ?? { minX: 0, minY: 0 };

    const arranged =
        kind === 'grid'
            ? layoutGrid(data, blocks, opts, origin)
            : kind === 'tree'
              ? layoutTree(data, blocks, opts, origin)
              : layoutRadial(data, blocks, opts, origin);

    // Moving nodes without re-attaching their arrows leaves a canvas that is
    // arranged correctly and still looks wrong. A tree knows which axis it grew
    // along; grid and radial have no such intent, so the geometry decides.
    const axis: SideMode = kind === 'tree' ? (opts.direction === 'down' ? 'vertical' : 'horizontal') : 'auto';
    const moved = new Set(blocks.flatMap((b) => b.nodes.map((n) => n.id)));
    return normalizeEdgeSides(arranged, axis, moved);
}
