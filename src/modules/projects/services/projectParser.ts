import { App, TFile } from 'obsidian';
import { VaultService, toIsoDate, toStringArray } from '../../../services/vaultService';
import type { Task } from '../../../store/taskSlice';
import type { Priority } from '../../../core/constants';
import type { Project, ProjectStatus } from '../projectsTypes';
import { computeProjectStats } from './projectStats';
import { linkNamesProject } from './projectLink';

export function normalizeProjectStatus(raw: unknown): ProjectStatus {
    if (typeof raw !== 'string') return 'active';
    const s = raw.trim().toLowerCase().replace(/_/g, '-');
    if (['in-progress', 'inprogress', 'progress', 'doing', 'working'].includes(s))
        return 'in-progress';
    if (['done', 'completed', 'finished'].includes(s)) return 'completed';
    if (['paused', 'hold', 'on-hold', 'waiting'].includes(s)) return 'paused';
    if (['archived', 'archive', 'closed'].includes(s)) return 'archived';
    return 'active';
}

export function normalizeProjectPriority(raw: unknown): Priority {
    if (typeof raw !== 'string') return 'none';
    const p = raw.trim().toLowerCase();
    if (['urgent', 'highest', 'p1'].includes(p)) return 'urgent';
    if (['high', 'p2'].includes(p)) return 'high';
    if (['low', 'lowest', 'p4'].includes(p)) return 'low';
    if (['medium', 'normal', 'p3'].includes(p)) return 'medium';
    return 'none';
}

/**
 * The tasks that belong to a project.
 *
 * Four rules, and the difference between them is the whole design. Three are
 * statements the task itself makes — it lives in the project's note, it names
 * the project in its text, or it links to the note from its detail block —
 * and the fourth is a statement the PROJECT makes, in `taskTags`, about which
 * tags mean it.
 *
 * What is gone is the rule that was nobody's statement: any shared tag counted,
 * minus a blacklist of `project`/`todo`/`task` written into this function to
 * stop `#project` from swallowing the vault. A rule that needs a blacklist of
 * its own worst cases is a rule that is guessing, and it guessed both ways —
 * correctly filing a task tagged `#logistics` under a house move, and just as
 * confidently filing one tagged `#sport` under a marathon that had finished.
 *
 * Takes the project rather than four loose arguments. It used to accept three
 * different argument shapes through overloads — including the project first
 * and the project second — which is two orders of the same call, told apart at
 * runtime by sniffing for a `filePath` property.
 */
export function filterTasksForProject(project: Project, allTasks: Task[]): Task[] {
    const titleLower = project.title.toLowerCase();
    const basename = project.filePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? '';
    const claimed = new Set(
        project.taskTags.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean)
    );

    const seenIds = new Set<string>();
    const matched: Task[] = [];

    for (const task of allTasks) {
        if (seenIds.has(task.id)) continue;

        // 1. Written inside the project's own note.
        if (task.filePath === project.filePath) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 2. Names the project in its text, by title or by file name.
        const textLower = task.title.toLowerCase();
        const hasWiki =
            (titleLower &&
                (textLower.includes(`[[${titleLower}]]`) ||
                    textLower.includes(`[[${titleLower}|`))) ||
            (basename &&
                (textLower.includes(`[[${basename}]]`) || textLower.includes(`[[${basename}|`)));

        if (hasWiki) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 3. Links to the note from its detail block. The same predicate the
        //    task editor uses to work out which project is already chosen —
        //    see `linkNamesProject`, which is where the three spellings of a
        //    link to a note are decided once.
        const hasAttachment = task.attachments?.some(
            (att) => att.kind === 'note' && linkNamesProject(att.target, project)
        );

        if (hasAttachment) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 4. Carries a tag the project has claimed.
        if (
            claimed.size > 0 &&
            task.tags.some((tt) => claimed.has(tt.replace(/^#/, '').toLowerCase()))
        ) {
            seenIds.add(task.id);
            matched.push(task);
        }
    }

    return matched;
}

export class ProjectParser {
    private vaultService: VaultService;

    constructor(app: App) {
        this.vaultService = new VaultService(app);
    }

    async parseProjects(folderPath: string, allTasks: Task[]): Promise<Project[]> {
        const files = this.vaultService.getMarkdownFiles(folderPath);
        const projects: Project[] = [];
        for (const file of files) {
            const project = await this.parseFile(file, allTasks);
            if (project) projects.push(project);
        }
        return projects;
    }

    async parseFile(file: TFile, allTasks: Task[]): Promise<Project | null> {
        const fm = await this.vaultService.getFrontmatter(file);
        return projectFromFrontmatter(
            fm,
            { path: file.path, name: file.name, basename: file.basename, mtime: file.stat?.mtime ?? 0 },
            allTasks
        );
    }
}

/**
 * A project from its note's properties, as Obsidian parsed them.
 *
 * The one way a project is read. There used to be a second, with a YAML
 * reader of its own that knew only flat `key: value` lines and lists — it was
 * what the tests exercised, while notes went through this one, so the tests
 * could pass while the plugin read a note differently.
 */
export function projectFromFrontmatter(
    fm: Record<string, unknown>,
    file: { path: string; name: string; basename: string; mtime: number },
    allTasks: Task[]
): Project {
    const title = (typeof fm.title === 'string' && fm.title.trim()) || file.basename;
    const status = normalizeProjectStatus(fm.status);
    const priority = normalizeProjectPriority(fm.priority);
    const startDate = toIsoDate(fm.startDate ?? fm.start);
    const targetDate = toIsoDate(fm.targetDate ?? fm.target ?? fm.dueDate ?? fm.due);
    const tags = toStringArray(fm.tags);
    const taskTags = toStringArray(fm.taskTags);
    const description = typeof fm.description === 'string' ? fm.description.trim() : undefined;
    const color = typeof fm.color === 'string' ? fm.color.trim() : undefined;
    const icon = typeof fm.icon === 'string' ? fm.icon.trim() : undefined;

    const project: Project = {
        id: file.path,
        filePath: file.path,
        fileName: file.name,
        title,
        status,
        priority,
        startDate,
        targetDate,
        tags,
        taskTags,
        description,
        color,
        icon,
        mtime: file.mtime,
        tasks: [],
        stats: computeProjectStats([], targetDate),
    };

    project.tasks = filterTasksForProject(project, allTasks);
    project.stats = computeProjectStats(project.tasks, targetDate);
    return project;
}
