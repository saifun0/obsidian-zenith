import { App, TFile } from 'obsidian';
import {
    VaultService,
    toStringArray,
    toIsoDate,
    CHECKBOX_RE,
    CHECKBOX_ANY_RE,
} from '../../../services/vaultService';
import type { Task, SubTask } from '../../../store/taskSlice';
import { PRIORITIES, statusFromChar } from '../../../core/constants';
import type { Priority } from '../../../core/constants';
import { parseTaskText } from './taskFormat';
import { detailLines, parseDetails } from './taskDetails';

interface RawItem {
    text: string;
    statusChar: string;
    lineNumber: number; // 1-indexed
    parentLine: number; // 1-indexed line of the parent checkbox, or 0 if top-level
    /**
     * Indented, non-checkbox lines continuing this one — the detail block.
     * Read through the same helper the writer replaces it with, so a save can
     * never duplicate a block the reader had understood differently.
     */
    detail: string[];
}

interface FileDefaults {
    priority: Priority;
    dueDate?: string;
    tags: string[];
}

/**
 * Drop checkbox lines that carry no text.
 *
 * `- [ ]` on its own is scaffolding — the blank line a template leaves behind,
 * or the half-typed start of a task — not something to list. It reaches here
 * because the checkbox pattern's trailing `\s*` can backtrack and hand the
 * separating space to the title group, producing a task whose title trims to
 * nothing; a row with no text is indistinguishable from a bug.
 */
function withoutBlanks(items: RawItem[]): RawItem[] {
    return items.filter((item) => item.text.length > 0);
}

/**
 * Parse tasks from .md files in the configured tasks folder.
 *
 * Uses Obsidian's metadata cache for frontmatter + list-item structure (task
 * chars, line numbers, parent links → subtasks) when available, falling back to
 * a manual scan. The raw task text is read from the file so inline emoji
 * markers (priority, dates, recurrence) the cache doesn't understand are parsed.
 */
export class TaskParser {
    private vaultService: VaultService;

    constructor(private readonly app: App) {
        this.vaultService = new VaultService(app);
    }

    async parseTasks(folderPath: string): Promise<Task[]> {
        return this.parseFolders([folderPath]);
    }

    /**
     * Parse the tasks in several folders at once — the tasks folder plus, when
     * the journal module is on, the daily notes that captured tasks are written
     * into. Files are de-duplicated by path first: with one folder nested inside
     * the other, parsing a file twice would mint two tasks with the same
     * `path:line` id, and React would render one of them and drop the other.
     */
    async parseFolders(folderPaths: string[]): Promise<Task[]> {
        const seen = new Set<string>();
        const allTasks: Task[] = [];

        for (const folderPath of folderPaths) {
            if (!folderPath?.trim()) continue;
            for (const file of this.vaultService.getMarkdownFiles(folderPath)) {
                if (seen.has(file.path)) continue;
                seen.add(file.path);
                allTasks.push(...(await this.parseFile(file)));
            }
        }
        return allTasks;
    }

    /**
     * Parse one file's tasks.
     *
     * Split out from {@link parseTasks} so a vault change can re-read just the
     * file that changed instead of the whole folder — see `DataService`.
     */
    async parseFile(file: TFile): Promise<Task[]> {
        const frontmatter = await this.vaultService.getFrontmatter(file);
        const rawPriority = frontmatter.priority;
        const defaults: FileDefaults = {
            priority: PRIORITIES.includes(rawPriority as Priority)
                ? (rawPriority as Priority)
                : 'none',
            dueDate: toIsoDate(frontmatter.due),
            tags: toStringArray(frontmatter.tags),
        };

        const items = await this.collectItems(file);

        // Index children by their parent line so tasks can carry subtasks.
        const childrenByParent = new Map<number, RawItem[]>();
        for (const item of items) {
            if (item.parentLine > 0) {
                const list = childrenByParent.get(item.parentLine) ?? [];
                list.push(item);
                childrenByParent.set(item.parentLine, list);
            }
        }

        const tasks: Task[] = [];
        for (const item of items) {
            if (item.parentLine > 0) continue; // subtask, handled with its parent
            tasks.push(this.buildTask(file, item, childrenByParent, defaults));
        }
        return tasks;
    }

    /**
     * Collect all checkbox list-items (with parent links) for a file. Prefers the
     * metadata cache; falls back to a manual, indentation-based scan.
     *
     * The cache is only trusted when it **agrees with the file we just read**.
     * The two come from different places — the text from `cachedRead`, the
     * structure from `metadataCache` — and right after a write they can
     * disagree for a moment. Following a stale cache used to invent a task per
     * line that no longer existed (rendered as an empty row) and miss any line
     * that had just been added. Comparing the checkbox counts costs one pass
     * over the lines and makes that impossible; when they differ we derive
     * everything from the text instead, which is never stale.
     */
    private async collectItems(file: TFile): Promise<RawItem[]> {
        const content = await this.vaultService.readFileContent(file);
        const lines = content.split('\n');
        const listItems = this.vaultService.getMetadata(file)?.listItems;
        const cacheItems = listItems?.filter((li) => li.task !== undefined) ?? [];
        const fileCount = lines.reduce((n, line) => (CHECKBOX_ANY_RE.test(line) ? n + 1 : n), 0);

        if (cacheItems.length > 0 && cacheItems.length === fileCount) {
            // Which lines (0-indexed) are checkbox items — used to decide parenting.
            const taskLines = new Set(cacheItems.map((li) => li.position.start.line));
            const result: RawItem[] = [];
            for (const li of cacheItems) {
                const lineIdx = li.position.start.line; // 0-indexed
                const m = lines[lineIdx]?.match(CHECKBOX_RE);
                if (!m) continue;
                const parentIdx = li.parent; // 0-indexed line, negative if top-level
                const parentLine = parentIdx >= 0 && taskLines.has(parentIdx) ? parentIdx + 1 : 0;
                result.push({
                    text: m[2].trim(),
                    statusChar: m[1],
                    lineNumber: lineIdx + 1,
                    parentLine,
                    detail: detailLines(lines, lineIdx),
                });
            }
            return withoutBlanks(result);
        }

        // Cache cold or out of step — scan lines, inferring parents from indentation.
        const boxes = this.vaultService.parseCheckboxes(content);
        return withoutBlanks(
            this.scanByIndent(boxes).map((item) => ({
                ...item,
                detail: detailLines(lines, item.lineNumber - 1),
            }))
        );
    }

    /** Infer parent links from indentation for the fallback path. */
    private scanByIndent(
        boxes: Array<{ text: string; statusChar: string; indent: number; lineNumber: number }>
    ): RawItem[] {
        const stack: Array<{ indent: number; lineNumber: number }> = [];
        return boxes.map((box) => {
            while (stack.length && stack[stack.length - 1].indent >= box.indent) stack.pop();
            const parentLine = stack.length ? stack[stack.length - 1].lineNumber : 0;
            stack.push({ indent: box.indent, lineNumber: box.lineNumber });
            return {
                text: box.text,
                statusChar: box.statusChar,
                lineNumber: box.lineNumber,
                parentLine,
                detail: [],
            };
        });
    }

    /** Build a Task (with a recursive subtask tree) from a raw item + defaults. */
    private buildTask(
        file: TFile,
        item: RawItem,
        childrenByParent: Map<number, RawItem[]>,
        defaults: FileDefaults
    ): Task {
        const parsed = parseTaskText(item.text, defaults);
        const status = statusFromChar(item.statusChar);
        const details = parseDetails(item.detail);

        return {
            id: `${file.path}:${item.lineNumber}`,
            title: parsed.title,
            status,
            completed: status === 'done',
            priority: parsed.priority,
            tags: parsed.tags,
            dueDate: parsed.dueDate,
            dueTime: parsed.dueTime,
            dueEndTime: parsed.dueEndTime,
            spentMinutes: parsed.spentMinutes,
            timerMinutes: parsed.timerMinutes,
            description: details.description || undefined,
            attachments: details.attachments.length ? details.attachments : undefined,
            startDate: parsed.startDate,
            scheduledDate: parsed.scheduledDate,
            doneDate: parsed.doneDate,
            cancelledDate: parsed.cancelledDate,
            recurrence: parsed.recurrence,
            subtasks: this.buildSubtasks(childrenByParent, item.lineNumber),
            filePath: file.path,
            lineNumber: item.lineNumber,
            createdAt: new Date(file.stat.ctime).toISOString(),
        };
    }

    /** Recursively build the subtask tree for a given parent line. */
    private buildSubtasks(
        childrenByParent: Map<number, RawItem[]>,
        parentLine: number
    ): SubTask[] {
        const kids = childrenByParent.get(parentLine) ?? [];
        return kids.map((k) => {
            const status = statusFromChar(k.statusChar);
            // A subtask carries the same four extras a task does — the markers
            // and the block under it are read the same way at either level.
            const parsed = parseTaskText(k.text, { priority: 'none', tags: [] });
            const details = parseDetails(k.detail);
            return {
                title: parsed.title,
                status,
                completed: status === 'done',
                lineNumber: k.lineNumber,
                dueTime: parsed.dueTime,
            dueEndTime: parsed.dueEndTime,
                spentMinutes: parsed.spentMinutes,
                timerMinutes: parsed.timerMinutes,
                description: details.description || undefined,
                attachments: details.attachments.length ? details.attachments : undefined,
                subtasks: this.buildSubtasks(childrenByParent, k.lineNumber),
            };
        });
    }
}
