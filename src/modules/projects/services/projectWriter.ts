import { App, TFile, normalizePath } from 'obsidian';
import { translateNow } from '../../../core/i18n';
import type { Priority } from '../../../core/constants';
import type { ProjectStatus } from '../projectsTypes';

/**
 * What the form knows about a project.
 *
 * Every field the note carries, because the form asks for every field: a
 * project is created once a fortnight, not ten times a day, and the moment
 * someone is describing one is the only moment they have the whole thing in
 * their head.
 */
export interface ProjectInput {
    title: string;
    status: ProjectStatus;
    priority: Priority;
    startDate?: string;
    targetDate?: string;
    tags: string[];
    taskTags: string[];
    description?: string;
    color?: string;
    icon?: string;
}

/** Characters a file name cannot hold, on the strictest of the platforms. */
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;

/**
 * A title, as a file name.
 *
 * Replaced rather than rejected: a project called "Q3: launch" is a reasonable
 * thing to call a project, and refusing to create it because of a colon would
 * be the plugin defending the file system's feelings. The form shows the
 * result under the title field, so the substitution is never a surprise.
 *
 * Leading dots go too — a file starting with one is hidden on Unix and
 * invisible in Obsidian's own file tree.
 */
export function projectFileName(title: string, fallback: string): string {
    const cleaned = title
        .replace(ILLEGAL, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s]+/, '')
        .replace(/[.\s]+$/, '')
        .trim();
    return cleaned || fallback;
}

/**
 * The body a new project starts as.
 *
 * Two headings and one empty task, and the second heading is load-bearing: a
 * task written under it lives inside the project's note, which is the first
 * and least ambiguous of the rules that make a task the project's own. The
 * template is where that rule is taught.
 *
 * No `# Title` any more. It repeated the file name and the `title:` field, and
 * Obsidian already draws the note's name above the note.
 */
function projectBody(): string {
    return [
        `## ${translateNow('projects.template.about')}`,
        translateNow('projects.template.aboutHint'),
        '',
        `## ${translateNow('projects.template.tasks')}`,
        `- [ ] ${translateNow('projects.template.firstTask')}`,
        '',
    ].join('\n');
}

/**
 * Reading a project is `ProjectParser`'s job; writing one is this.
 *
 * Both halves go through `fileManager.processFrontMatter`, including the
 * creation half. Hand-built YAML was the alternative and it is the one that
 * loses data: a title with a colon in it, a description with a quote, a key
 * the user added by hand that a rewrite would drop. `processFrontMatter` hands
 * us the parsed object, keeps everything we do not touch, and serialises the
 * rest correctly — which is why the journal and the library already use it.
 */
export class ProjectWriter {
    constructor(private readonly app: App) {}

    /**
     * Create the note and fill it in.
     *
     * The file lands with its body first and its fields immediately after,
     * rather than being assembled as one string, so that creating a project
     * and editing one are the same code path — and a bug in how a colour is
     * serialised cannot exist in one and not the other.
     */
    async create(folderPath: string, input: ProjectInput): Promise<TFile> {
        const folder = normalizePath((folderPath || '').trim().replace(/\/+$/, ''));
        if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
        }

        const base = projectFileName(input.title, translateNow('projects.template.title'));
        let path = normalizePath(folder ? `${folder}/${base}.md` : `${base}.md`);
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(path)) {
            path = normalizePath(
                folder ? `${folder}/${base} ${counter}.md` : `${base} ${counter}.md`
            );
            counter++;
        }

        const file = await this.app.vault.create(path, projectBody());
        await this.update(file, input);
        return file;
    }

    /** Write the fields onto an existing note, leaving its body alone. */
    async update(file: TFile, input: ProjectInput): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            fm.title = input.title.trim();
            fm.status = input.status;
            fm.priority = input.priority;

            // Absent is absent. Writing `targetDate: null` would leave a key
            // whose value reads as a date that failed to parse rather than as
            // a deadline nobody set.
            setOrDelete(fm, 'startDate', input.startDate);
            setOrDelete(fm, 'targetDate', input.targetDate);
            setOrDelete(fm, 'description', input.description);
            setOrDelete(fm, 'color', input.color);
            setOrDelete(fm, 'icon', input.icon);
            setListOrDelete(fm, 'tags', input.tags);
            setListOrDelete(fm, 'taskTags', input.taskTags);

            // `due`, `dueDate` and `target` are still READ, by projects that
            // were written before anything in Zenith wrote this field — see
            // `ProjectParser`. They are not carried forward: leaving one
            // behind next to a `targetDate` we just set is how a note ends up
            // stating two deadlines and the parser picking one of them.
            for (const stale of ['due', 'dueDate', 'target']) {
                if (stale in fm) delete fm[stale];
            }
        });
    }

    /** The one field a card can change without opening the form. */
    async setStatus(file: TFile, status: ProjectStatus): Promise<void> {
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            fm.status = status;
        });
    }
}

function setOrDelete(fm: Record<string, unknown>, key: string, value?: string): void {
    const trimmed = value?.trim();
    if (trimmed) fm[key] = trimmed;
    else if (key in fm) delete fm[key];
}

function setListOrDelete(fm: Record<string, unknown>, key: string, values: string[]): void {
    const cleaned = values.map((v) => v.replace(/^#/, '').trim()).filter(Boolean);
    if (cleaned.length > 0) fm[key] = cleaned;
    else if (key in fm) delete fm[key];
}
