import {
    contains,
    isGroupNode,
    isTextNode,
    type CanvasData,
    type CanvasGroupNode,
    type CanvasNode,
} from '../canvasTypes';

export interface FitOptions {
    /** Never shrink a card below this, however little it holds. */
    minHeight: number;
    /** Never grow past this; a wall of text should scroll, not dominate. */
    maxHeight: number;
    /** Restrict to these node ids. */
    only?: ReadonlySet<string>;
}

export const DEFAULT_FIT_OPTIONS: FitOptions = {
    minHeight: 48,
    maxHeight: 800,
};

/*
 * Measurements of Obsidian's canvas card, in canvas units at zoom 1.
 *
 * Estimated rather than measured off the DOM on purpose. Reading the real
 * height needs the node to be rendered, which means an open canvas, the private
 * view object, and a node that has actually been mounted — none of which hold
 * for a canvas being generated from a note. An estimate that works everywhere
 * beats an exact number that only works sometimes, and being a few pixels
 * generous costs nothing while being short would clip the text.
 */
const PADDING_X = 24;
const PADDING_Y = 22;
const LINE_HEIGHT = 24;
/** Average glyph advance for the default text size. Latin and Cyrillic are close enough. */
const CHAR_WIDTH = 8.2;
/** Headings render larger, so they wrap sooner and stand taller. */
const HEADING_SCALE: Record<number, number> = { 1: 1.9, 2: 1.55, 3: 1.3, 4: 1.15, 5: 1, 6: 1 };

function lineHeightFor(line: string): { height: number; charWidth: number } {
    const heading = /^(#{1,6})\s/.exec(line);
    const scale = heading ? (HEADING_SCALE[heading[1].length] ?? 1) : 1;
    return { height: LINE_HEIGHT * scale, charWidth: CHAR_WIDTH * scale };
}

/**
 * How tall a card must be to show `text` at `width`.
 *
 * Wrapping is counted per line rather than over the whole string: a blank line
 * is a paragraph break that takes vertical space, and a list of five short
 * items is five lines however few characters it holds.
 */
export function heightForText(text: string, width: number, opts: FitOptions): number {
    const usable = Math.max(width - PADDING_X, CHAR_WIDTH * 4);
    let total = 0;
    for (const line of text.split(/\r?\n/)) {
        const { height, charWidth } = lineHeightFor(line);
        if (!line.trim()) {
            // An empty line is still a line, but only half of one visually.
            total += height / 2;
            continue;
        }
        const perLine = Math.max(1, Math.floor(usable / charWidth));
        total += Math.ceil(line.length / perLine) * height;
    }
    return Math.min(Math.max(Math.round(total + PADDING_Y), opts.minHeight), opts.maxHeight);
}

/**
 * Shrink every text card to the height its content needs.
 *
 * Obsidian sizes a card when you type into it and never again: resize one by
 * hand, or generate one, and it keeps that height forever. On a canvas built
 * from headings most of every card is empty space, which is what makes a
 * generated canvas look worse than a hand-made one.
 *
 * Width is left alone. It is the one dimension people set deliberately — for
 * column alignment, for a group's shape — and re-deciding it would undo their
 * arrangement rather than tidy it.
 */
export function fitNodes(data: CanvasData, options: Partial<FitOptions> = {}): CanvasData {
    const opts = { ...DEFAULT_FIT_OPTIONS, ...options };
    const groups = data.nodes.filter(isGroupNode);
    let changed = false;

    const nodes: CanvasNode[] = data.nodes.map((node) => {
        // Only text cards: a file card frames an embed whose height is the
        // user's framing choice, and a group's size is what defines membership.
        if (!isTextNode(node)) return node;
        if (opts.only && !opts.only.has(node.id)) return node;

        let height = heightForText(node.text, node.width, opts);

        // Growing a card out of the bottom of its group would end its
        // membership without saying so, and the next tidy would leave it
        // behind when the group moves. A card that scrolls is a far smaller
        // problem than a card that quietly falls out of its group.
        const room = roomInsideGroup(node, groups);
        if (room !== null) {
            // Too little room to honour even the minimum: leave the card
            // exactly as it is rather than shrink it to something unreadable.
            if (room < opts.minHeight) return node;
            height = Math.min(height, room);
        }

        if (height === node.height) return node;
        changed = true;
        return { ...node, height };
    });

    return changed ? { ...data, nodes } : data;
}

/**
 * How tall a node may grow before it escapes the group holding it, or null when
 * no group does.
 *
 * The tightest group wins, which is the innermost one a node sits in. Measured
 * against where the node is right now: a card the user has already dragged half
 * out of a group is not a member, and clamping it would be inventing one.
 */
function roomInsideGroup(node: CanvasNode, groups: readonly CanvasGroupNode[]): number | null {
    let room: number | null = null;
    for (const group of groups) {
        if (group.id === node.id) continue;
        if (!contains(group, node)) continue;
        const available = group.y + group.height - node.y;
        if (room === null || available < room) room = available;
    }
    return room;
}
