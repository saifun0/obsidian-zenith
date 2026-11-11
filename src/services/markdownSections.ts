/**
 * Section-aware Markdown insertion, shared by the journal (filing captured
 * tasks) and anything else that needs to add a block to a named part of a note
 * rather than to its end.
 */

/**
 * Advance fenced-code-block state (` ``` ` or `~~~`) for one line.
 * Returns the updated active fence (`null` when outside any fenced block),
 * and callers skip lines whenever a fence is open or opening/closing on `line`.
 */
export interface FenceMarker {
    char: '`' | '~';
    length: number;
}

export function stepFence(active: FenceMarker | null, rawLine: string): {
    active: FenceMarker | null;
    inFence: boolean;
} {
    const line = rawLine.replace(/\r$/, '');
    if (!active) {
        const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (open && (open[1][0] === '~' || !open[2].includes('`'))) {
            return {
                active: { char: open[1][0] as '`' | '~', length: open[1].length },
                inFence: true,
            };
        }
        return { active: null, inFence: false };
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === active.char && close[1].length >= active.length) {
        return { active: null, inFence: true };
    }
    return { active, inFence: true };
}

/**
 * Insert `block` at the end of the section owned by `heading`.
 *
 * The section runs until the next heading of the same or a higher level
 * (ignoring `#` lines inside fenced code blocks), and trailing blank lines are
 * kept below the insert — appending to a section shouldn't glue the block onto
 * the heading that follows it. Matching is on the heading's text,
 * case-insensitively and at any level, so a note written with `### Tasks` still
 * catches a heading configured as "Tasks".
 *
 * Returns null when the note has no such heading, which is the caller's cue to
 * append at the end instead.
 */
export function insertUnderHeading(
    lines: string[],
    heading: string,
    block: string[]
): string[] | null {
    const wanted = heading.trim().toLowerCase();
    if (!wanted) return null;

    let start = -1;
    let level = 0;
    let end = lines.length;
    let fence: FenceMarker | null = null;

    for (let i = 0; i < lines.length; i++) {
        const stepped = stepFence(fence, lines[i]);
        fence = stepped.active;
        if (stepped.inFence) continue;

        const clean = lines[i].replace(/\r$/, '');
        if (start === -1) {
            const m = clean.match(/^(#{1,6})\s+(.*?)\s*$/);
            if (m && m[2].toLowerCase() === wanted) {
                start = i;
                level = m[1].length;
            }
            continue;
        }

        const m = clean.match(/^(#{1,6})\s+/);
        if (m && m[1].length <= level) {
            end = i;
            break;
        }
    }
    if (start === -1) return null;

    // Back up over the blank lines that separate this section from the next.
    let insertAt = end;
    while (insertAt > start + 1 && lines[insertAt - 1].trim() === '') insertAt--;

    const next = lines.slice();
    next.splice(insertAt, 0, ...block);
    return next;
}

/** Insert a block under `heading` in raw note text, preserving `\r\n` vs `\n`. */
export function insertTextUnderHeading(data: string, heading: string, block: string): string | null {
    const eol = data.includes('\r\n') ? '\r\n' : '\n';
    const placed = insertUnderHeading(data.split(/\r?\n/), heading, block.split(/\r?\n/));
    return placed ? placed.join(eol) : null;
}

/** Append a block to a note's text, guaranteeing a newline boundary and preserving EOL style. */
export function appendBlock(data: string, block: string): string {
    const eol = data.includes('\r\n') ? '\r\n' : '\n';
    const normalizedBlock = eol === '\r\n' ? block.replace(/\r?\n/g, '\r\n') : block;
    const needsNewline = data.length > 0 && !data.endsWith('\n');
    return `${data}${needsNewline ? eol : ''}${normalizedBlock}${eol}`;
}
