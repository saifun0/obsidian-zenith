import { App, TFile, TFolder, normalizePath } from 'obsidian';
import {
    buildTaskLine,
    buildTaskBody,
    parseTaskText,
    nextRecurrenceDate,
    daysBetweenIso,
    shiftIsoDate,
    type TaskInput,
} from './taskFormat';
import { buildDetailLines, detailRange, writeDetails, type TaskDetails } from './taskDetails';
import { charFromStatus, type TaskStatus } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { moveBlock, extractBlock, insertBlock, type DropPosition } from './taskMove';
import { insertUnderHeading, appendBlock } from '../../../services/markdownSections';
import type { TaskTarget } from './taskTarget';

/** A `- [ ]` / `* [x]` / `[/]` / `[-]` checkbox line (safety check before deleting). */
const CHECKBOX_LINE_RE = /^\s*[-*]\s*\[[^\]]\]/;
/** Splits a checkbox line into: indent+marker, status char, body. */
const CHECKBOX_PARTS_RE = /^(\s*[-*]\s+)\[([^\]])\]\s?(.*)$/;

/** File that new tasks are appended to (inside the configured tasks folder). */
const DEFAULT_TASK_FILE = 'Zenith Inbox.md';

/** The date stamps a status change owns: ✅ when finished, ❌ when given up on. */
const OUTCOME_DATE_RE = /\s*(?:✅|❌)\s*\d{4}-\d{2}-\d{2}/g;

/** The accumulated-time marker, for replacing it in place. */
const SPENT_MARKER_RE = /⏱\s*\d+(?:h\d*)?m?/;

/** Trailing `#tags`, which by convention end the line. */
const TRAILING_TAGS_RE = /(\s+#[\w/-]+)+\s*$/;

/**
 * Put a marker at the end of a line's fields, before any trailing tags.
 *
 * Tags are written last by the same convention every other reader of this
 * format follows, and appending after them would make `#work ⏱ 25m` — which
 * reads as a tag with something stuck to it.
 */
function insertBeforeTags(body: string, marker: string): string {
    const tags = body.match(TRAILING_TAGS_RE);
    if (!tags) return `${body.trimEnd()} ${marker}`;
    const head = body.slice(0, body.length - tags[0].length).trimEnd();
    return `${head} ${marker}${tags[0].trimEnd()}`;
}

export type NewTaskInput = TaskInput;

/**
 * TaskWriter — persists task mutations back to the Markdown files in the vault.
 * Uses `vault.process` (atomic read-modify-write) so concurrent edits don't
 * clobber each other.
 */
export class TaskWriter {
    constructor(private readonly app: App) {}

    /**
     * Set a task's 4-state status.
     *
     * Marking done stamps a ✅ completion date and, for recurring tasks, inserts
     * the next occurrence above; cancelling stamps ❌ instead. Both are the
     * Tasks-plugin conventions, so a note still means the same thing to other
     * readers — and either way the previous stamp is cleared first, so moving a
     * task back to "to do" leaves no date claiming it ended. Returns true on
     * success.
     */
    async setStatusInFile(
        filePath: string,
        lineNumber: number,
        status: TaskStatus
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const m = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!m) return data;

            const [, prefix, , rawBody] = m;
            const char = charFromStatus(status);
            let body = rawBody.replace(OUTCOME_DATE_RE, '').trimEnd();

            const rollover: string[] = [];
            if (status === 'done') {
                const next = this.recurrenceRollover(body, prefix);
                if (next) rollover.push(next);
                body = `${body} ✅ ${getTodayString()}`.trim();
            } else if (status === 'cancelled') {
                // No rollover: a recurrence you gave up on shouldn't reappear
                // tomorrow as though nothing had happened.
                body = `${body} ❌ ${getTodayString()}`.trim();
            }

            lines[idx] = `${prefix}[${char}] ${body}`;
            if (rollover.length) lines.splice(idx, 0, ...rollover);
            ok = true;
            return lines.join('\n');
        });
        return ok;
    }

    /**
     * Build the next occurrence line for a recurring task body, or null if the
     * task doesn't recur / has no anchor date. Dates are shifted by the same
     * delta so their relative spacing is preserved.
     */
    private recurrenceRollover(body: string, prefix: string): string | null {
        const parsed = parseTaskText(body, { priority: 'none', tags: [] });
        if (!parsed.recurrence) return null;

        const ref = parsed.dueDate ?? parsed.scheduledDate ?? parsed.startDate;
        if (!ref) return null;

        const next = nextRecurrenceDate(parsed.recurrence, ref);
        if (!next) return null;

        const delta = daysBetweenIso(ref, next);
        const shifted: TaskInput = {
            title: parsed.title,
            priority: parsed.priority,
            tags: parsed.tags,
            recurrence: parsed.recurrence,
            dueDate: parsed.dueDate ? shiftIsoDate(parsed.dueDate, delta) : undefined,
            scheduledDate: parsed.scheduledDate ? shiftIsoDate(parsed.scheduledDate, delta) : undefined,
            startDate: parsed.startDate ? shiftIsoDate(parsed.startDate, delta) : undefined,
            // The hour repeats with the day: a weekly class is at the same time
            // next week, and dropping ⏰ here would empty the hour grid one
            // occurrence at a time. Time *spent* is not carried — that belongs
            // to the occurrence that was worked on, not to the next one.
            dueTime: parsed.dueTime,
            dueEndTime: parsed.dueEndTime,
        };
        return `${prefix}[ ] ${buildTaskBody(shifted)}`;
    }

    /**
     * Toggle a task between done and todo (checkbox click). Returns the new
     * `completed` state, or null if the line couldn't be located.
     */
    async toggleTaskInFile(filePath: string, lineNumber: number): Promise<boolean | null> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return null;

        // Read current status to decide the target.
        const data = await this.app.vault.read(file);
        const line = data.split('\n')[lineNumber - 1] ?? '';
        const m = line.match(CHECKBOX_PARTS_RE);
        if (!m) return null;
        const isDone = m[2].toLowerCase() === 'x';
        const ok = await this.setStatusInFile(filePath, lineNumber, isDone ? 'todo' : 'done');
        return ok ? !isDone : null;
    }

    /**
     * Write a new task.
     *
     * Without a `target` it goes to the default inbox file inside the tasks
     * folder, creating the folder/file when needed. With one — the journal
     * module hands us today's daily note — it's appended to that file instead,
     * under the target's heading when the note has it.
     */
    async addTask(
        folderPath: string,
        input: NewTaskInput,
        target?: TaskTarget | null,
        details?: TaskDetails
    ): Promise<void> {
        const subtasks = input.subtasks ?? [];
        const line = buildTaskLine(input);
        // Details go between the task and its subtasks, indented to match them.
        const block = [
            line,
            ...(details ? buildDetailLines(details, '\t') : []),
            ...subtasks.map((s) => `\t- [ ] ${s.trim()}`).filter((s) => s.trim()),
        ].join('\n');

        if (target) {
            const file = this.app.vault.getAbstractFileByPath(target.filePath);
            if (file instanceof TFile) {
                await this.app.vault.process(file, (data) => {
                    const placed = target.heading
                        ? insertUnderHeading(data.split('\n'), target.heading, block.split('\n'))
                        : null;
                    return placed ? placed.join('\n') : appendBlock(data, block);
                });
                return;
            }
            // The note vanished between resolving the target and writing —
            // fall through to the inbox rather than dropping the task.
            console.warn(`Zenith: task target "${target.filePath}" is gone; using the inbox.`);
        }

        const folder = folderPath.trim().replace(/\/+$/, '');
        await this.ensureFolder(folder);

        const filePath = normalizePath(folder ? `${folder}/${DEFAULT_TASK_FILE}` : DEFAULT_TASK_FILE);
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            await this.app.vault.create(filePath, `${block}\n`);
            return;
        }

        await this.app.vault.process(file, (data) => appendBlock(data, block));
    }

    /**
     * Rewrite an existing task line in place (edit all fields), preserving its
     * indentation, list marker and status char. Returns true on success.
     *
     * `details` is optional and, when given, replaces the indented block under
     * the line — description and attachments. Omitting it leaves whatever is
     * there alone, so a caller that only means to change the title cannot wipe
     * a description it never loaded.
     */
    async updateTaskInFile(
        filePath: string,
        lineNumber: number,
        input: NewTaskInput,
        details?: TaskDetails
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const m = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!m) return data;

            const [, prefix, char] = m;
            lines[idx] = `${prefix}[${char}] ${buildTaskBody(input)}`;
            ok = true;
            // The block is rewritten after the line, so the line's own indent —
            // which the block is measured against — is already the new one.
            return (details ? writeDetails(lines, idx, details) : lines).join('\n');
        });
        return ok;
    }

    /**
     * Replace just the detail block under a line, leaving the line itself as it
     * is. What the description editor and the attachment list save through.
     */
    async setDetailsInFile(
        filePath: string,
        lineNumber: number,
        details: TaskDetails
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;
            if (!CHECKBOX_LINE_RE.test(lines[idx])) return data;

            ok = true;
            return writeDetails(lines, idx, details).join('\n');
        });
        return ok;
    }

    /**
     * Edit one line's title and extras, keeping everything else it carries.
     *
     * For subtasks, which have no full editor of their own. The line is parsed,
     * the given fields replace their counterparts, and the rest — tags, dates,
     * priority — is written back as it was. A rebuild from a form that only
     * knows four fields would drop the others.
     */
    async updateLineExtras(
        filePath: string,
        lineNumber: number,
        patch: {
            title?: string;
            dueTime?: string;
            dueEndTime?: string;
            timerMinutes?: number;
            details?: TaskDetails;
        }
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const m = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!m) return data;

            const [, prefix, char, body] = m;
            const parsed = parseTaskText(body, { priority: 'none', tags: [] });
            const next: TaskInput = {
                ...parsed,
                title: patch.title?.trim() || parsed.title,
                // The end travels with the start: keeping the parsed end while
                // the patch moves the start is how a line ends up claiming
                // `⏰ 11:00-10:30`.
                dueTime: patch.dueTime,
                dueEndTime: patch.dueEndTime,
                timerMinutes: patch.timerMinutes,
            };

            lines[idx] = `${prefix}[${char}] ${buildTaskBody(next)}`;
            ok = true;
            return (patch.details ? writeDetails(lines, idx, patch.details) : lines).join('\n');
        });
        return ok;
    }

    /** The body of a checkbox line (everything after `[x] `), or null. */
    async readLineBody(filePath: string, lineNumber: number): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return null;
        const data = await this.app.vault.read(file);
        const m = (data.split('\n')[lineNumber - 1] ?? '').match(CHECKBOX_PARTS_RE);
        return m ? m[3] : null;
    }

    /**
     * Set the `⏱` total on a line, adding the marker when it isn't there yet.
     *
     * Surgical on purpose. Rebuilding the line from parsed fields would be
     * simpler and would silently drop any marker this plugin doesn't know
     * about — and the timer stops on a line the user may be editing by hand.
     */
    async setSpentInFile(
        filePath: string,
        lineNumber: number,
        spent: string
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const m = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!m) return data;

            const [, prefix, char, body] = m;
            const marker = `⏱ ${spent}`;
            // Tags trail the line by convention, so a fresh marker goes before
            // them rather than after — otherwise `#work ⏱ 25m` reads as a tag
            // with a time stuck to it.
            const next = SPENT_MARKER_RE.test(body)
                ? body.replace(SPENT_MARKER_RE, marker)
                : insertBeforeTags(body, marker);

            lines[idx] = `${prefix}[${char}] ${next}`;
            ok = true;
            return lines.join('\n');
        });
        return ok;
    }

    /** Delete a task line from a file. Returns true on success. */
    async deleteTaskInFile(filePath: string, lineNumber: number): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;
            if (!CHECKBOX_LINE_RE.test(lines[idx])) return data;

            // The description and attachments go with it: they are the task's
            // own lines, and left behind they would read as loose prose in the
            // middle of a list.
            const { end } = detailRange(lines, idx);
            lines.splice(idx, end - idx);
            ok = true;
            return lines.join('\n');
        });
        return ok;
    }

    /**
     * Replace the text of a checkbox line (e.g. a subtask), preserving its
     * indentation, list marker and status char. Returns true on success.
     */
    async setLineTitleInFile(
        filePath: string,
        lineNumber: number,
        title: string
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const m = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!m) return data;

            lines[idx] = `${m[1]}[${m[2]}] ${title.trim()}`;
            ok = true;
            return lines.join('\n');
        });
        return ok;
    }

    /**
     * Insert a new subtask under a parent task, at the end of the parent's
     * existing subtask block, indented one level deeper. Returns true on success.
     */
    async addSubtaskInFile(
        filePath: string,
        parentLineNumber: number,
        title: string
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        const clean = title.trim();
        if (!clean) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = parentLineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;
            if (!CHECKBOX_LINE_RE.test(lines[idx])) return data;

            const parentIndent = lines[idx].match(/^(\s*)/)?.[1] ?? '';
            const parentWidth = parentIndent.replace(/\t/g, '    ').length;

            // Advance past the parent's existing (deeper-indented) child lines.
            let insertAt = idx + 1;
            while (insertAt < lines.length) {
                const line = lines[insertAt];
                if (line.trim() === '') break;
                const width = (line.match(/^(\s*)/)?.[1] ?? '').replace(/\t/g, '    ').length;
                if (width <= parentWidth) break;
                insertAt++;
            }

            lines.splice(insertAt, 0, `${parentIndent}\t- [ ] ${clean}`);
            ok = true;
            return lines.join('\n');
        });
        return ok;
    }

    /**
     * Reorder a task by dropping it before/after another one, taking its whole
     * subtree along and adopting the target's indentation.
     *
     * Same-file moves are a single atomic rewrite. Cross-file moves insert into
     * the destination *first* and only then remove from the source: if the
     * second write fails the task exists twice, which the user can fix, rather
     * than nowhere, which they can't.
     */
    async moveTask(
        sourcePath: string,
        sourceLine: number,
        targetPath: string,
        targetLine: number,
        position: DropPosition
    ): Promise<boolean> {
        const source = this.app.vault.getAbstractFileByPath(sourcePath);
        const target = this.app.vault.getAbstractFileByPath(targetPath);
        if (!(source instanceof TFile) || !(target instanceof TFile)) return false;

        if (sourcePath === targetPath) {
            let ok = false;
            await this.app.vault.process(source, (data) => {
                const result = moveBlock(data.split('\n'), sourceLine, targetLine, position);
                if (!result) return data;
                ok = true;
                return result.lines.join('\n');
            });
            return ok;
        }

        // Cross-file: capture the block before touching either file.
        const sourceData = await this.app.vault.read(source);
        const lifted = extractBlock(sourceData.split('\n'), sourceLine);
        if (!lifted) return false;

        let inserted = false;
        await this.app.vault.process(target, (data) => {
            const next = insertBlock(data.split('\n'), lifted.block, targetLine, position);
            if (!next) return data;
            inserted = true;
            return next.join('\n');
        });
        if (!inserted) return false;

        // Re-derive the block from the current source content: an outside edit
        // between the read above and here would make the cached indices wrong.
        let removed = false;
        await this.app.vault.process(source, (data) => {
            const cut = extractBlock(data.split('\n'), sourceLine);
            if (!cut || cut.block.join('\n') !== lifted.block.join('\n')) return data;
            removed = true;
            return cut.rest.join('\n');
        });
        return removed;
    }

    private async ensureFolder(folder: string): Promise<void> {
        if (!folder) return;
        const existing = this.app.vault.getAbstractFileByPath(folder);
        if (existing instanceof TFolder) return;
        if (existing) return; // Something else already occupies the path.
        try {
            await this.app.vault.createFolder(folder);
        } catch {
            // Folder may have been created concurrently — safe to ignore.
        }
    }
}
