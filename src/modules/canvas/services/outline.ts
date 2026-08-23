import {
    createCanvasId,
    type CanvasData,
    type CanvasEdge,
    type CanvasTextNode,
} from '../canvasTypes';

/** One heading, reduced to what a canvas needs from it. */
export interface OutlineHeading {
    text: string;
    /** 1 for `#`, 6 for `######`, as Obsidian reports it. */
    level: number;
}

const NODE_WIDTH = 260;
const NODE_HEIGHT = 60;

/**
 * Build a canvas from a note's headings.
 *
 * The nesting is taken from heading levels, not from the order alone: a jump
 * from `#` straight to `###` still nests, and a note that starts at `##`
 * because the title lives in frontmatter is treated as starting at its own top
 * level rather than being pushed a rank down. Real notes are not well-formed
 * outlines, and refusing to convert them would make the feature useless on
 * exactly the notes worth converting.
 *
 * Only the headings travel. The body under them is deliberately left behind —
 * a mind map of paragraphs is unreadable — which is why the reverse direction
 * always writes to a new file rather than overwriting a source note.
 */
export function outlineToCanvas(headings: readonly OutlineHeading[]): CanvasData {
    const nodes: CanvasTextNode[] = [];
    const edges: CanvasEdge[] = [];
    /** The innermost node at each heading level seen so far. */
    const openAt: Array<{ level: number; id: string }> = [];

    headings.forEach((heading, index) => {
        const text = heading.text.trim();
        if (!text) return;

        const id = createCanvasId();
        nodes.push({
            id,
            type: 'text',
            // Laid out properly a moment later; a diagonal cascade keeps the
            // nodes distinguishable if a caller skips the layout pass.
            x: index * 24,
            y: index * 24,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            text,
        });

        // Close every open heading at this level or deeper, then attach.
        while (openAt.length && openAt[openAt.length - 1].level >= heading.level) openAt.pop();
        const parent = openAt[openAt.length - 1];
        if (parent) {
            edges.push({
                id: createCanvasId(),
                fromNode: parent.id,
                fromSide: 'bottom',
                toNode: id,
                toSide: 'top',
            });
        }
        openAt.push({ level: heading.level, id });
    });

    return { nodes, edges };
}

/** Pull the headings out of raw Markdown, for callers without a metadata cache. */
export function parseHeadings(markdown: string): OutlineHeading[] {
    const headings: OutlineHeading[] = [];
    let inFence = false;
    for (const line of markdown.split(/\r?\n/)) {
        // A `#` inside a code block is a shell comment, not a heading.
        if (/^\s{0,3}(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) continue;
        const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (match) headings.push({ level: match[1].length, text: match[2] });
    }
    return headings;
}

/**
 * Render a canvas back to a Markdown outline.
 *
 * Depth in the graph becomes heading level. Nodes nothing points at are roots;
 * anything the walk never reaches — an island, or a node reachable only through
 * a cycle — is listed at the end rather than dropped, because silently losing a
 * node the user can plainly see on the canvas is worse than an untidy tail.
 */
export function canvasToOutline(data: CanvasData): string {
    const label = new Map<string, string>();
    for (const node of data.nodes) {
        if (node.type === 'text') label.set(node.id, node.text.trim());
        else if (node.type === 'file') label.set(node.id, `[[${node.file.replace(/\.md$/, '')}]]`);
        else if (node.type === 'link') label.set(node.id, node.url);
        else if (node.type === 'group') label.set(node.id, node.label?.trim() || 'Group');
    }

    // Reading order, so the outline follows the canvas as it looks.
    const ordered = data.nodes
        .slice()
        .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
        .map((n) => n.id);

    const children = new Map<string, string[]>();
    const indegree = new Map<string, number>();
    for (const id of ordered) {
        children.set(id, []);
        indegree.set(id, 0);
    }
    const seen = new Set<string>();
    for (const edge of data.edges) {
        const key = `${edge.fromNode}>${edge.toNode}`;
        if (seen.has(key) || edge.fromNode === edge.toNode) continue;
        if (!children.has(edge.fromNode) || !children.has(edge.toNode)) continue;
        seen.add(key);
        children.get(edge.fromNode)!.push(edge.toNode);
        indegree.set(edge.toNode, (indegree.get(edge.toNode) ?? 0) + 1);
    }

    const lines: string[] = [];
    const visited = new Set<string>();
    const emit = (id: string, depth: number): void => {
        if (visited.has(id)) return;
        visited.add(id);
        const hashes = '#'.repeat(Math.min(depth + 1, 6));
        const text = label.get(id) || '';
        // A multi-line node cannot be a heading; its first line titles the
        // section and the rest becomes the body under it.
        const [first, ...rest] = text.split(/\r?\n/);
        lines.push(`${hashes} ${first}`.trimEnd());
        if (rest.length) lines.push('', ...rest);
        lines.push('');
        for (const child of children.get(id) ?? []) emit(child, depth + 1);
    };

    for (const id of ordered) if ((indegree.get(id) ?? 0) === 0) emit(id, 0);
    // Whatever the roots could not reach.
    const stranded = ordered.filter((id) => !visited.has(id));
    for (const id of stranded) emit(id, 0);

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
