import { App, TFile, TFolder, normalizePath } from 'obsidian';
import {
    applyTaskPatch,
    buildTaskLine,
    parseTaskText,
    nextRecurrenceDate,
    daysBetweenIso,
    shiftIsoDate,
    type TaskInput,
    type TaskPatch,
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

/**
 * The date stamps a status change owns: ✅ when finished, ❌ when given up on.
 * Each status clears the other's, so moving a task back to "to do" leaves no
 * date claiming it ended.
 */
function outcomeStamps(status: TaskStatus, today: string): TaskPatch {
    return {
        doneDate: status === 'done' ? today : null,
        cancelledDate: status === 'cancelled' ? today : null,
    };
}

export type NewTaskInput = TaskInput;

/**
 * TaskWriter — persists task mutations back to the Markdown files in the vault.
 * Uses `vault.process` (atomic read-modify-write) so concurrent edits don't
 * clobber each other.
 */
/**
 * Is this checkbox line still the task the caller was shown?
 *
 * The comparison is of TITLES, not of raw lines. A line legitimately changes
 * without the task changing — a completion date gets stamped, a priority
 * marker is added, a tag is edited elsewhere — and a raw comparison would
 * refuse a delete the user is entitled to, which trains them to ignore the
 * refusal. The title is the part they read and pointed at.
 */
function titlesMatch(body: string, expected: string): boolean {
    const found = parseTaskText(body, { priority: 'none', tags: [] }).title.trim();
    return found === expected.trim();
}

/**
 * The next occurrence of a recurring task, or null if the task doesn't recur
 * or has no date to recur from. Dates are shifted by the same delta so their
 * spacing is preserved.
 *
 * It is the finished line with a few things changed, not a new line built
 * from what was understood of it — so whatever else the line carries comes
 * along. What is left behind is what belonged to the occurrence that was
 * done: its outcome stamp, the time spent on it, its block link and 🆔
 * (another line with the same ones would break every link and dependency on
 * them) and its ⛔, which the Tasks plugin drops for the same reason. A `➕`
 * becomes today, since that is when this one was made.
 */
function recurrenceRollover(body: string, prefix: string, today: string): string | null {
    const parsed = parseTaskText(body, { priority: 'none', tags: [] });
    if (!parsed.recurrence) return null;

    const ref = parsed.dueDate ?? parsed.scheduledDate ?? parsed.startDate;
    if (!ref) return null;

    const next = nextRecurrenceDate(parsed.recurrence, ref);
    if (!next) return null;

    const delta = daysBetweenIso(ref, next);
    const shift = (date: string | undefined) => (date ? shiftIsoDate(date, delta) : undefined);
    return `${prefix}[ ] ${applyTaskPatch(body, {
        dueDate: shift(parsed.dueDate),
        scheduledDate: shift(parsed.scheduledDate),
        startDate: shift(parsed.startDate),
        createdDate: parsed.createdDate ? today : undefined,
        // The hour repeats with the day: a weekly class is at the same time
        // next week, and it stays because nothing here removes it. Time
        // *spent* does not — it belongs to the occurrence that was worked on.
        spentMinutes: null,
        doneDate: null,
        cancelledDate: null,
        id: null,
        dependsOn: null,
        blockLink: null,
    })}`;
}

export class TaskWriter {
    constructor(private readonly app: App) {}

    /**
     * Set a task's 4-state status.
     *
     * Marking done stamps a ✅ completion date and, for recurring tasks, inserts
     * the next occurrence above; cancelling stamps ❌ instead. Both are the
     * Tasks-plugin conventions, so a note still means the same thing to other
     * readers — and either way the previous stamp is cleared first, so moving a
     * task back to "to do" leaves no date claiming it ended.
     *
     * A line that says `🏁 delete` is removed once done, as the Tasks plugin
     * removes it. Returns true on success.
     */
    async setStatusInFile(
        filePath: string,
        lineNumber: number,
        status: TaskStatus,
        expectedTitle: string
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
            // Same catch as `deleteTaskInFile`, for the same reason: a line
            // number is only true of the file as it was last parsed. Stamping
            // the wrong task done writes a completion date into somebody's
            // note for work they did not do — and for a recurring line, adds
            // the next occurrence of a task they never had.
            if (!titlesMatch(m[3], expectedTitle)) return data;

            const [, prefix, , body] = m;
            const today = getTodayString();
            lines[idx] = `${prefix}[${charFromStatus(status)}] ${applyTaskPatch(
                body,
                outcomeStamps(status, today)
            )}`;

            // No rollover on cancel: a recurrence you gave up on shouldn't
            // reappear tomorrow as though nothing had happened.
            const next = status === 'done' ? recurrenceRollover(body, prefix, today) : null;
            const doneWith =
                status === 'done' &&
                parseTaskText(body, { priority: 'none', tags: [] }).onCompletion === 'delete';

            if (doneWith && next) {
                // The next occurrence takes the finished one's place, and the
                // description under it with it — it is still the same chore.
                lines[idx] = next;
            } else if (doneWith) {
                // Nothing comes after it, so it goes the way a delete goes:
                // with the lines that belong to it.
                const { end } = detailRange(lines, idx);
                lines.splice(idx, end - idx);
            } else if (next) {
                lines.splice(idx, 0, next);
            }
            ok = true;
            return lines.join('\n');
        });
        return ok;
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

        const filePath = normalizePath(
            folder ? `${folder}/${DEFAULT_TASK_FILE}` : DEFAULT_TASK_FILE
        );
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            await this.app.vault.create(filePath, `${block}\n`);
            return;
        }

        await this.app.vault.process(file, (data) => appendBlock(data, block));
    }

    /**
     * Change some of a task's fields in place, keeping its indentation, list
     * marker, status char — and everything on the line the patch does not
     * name. Returns true on success.
     *
     * The patch is laid over the line as it is in the file now, not over the
     * line as it was when the dialog opened: a date stamped on it since, or a
     * tag typed by hand, is not the dialog's to undo.
     *
     * `details` is optional and, when given, replaces the indented block under
     * the line — description and attachments. Omitting it leaves whatever is
     * there alone, so a caller that only means to change the title cannot wipe
     * a description it never loaded.
     */
    async updateTaskInFile(
        filePath: string,
        lineNumber: number,
        patch: TaskPatch,
        expectedTitle: string,
        details?: TaskDetails
    ): Promise<boolean> {
        return this.patchLine(filePath, lineNumber, patch, expectedTitle, details);
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
     * `updateTaskInFile` without the title check, for the subtask editor, which
     * has never asked for one. Everything else about it is the same patch.
     */
    async updateLineExtras(
        filePath: string,
        lineNumber: number,
        patch: TaskPatch,
        details?: TaskDetails
    ): Promise<boolean> {
        return this.patchLine(filePath, lineNumber, patch, null, details);
    }

    private async patchLine(
        filePath: string,
        lineNumber: number,
        patch: TaskPatch,
        expectedTitle: string | null,
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
            // A stale number does not corrupt a neighbouring task, it rewrites
            // it — and with `details`, replaces its description too.
            if (expectedTitle !== null && !titlesMatch(m[3], expectedTitle)) return data;

            const [, prefix, char, body] = m;
            lines[idx] = `${prefix}[${char}] ${applyTaskPatch(body, patch)}`;
            ok = true;
            // The block is rewritten after the line, so the line's own indent —
            // which the block is measured against — is already the new one.
            return (details ? writeDetails(lines, idx, details) : lines).join('\n');
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
     * Through the same patch as every other edit, so it touches nothing else:
     * the timer stops on a line the user may be editing by hand.
     */
    async setSpentInFile(filePath: string, lineNumber: number, minutes: number): Promise<boolean> {
        return this.patchLine(filePath, lineNumber, { spentMinutes: minutes }, null);
    }

    /**
     * Remove a task and the lines that belong to it.
     *
     * `expectedTitle` is not a convenience, it is the safety catch, and it is
     * required so that no caller can quietly do without one. A line number is
     * a fact about the file as it was when it was last parsed, and this method
     * deletes the checkbox line AND its whole indented block — so if the note
     * has since gained a line somewhere above, an unchecked number takes out a
     * different task together with its description, silently, in a file the
     * user is not looking at. The window is small (the vault watcher re-parses
     * on change) and it is wide open exactly when it matters: a note being
     * edited in another pane, or a sync run that has just rewritten it.
     *
     * So the line has to still say what the user was shown before it is
     * destroyed. Comparing the parsed title rather than the raw line is what
     * makes that check survive the things that legitimately change without the
     * task changing — a due date being stamped, a priority marker moving.
     *
     * Returns false on a mismatch, which both callers already treat as "tell
     * them and re-read the file" — the right answer to "the note moved under
     * us".
     */
    async deleteTaskInFile(
        filePath: string,
        lineNumber: number,
        expectedTitle: string
    ): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;

        let ok = false;
        await this.app.vault.process(file, (data) => {
            const lines = data.split('\n');
            const idx = lineNumber - 1;
            if (idx < 0 || idx >= lines.length) return data;

            const parts = lines[idx].match(CHECKBOX_PARTS_RE);
            if (!parts) return data;
            if (!titlesMatch(parts[3], expectedTitle)) return data;

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
