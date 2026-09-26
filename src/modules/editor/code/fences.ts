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

export interface FenceInfo {
    /** The first word after the fence, as written; empty for none. */
    language: string;
    /** What the block is called, after the language; empty for nothing. */
    title: string;
    /** `-` after the language starts it folded, `+` open; null when neither is written. */
    fold: 'open' | 'closed' | null;
}

export interface FencedBlock extends FenceInfo {
    /** Index of the opening fence's line, from 0. */
    open: number;
    /** Index of the closing fence's line; null when the note ends first. */
    close: number | null;
}

const OPEN = /^\s*(`{3,}|~{3,})(.*)$/;
const CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

export function findFencedBlocks(lines: Iterable<string>): FencedBlock[] {
    const blocks: FencedBlock[] = [];
    let current: { open: number; char: string; length: number; info: FenceInfo } | null = null;
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
                blocks.push({ open: current.open, close: index, ...current.info });
                current = null;
            }
            continue;
        }

        const open = OPEN.exec(line);
        if (!open) continue;
        const [, fence, info] = open;
        if (fence[0] === '`' && info.includes('`')) continue;
        current = { open: index, char: fence[0], length: fence.length, info: parseFenceInfo(info) };
    }

    if (current) blocks.push({ open: current.open, close: null, ...current.info });
    return blocks;
}

/**
 * What follows a fence: the language, then `+` or `-`, then a title.
 *
 *     ```html                    HTML
 *     ```html Skeleton           HTML - Skeleton
 *     ```html - Skeleton         the same, folded to its header
 *     ```html +                  open, whatever the default
 *
 * The marker only counts on its own, so `c++` and `objective-c` are still
 * languages. Code Styler's own spelling is read too — `title:"…"` and `fold` —
 * so notes written for it keep their titles; its other parameters are left
 * out of the title rather than shown in it.
 */
export function parseFenceInfo(raw: string): FenceInfo {
    let rest = raw.trim();
    let language = '';
    const first = /^\S+/.exec(rest)?.[0] ?? '';
    if (first && !isMarker(first)) {
        language = first;
        rest = rest.slice(first.length).trim();
    }

    let fold: FenceInfo['fold'] = null;
    const marker = /^[+-](?=\s|$)/.exec(rest);
    if (marker) {
        fold = marker[0] === '-' ? 'closed' : 'open';
        rest = rest.slice(1).trim();
    }

    if (!CODE_STYLER.test(rest)) return { language, title: rest, fold };

    const title = /(?:^|\s)title:(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(rest);
    if (fold === null && /(?:^|\s)fold(?::|\s|$)/.test(rest)) fold = 'closed';
    return { language, title: (title?.[1] ?? title?.[2] ?? title?.[3] ?? '').trim(), fold };
}

/** A Code Styler parameter: `title:`, `fold`, `ln:`, `hl:`, `icon`, `unwrap`, `wrap`, `ref:`. */
const CODE_STYLER =
    /(?:^|\s)(?:title:|fold(?::|\s|$)|ln:|hl:|icon(?:\s|$)|unwrap(?::|\s|$)|wrap(?::|\s|$)|ref:)/;

function isMarker(token: string): boolean {
    return token === '+' || token === '-';
}

/** A code element's text as it would be copied: without the final line break. */
export function codeText(raw: string): string {
    return raw.endsWith('\n') ? raw.slice(0, -1) : raw;
}

/** How many lines a block holds, for its numbers; an empty block has one. */
export function lineCount(text: string): number {
    return codeText(text).split('\n').length;
}
