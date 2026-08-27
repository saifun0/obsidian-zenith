import type { CanvasData, CanvasEdge, CanvasNode, CanvasSide } from '../canvasTypes';

/**
 * Which axis an arrow should leave and enter on.
 *
 * `auto` reads it off the geometry. The other two fix the axis and let geometry
 * decide only the direction along it, which is what a layout wants: in a tree
 * growing downward every arrow should leave the bottom, including the one to a
 * child sitting far off to the side, where a purely geometric rule would decide
 * the horizontal distance wins and route the arrow out of the parent's flank.
 */
export type SideMode = 'auto' | 'vertical' | 'horizontal';

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

const centreX = (b: Box) => b.x + b.width / 2;
const centreY = (b: Box) => b.y + b.height / 2;

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
    return aMin < bMax && bMin < aMax;
}

/**
 * Pick the axis two boxes should be joined on.
 *
 * Overlap decides it when there is any: boxes stacked in the same column are
 * joined top to bottom however far apart they are, because an arrow that leaves
 * sideways only to double back reads as a mistake. With no overlap on either
 * axis — a diagonal neighbour — the larger centre-to-centre delta wins.
 */
function axisFor(from: Box, to: Box): 'vertical' | 'horizontal' {
    const sharesColumn = overlaps(from.x, from.x + from.width, to.x, to.x + to.width);
    const sharesRow = overlaps(from.y, from.y + from.height, to.y, to.y + to.height);
    if (sharesColumn && !sharesRow) return 'vertical';
    if (sharesRow && !sharesColumn) return 'horizontal';
    return Math.abs(centreX(to) - centreX(from)) > Math.abs(centreY(to) - centreY(from))
        ? 'horizontal'
        : 'vertical';
}

function sidesFor(
    from: Box,
    to: Box,
    mode: SideMode
): { fromSide: CanvasSide; toSide: CanvasSide } {
    const axis = mode === 'auto' ? axisFor(from, to) : mode;
    if (axis === 'horizontal') {
        const rightwards = centreX(to) >= centreX(from);
        return rightwards
            ? { fromSide: 'right', toSide: 'left' }
            : { fromSide: 'left', toSide: 'right' };
    }
    const downwards = centreY(to) >= centreY(from);
    return downwards ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
}

/**
 * Re-attach arrows to the faces the current positions call for.
 *
 * Obsidian stores the face an edge leaves and enters, and never revisits it.
 * Move the nodes — by hand or with a layout — and the arrows keep the old
 * attachment: a tidy tree ends up with edges leaving a parent's left flank and
 * curling back under it. Moving nodes without fixing this leaves a canvas that
 * is arranged correctly and still looks wrong.
 *
 * `only` limits the repair to edges touching those nodes, so rearranging one
 * branch does not silently restyle arrows elsewhere that the user aimed by hand.
 */
export function normalizeEdgeSides(
    data: CanvasData,
    mode: SideMode = 'auto',
    only?: ReadonlySet<string>
): CanvasData {
    if (!data.edges.length) return data;

    const boxes = new Map<string, CanvasNode>(data.nodes.map((n) => [n.id, n]));
    let changed = false;

    const edges: CanvasEdge[] = data.edges.map((edge) => {
        if (only && !only.has(edge.fromNode) && !only.has(edge.toNode)) return edge;
        const from = boxes.get(edge.fromNode);
        const to = boxes.get(edge.toNode);
        if (!from || !to) return edge;

        const { fromSide, toSide } = sidesFor(from, to, mode);
        if (edge.fromSide === fromSide && edge.toSide === toSide) return edge;
        changed = true;
        return { ...edge, fromSide, toSide };
    });

    return changed ? { ...data, edges } : data;
}
