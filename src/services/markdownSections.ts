/**
 * Section-aware Markdown insertion, shared by the journal (filing captured
 * tasks) and anything else that needs to add a block to a named part of a note
 * rather than to its end.
 */

/**
 * Insert `block` at the end of the section owned by `heading`.
 *
 * The section runs until the next heading of the same or a higher level, and
 * trailing blank lines are kept below the insert — appending to a section
 * shouldn't glue the block onto the heading that follows it. Matching is on the
 * heading's text, case-insensitively and at any level, so a note written with
 * `### Tasks` still catches a heading configured as "Tasks".
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
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
        if (m && m[2].toLowerCase() === wanted) {
            start = i;
            level = m[1].length;
            break;
        }
    }
    if (start === -1) return null;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+/);
        if (m && m[1].length <= level) {
            end = i;
            break;
        }
    }

    // Back up over the blank lines that separate this section from the next.
    let insertAt = end;
    while (insertAt > start + 1 && lines[insertAt - 1].trim() === '') insertAt--;

    const next = lines.slice();
    next.splice(insertAt, 0, ...block);
    return next;
}

/** Append a block to a note's text, guaranteeing a newline boundary. */
export function appendBlock(data: string, block: string): string {
    const needsNewline = data.length > 0 && !data.endsWith('\n');
    return `${data}${needsNewline ? '\n' : ''}${block}\n`;
}
