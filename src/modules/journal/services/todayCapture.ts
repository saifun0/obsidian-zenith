/**
 * The "Today" card's line: something said once, put where the day's note
 * keeps that kind of thing.
 *
 * - a note goes under the notes heading, with the time it was written:
 *   `14:32 — called the bank`;
 * - a highlight goes under the highlights heading as a list item — into the
 *   template's empty `- ` when there is one, so it does not sit under a blank;
 * - a task goes wherever a task typed anywhere else goes (`resolveTaskTarget`).
 *
 * Pure: lines in, lines out. The card does the writing.
 */

export const CAPTURE_KINDS = ['note', 'highlight', 'task'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

/** A note as the card writes it: the hour and minute, and what was said. */
export function noteLine(text: string, at: Date): string {
    const hh = String(at.getHours()).padStart(2, '0');
    const mm = String(at.getMinutes()).padStart(2, '0');
    return `${hh}:${mm} — ${text.trim()}`;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const NOTE_RE = /^\s*\d{1,2}:\d{2} — \S/;
/** A list item with something in it, that is not a task. */
const ITEM_RE = /^\s*[-*+]\s+(?!\[.\])\S/;
/** The template's bullet waiting to be filled. */
const BLANK_ITEM_RE = /^\s*[-*+]\s*$/;

/** The lines of the section under a heading, as `[start, end)` — or null when there is no such heading. */
function section(lines: string[], heading: string): { start: number; end: number } | null {
    const want = heading.trim().toLowerCase();
    const at = lines.findIndex((line) => HEADING_RE.exec(line)?.[2].toLowerCase() === want);
    if (at < 0) return null;
    const level = HEADING_RE.exec(lines[at])?.[1].length ?? 1;
    let end = at + 1;
    while (end < lines.length) {
        const m = HEADING_RE.exec(lines[end]);
        if (m && m[1].length <= level) break;
        end++;
    }
    return { start: at + 1, end };
}

/**
 * Put a highlight into its section: into the first empty bullet if the
 * template left one, after the last item otherwise. Null when the note has no
 * such heading — the caller appends it then, as with any heading it lacks.
 */
export function withHighlight(lines: string[], heading: string, text: string): string[] | null {
    const place = section(lines, heading);
    if (!place) return null;
    const item = `- ${text.trim()}`;
    const out = [...lines];
    for (let i = place.start; i < place.end; i++) {
        if (BLANK_ITEM_RE.test(out[i])) {
            out[i] = item;
            return out;
        }
    }
    // After the last line that says something, so the blank before the next heading stays.
    let last = place.start - 1;
    for (let i = place.start; i < place.end; i++) if (out[i].trim()) last = i;
    out.splice(last + 1, 0, item);
    return out;
}

/**
 * How many things the day's note has been told: notes by the hour, filled
 * highlights, and the tasks written into it. What the card's last line counts,
 * and so what moves when the line is used.
 */
export function countRecords(body: string, highlights: string, tasksInNote: number): number {
    const lines = body.split('\n');
    const notes = lines.filter((line) => NOTE_RE.test(line)).length;
    const place = section(lines, highlights);
    const items = place
        ? lines.slice(place.start, place.end).filter((line) => ITEM_RE.test(line)).length
        : 0;
    return notes + items + tasksInNote;
}
