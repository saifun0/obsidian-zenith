/**
 * Moving task blocks between lines in a Markdown file.
 *
 * A task in the vault isn't one line — it owns a *block*: its own checkbox line
 * plus every following line indented deeper than it (subtasks, notes, nested
 * lists). Reordering therefore means lifting a whole block out and re-inserting
 * it, not swapping two lines. Everything here is pure string/array work so it
 * can be unit-tested without a vault.
 *
 * Line numbers on the public API are 1-indexed (matching `Task.lineNumber`);
 * indices inside are 0-indexed.
 */

/** A half-open-free, inclusive span of lines. Both indices are 0-indexed. */
export interface LineBlock {
    start: number;
    end: number;
}

/** A `- [ ]` / `* [x]` checkbox line. */
const CHECKBOX_LINE_RE = /^\s*[-*]\s*\[[^\]]\]/;

/** Leading whitespace of a line, tabs counted as four columns. */
export function indentWidth(line: string): number {
    const lead = line.match(/^([ \t]*)/)?.[1] ?? '';
    return lead.replace(/\t/g, '    ').length;
}

/** The literal leading whitespace of a line (preserved when re-indenting). */
export function indentOf(line: string): string {
    return line.match(/^([ \t]*)/)?.[1] ?? '';
}

/**
 * The block owned by the checkbox at `lineIndex`: that line plus all following
 * lines indented deeper than it. Blank lines are only absorbed when a deeper
 * line follows, so a task never swallows the blank separating it from the next
 * one. Returns null when the line isn't a checkbox.
 */
export function findBlock(lines: string[], lineIndex: number): LineBlock | null {
    if (lineIndex < 0 || lineIndex >= lines.length) return null;
    if (!CHECKBOX_LINE_RE.test(lines[lineIndex])) return null;

    const baseIndent = indentWidth(lines[lineIndex]);
    let end = lineIndex;

    for (let i = lineIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            // Look ahead: a blank line belongs to the block only if the block
            // continues after it.
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === '') j++;
            if (j < lines.length && indentWidth(lines[j]) > baseIndent) {
                i = j - 1;
                continue;
            }
            break;
        }
        if (indentWidth(line) <= baseIndent) break;
        end = i;
    }

    return { start: lineIndex, end };
}

/** Re-indent a block so its first line sits at `toIndent`, keeping relative depth. */
export function reindentBlock(blockLines: string[], toIndent: string): string[] {
    if (blockLines.length === 0) return blockLines;
    const fromIndent = indentOf(blockLines[0]);
    if (fromIndent === toIndent) return [...blockLines];

    return blockLines.map((line, i) => {
        if (i === 0) return toIndent + line.slice(fromIndent.length);
        if (line.trim() === '') return line;
        // Nested lines keep their extra depth relative to the block's root.
        const own = indentOf(line);
        const extra = own.startsWith(fromIndent) ? own.slice(fromIndent.length) : own;
        return toIndent + extra + line.slice(own.length);
    });
}

export type DropPosition = 'before' | 'after';

export interface MoveResult {
    lines: string[];
    /** 0-indexed line the moved block now starts at. */
    newStart: number;
}

/**
 * Move the block owned by `sourceLine` so it sits immediately before or after
 * the block owned by `targetLine`, adopting the target's indentation (i.e. it
 * becomes the target's sibling).
 *
 * Returns null when either line isn't a checkbox, when they're the same block,
 * or when the target sits *inside* the source — a task can't be moved into its
 * own subtree, which would silently delete it.
 */
export function moveBlock(
    lines: string[],
    sourceLine: number,
    targetLine: number,
    position: DropPosition
): MoveResult | null {
    const srcIdx = sourceLine - 1;
    const tgtIdx = targetLine - 1;

    const source = findBlock(lines, srcIdx);
    const target = findBlock(lines, tgtIdx);
    if (!source || !target) return null;
    if (source.start === target.start) return null;
    // Dropping a task inside its own subtree would orphan everything under it.
    if (tgtIdx >= source.start && tgtIdx <= source.end) return null;

    const block = lines.slice(source.start, source.end + 1);
    const targetIndent = indentOf(lines[target.start]);
    const reindented = reindentBlock(block, targetIndent);

    // Insertion point in the *original* array, then adjusted for the removal.
    const insertAt = position === 'before' ? target.start : target.end + 1;
    const rest = [...lines];
    rest.splice(source.start, block.length);

    const shift = source.start < insertAt ? block.length : 0;
    const finalAt = insertAt - shift;

    rest.splice(finalAt, 0, ...reindented);
    return { lines: rest, newStart: finalAt };
}

/**
 * Lift a block out of `lines` — used by cross-file moves, where the block is
 * inserted into the destination first and only then removed from the source.
 */
export function extractBlock(lines: string[], sourceLine: number): { block: string[]; rest: string[] } | null {
    const source = findBlock(lines, sourceLine - 1);
    if (!source) return null;
    const block = lines.slice(source.start, source.end + 1);
    const rest = [...lines];
    rest.splice(source.start, block.length);
    return { block, rest };
}

/**
 * Insert an already-extracted block next to `targetLine`, matching its
 * indentation. Returns null when the target isn't a checkbox line.
 */
export function insertBlock(
    lines: string[],
    block: string[],
    targetLine: number,
    position: DropPosition
): string[] | null {
    const target = findBlock(lines, targetLine - 1);
    if (!target) return null;
    const reindented = reindentBlock(block, indentOf(lines[target.start]));
    const out = [...lines];
    out.splice(position === 'before' ? target.start : target.end + 1, 0, ...reindented);
    return out;
}
