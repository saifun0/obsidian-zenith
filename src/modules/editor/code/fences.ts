/**
 * Where a note's fenced code blocks are, read from its lines.
 *
 * The editor needs this and Obsidian does not publish it: its own parser marks
 * the lines, but only through classes on a syntax tree that is not part of the
 * API. The rules are Obsidian's as far as a note shows them — a fence of three
 * or more backticks or tildes, after any indent, closed by a fence of the same
 * character at least as long; a backtick fence's info may hold no backtick,
 * which is what tells it from inline code; frontmatter holds no fences; a block
 * nobody closes runs to the end of the note.
 */

export interface FencedBlock {
    /** Index of the opening fence's line, from 0. */
    open: number;
    /** Index of the closing fence's line; null when the note ends first. */
    close: number | null;
    /** The first word after the fence, as written; empty for none. */
    language: string;
}

const OPEN = /^\s*(`{3,}|~{3,})(.*)$/;
const CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

export function findFencedBlocks(lines: Iterable<string>): FencedBlock[] {
    const blocks: FencedBlock[] = [];
    let current: { open: number; char: string; length: number; language: string } | null = null;
    let inFrontmatter = false;
    let index = -1;

    for (const line of lines) {
        index++;

        if (index === 0 && line.trimEnd() === '---') {
            inFrontmatter = true;
            continue;
        }
        if (inFrontmatter) {
            if (line.trimEnd() === '---') inFrontmatter = false;
            continue;
        }

        if (current) {
            const close = CLOSE.exec(line);
            if (close && close[1][0] === current.char && close[1].length >= current.length) {
                blocks.push({ open: current.open, close: index, language: current.language });
                current = null;
            }
            continue;
        }

        const open = OPEN.exec(line);
        if (!open) continue;
        const [, fence, info] = open;
        if (fence[0] === '`' && info.includes('`')) continue;
        current = {
            open: index,
            char: fence[0],
            length: fence.length,
            language: info.trim().split(/\s+/)[0] ?? '',
        };
    }

    if (current) blocks.push({ open: current.open, close: null, language: current.language });
    return blocks;
}

/** A code element's text as it would be copied: without the final line break. */
export function codeText(raw: string): string {
    return raw.endsWith('\n') ? raw.slice(0, -1) : raw;
}

/** How many lines a block holds, for its numbers; an empty block has one. */
export function lineCount(text: string): number {
    return codeText(text).split('\n').length;
}
