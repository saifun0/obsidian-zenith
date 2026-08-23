/**
 * The detail block: the indented lines under a task line.
 *
 * Short facts — a date, an hour, a duration — fit as markers on the task line
 * itself. A description and a list of attachments do not: they are long, they
 * are several, and crammed inline they would turn the one line you actually
 * read into something you have to parse. So they live underneath, indented into
 * the task the way Markdown already continues a list item:
 *
 * ```markdown
 * - [ ] Zenith 0.1.0 ⏫ 📅 2026-09-01 ⏰ 18:00 ⏱ 1h25m
 *     доделать перенос функций и выложить
 *     ![[скрин.png]]
 *     [[Заметки/План релиза]]
 *     → [[Задачи#Публикация на GitHub]]
 *     - [x] Перенести функции ✅ 2026-08-11
 * ```
 *
 * Nothing here is a Zenith-only syntax: an image embed, a wikilink and a line
 * of prose are what anyone would write by hand, and Obsidian renders the block
 * as part of the task whether or not this plugin is installed. Which is the
 * point — the same reason the statuses are checkbox characters.
 */

/** What an attachment points at. The arrow prefix is what marks a task link. */
export type AttachmentKind = 'image' | 'note' | 'task' | 'link';

export interface TaskAttachment {
    kind: AttachmentKind;
    /** Vault path or URL, exactly as written between the brackets. */
    target: string;
    /** The `|alias` of a wikilink, or a markdown link's text. */
    label?: string;
}

export interface TaskDetails {
    /** Free text, newlines preserved. Empty string when there is none. */
    description: string;
    attachments: TaskAttachment[];
}

export const EMPTY_DETAILS: TaskDetails = { description: '', attachments: [] };

/** `→` on a link means "this is another task", not just any note. */
const TASK_PREFIX = /^(?:→|->)\s*/;

const EMBED_RE = /^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/;
const MD_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const MD_LINK_RE = /^\[([^\]]*)\]\(([^)]+)\)$/;
const BARE_URL_RE = /^https?:\/\/\S+$/i;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i;

/** Read one detail line as an attachment, or `null` if it is prose. */
function readAttachment(line: string): TaskAttachment | null {
    const isTask = TASK_PREFIX.test(line);
    const body = line.replace(TASK_PREFIX, '').trim();

    const embed = body.match(EMBED_RE);
    if (embed) {
        // `![[note.md]]` embeds a note, not a picture — the extension decides.
        const kind: AttachmentKind = IMAGE_EXT_RE.test(embed[1]) ? 'image' : 'note';
        return { kind, target: embed[1], label: embed[2] };
    }

    const wiki = body.match(WIKILINK_RE);
    if (wiki) {
        return {
            kind: isTask ? 'task' : IMAGE_EXT_RE.test(wiki[1]) ? 'image' : 'note',
            target: wiki[1],
            label: wiki[2],
        };
    }

    const mdImage = body.match(MD_IMAGE_RE);
    if (mdImage) return { kind: 'image', target: mdImage[2], label: mdImage[1] || undefined };

    const mdLink = body.match(MD_LINK_RE);
    if (mdLink) {
        return {
            kind: IMAGE_EXT_RE.test(mdLink[2]) ? 'image' : 'link',
            target: mdLink[2],
            label: mdLink[1] || undefined,
        };
    }

    if (BARE_URL_RE.test(body)) {
        return { kind: IMAGE_EXT_RE.test(body) ? 'image' : 'link', target: body };
    }

    return null;
}

/** Write one attachment back as the line it came from. */
export function attachmentLine(attachment: TaskAttachment): string {
    const { kind, target, label } = attachment;
    const isUrl = BARE_URL_RE.test(target);

    if (kind === 'image') {
        return isUrl ? `![${label ?? ''}](${target})` : `![[${target}${label ? `|${label}` : ''}]]`;
    }
    if (kind === 'link') {
        return label ? `[${label}](${target})` : target;
    }
    const link = `[[${target}${label ? `|${label}` : ''}]]`;
    // The arrow is the only thing telling a task apart from a plain note link.
    return kind === 'task' ? `→ ${link}` : link;
}

/**
 * Split a task's detail lines into prose and attachments.
 *
 * Order is not preserved between the two: they are shown in separate places in
 * the UI, so keeping the interleaving would be storing something nobody reads.
 * Within each, the file's order is kept.
 */
export function parseDetails(lines: string[]): TaskDetails {
    const prose: string[] = [];
    const attachments: TaskAttachment[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const attachment = readAttachment(line);
        if (attachment) attachments.push(attachment);
        else prose.push(line);
    }

    return { description: prose.join('\n'), attachments };
}

/**
 * Build the lines to write under a task, at the given indent.
 *
 * Returns an empty array when there is nothing to say, so a task with no
 * details leaves no blank scaffolding behind in the note.
 */
export function buildDetailLines(details: TaskDetails, indent: string): string[] {
    const out: string[] = [];
    for (const line of details.description.split('\n')) {
        const text = line.trim();
        if (text) out.push(indent + text);
    }
    for (const attachment of details.attachments) {
        out.push(indent + attachmentLine(attachment));
    }
    return out;
}

/** Whether two detail blocks say the same thing. */
export function detailsEqual(a: TaskDetails, b: TaskDetails): boolean {
    if (a.description !== b.description) return false;
    if (a.attachments.length !== b.attachments.length) return false;
    return a.attachments.every((x, i) => {
        const y = b.attachments[i];
        return x.kind === y.kind && x.target === y.target && (x.label ?? '') === (y.label ?? '');
    });
}

export const hasDetails = (details: TaskDetails): boolean =>
    details.description.trim().length > 0 || details.attachments.length > 0;

// ── Finding the block in a file ──────────────────────

/** Any list item with a checkbox, at any indent. */
const CHECKBOX_LINE = /^\s*[-*+]\s*\[.\]/;

const indentOf = (line: string): string => line.match(/^[\t ]*/)?.[0] ?? '';

/**
 * Where a task's detail block sits in a file, as a `[start, end)` line range.
 *
 * Empty when there is none — `start === end` is then the line the block would
 * be inserted at. The rules are the reader's and the writer's alike, which is
 * why they live in one function: a block the parser reads but the writer
 * replaces differently would quietly duplicate itself on every save.
 */
export function detailRange(lines: string[], lineIdx: number): { start: number; end: number } {
    const start = lineIdx + 1;
    const own = indentOf(lines[lineIdx] ?? '').length;
    let end = start;
    while (end < lines.length) {
        const line = lines[end];
        if (line === undefined || CHECKBOX_LINE.test(line) || !line.trim()) break;
        if (indentOf(line).length <= own) break;
        end++;
    }
    return { start, end };
}

/** The block's lines, trimmed — what `parseDetails` expects. */
export function detailLines(lines: string[], lineIdx: number): string[] {
    const { start, end } = detailRange(lines, lineIdx);
    return lines.slice(start, end).map((l) => l.trim());
}

/**
 * Replace a task's detail block, returning the new file lines.
 *
 * The indent is taken from the block already there, so hand-written spacing
 * survives a save; a task getting its first detail is indented one step in from
 * its own line, in whichever character the file already indents with.
 */
export function writeDetails(
    lines: string[],
    lineIdx: number,
    details: TaskDetails
): string[] {
    const { start, end } = detailRange(lines, lineIdx);
    const own = indentOf(lines[lineIdx] ?? '');
    const existing = end > start ? indentOf(lines[start]) : '';
    const indent = existing || (own.includes('\t') ? `${own}\t` : `${own}    `);

    const next = [...lines];
    next.splice(start, end - start, ...buildDetailLines(details, indent));
    return next;
}
