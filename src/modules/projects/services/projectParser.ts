import { App, TFile } from 'obsidian';
import { VaultService, toIsoDate, toStringArray } from '../../../services/vaultService';
import type { Task } from '../../../store/taskSlice';
import type { Priority } from '../../../core/constants';
import type { Project, ProjectStatus } from '../projectsTypes';
import { computeProjectStats } from './projectStats';

export function normalizeProjectStatus(raw: unknown): ProjectStatus {
    if (typeof raw !== 'string') return 'active';
    const s = raw.trim().toLowerCase().replace(/_/g, '-');
    if (['in-progress', 'inprogress', 'progress', 'doing', 'working'].includes(s)) return 'in-progress';
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
 * Filter tasks that belong to a given project:
 * 1. Tasks located directly inside the project file.
 * 2. Tasks referencing the project via wikilink [[Project Title]] or [[filePath]].
 * 3. Tasks tagged with one of the project's tags.
 */
export function filterTasksForProject(
    project: Project,
    allTasks: Task[]
): Task[];
export function filterTasksForProject(
    allTasks: Task[],
    project: Project
): Task[];
export function filterTasksForProject(
    filePath: string,
    title: string,
    tags: string[],
    allTasks: Task[]
): Task[];
export function filterTasksForProject(
    arg1: unknown,
    arg2: unknown,
    arg3?: unknown,
    arg4?: unknown
): Task[] {
    let filePath = '';
    let title = '';
    let tags: string[] = [];
    let allTasks: Task[] = [];

    if (arg1 && typeof arg1 === 'object' && 'filePath' in arg1) {
        const p = arg1 as Project;
        filePath = p.filePath;
        title = p.title;
        tags = p.tags;
        allTasks = (arg2 as Task[]) ?? [];
    } else if (arg2 && typeof arg2 === 'object' && 'filePath' in arg2) {
        const p = arg2 as Project;
        allTasks = (arg1 as Task[]) ?? [];
        filePath = p.filePath;
        title = p.title;
        tags = p.tags;
    } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        filePath = arg1;
        title = arg2;
        tags = (arg3 as string[]) ?? [];
        allTasks = (arg4 as Task[]) ?? [];
    }

    const titleLower = title.toLowerCase();
    const basename = filePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? '';
    const cleanTags = new Set(tags.map((t) => t.replace(/^#/, '').toLowerCase()));

    const seenIds = new Set<string>();
    const matched: Task[] = [];

    for (const task of allTasks) {
        if (seenIds.has(task.id)) continue;

        // 1. Located in the project file
        if (task.filePath === filePath) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 2. Wikilinks in task text
        const textLower = task.title.toLowerCase();
        const hasWiki =
            (titleLower && (textLower.includes(`[[${titleLower}]]`) || textLower.includes(`[[${titleLower}|`))) ||
            (basename && (textLower.includes(`[[${basename}]]`) || textLower.includes(`[[${basename}|`)));

        if (hasWiki) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 3. Attachments pointing to this note
        const hasAttachment = task.attachments?.some(
            (att) =>
                att.target.toLowerCase() === filePath.toLowerCase() ||
                (titleLower && att.target.toLowerCase() === titleLower) ||
                (basename && att.target.toLowerCase() === basename)
        );

        if (hasAttachment) {
            seenIds.add(task.id);
            matched.push(task);
            continue;
        }

        // 4. Matching tags (only if project has specific non-generic tags)
        if (cleanTags.size > 0 && task.tags.some((tt) => cleanTags.has(tt.replace(/^#/, '').toLowerCase()))) {
            const specificMatch = task.tags.some((tt) => {
                const t = tt.replace(/^#/, '').toLowerCase();
                return cleanTags.has(t) && !['project', 'projects', 'todo', 'task'].includes(t);
            });
            if (specificMatch) {
                seenIds.add(task.id);
                matched.push(task);
            }
        }
    }

    return matched;
}

export class ProjectParser {
    private vaultService: VaultService;

    constructor(app: App) {
        this.vaultService = new VaultService(app);
    }

    static parse(filePath: string, content: string, mtime = 0, allTasks: Task[] = []): Project {
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const fm: Record<string, unknown> = {};
        if (fmMatch) {
            const lines = fmMatch[1].split(/\r?\n/);
            let currentKey = '';
            for (const line of lines) {
                const listMatch = line.match(/^\s*-\s+(.+)$/);
                if (listMatch && currentKey) {
                    const arr = (fm[currentKey] as unknown[]) || [];
                    arr.push(listMatch[1].trim().replace(/^['"]|['"]$/g, ''));
                    fm[currentKey] = arr;
                    continue;
                }
                const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
                if (kvMatch) {
                    currentKey = kvMatch[1].trim();
                    const rawVal = kvMatch[2].trim();
                    if (!rawVal) {
                        fm[currentKey] = [];
                    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                        fm[currentKey] = rawVal
                            .slice(1, -1)
                            .split(',')
                            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
                    } else {
                        fm[currentKey] = rawVal.replace(/^['"]|['"]$/g, '');
                    }
                }
            }
        }
        const fileName = filePath.split('/').pop() || filePath;
        const base = fileName.replace(/\.md$/i, '');
        const title = (typeof fm.title === 'string' && fm.title.trim()) || base;
        const status = normalizeProjectStatus(fm.status);
        const priority = normalizeProjectPriority(fm.priority);
        const due =
            typeof fm.due === 'string'
                ? fm.due.trim()
                : typeof fm.targetDate === 'string'
                ? fm.targetDate.trim()
                : undefined;
        let tags: string[] = [];
        if (Array.isArray(fm.tags)) {
            tags = fm.tags.map(String);
        } else if (typeof fm.tags === 'string') {
            tags = [fm.tags];
        }
        const projectTasks = filterTasksForProject(filePath, title, tags, allTasks);
        const stats = computeProjectStats(projectTasks, due);
        return {
            id: filePath,
            filePath,
            fileName,
            title,
            status,
            priority,
            due,
            targetDate: due,
            tags,
            description: typeof fm.description === 'string' ? fm.description : undefined,
            color: typeof fm.color === 'string' ? fm.color : undefined,
            icon: typeof fm.icon === 'string' ? fm.icon : undefined,
            mtime,
            tasks: projectTasks,
            stats,
        };
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
        const title = (typeof fm.title === 'string' && fm.title.trim()) || file.basename;
        const status = normalizeProjectStatus(fm.status);
        const priority = normalizeProjectPriority(fm.priority);
        const startDate = toIsoDate(fm.startDate ?? fm.start);
        const targetDate = toIsoDate(fm.targetDate ?? fm.target ?? fm.dueDate ?? fm.due);
        const tags = toStringArray(fm.tags);
        const description = typeof fm.description === 'string' ? fm.description.trim() : undefined;
        const color = typeof fm.color === 'string' ? fm.color.trim() : undefined;
        const icon = typeof fm.icon === 'string' ? fm.icon.trim() : undefined;

        const projectTasks = filterTasksForProject(file.path, title, tags, allTasks);
        const stats = computeProjectStats(projectTasks, targetDate);

        return {
            id: file.path,
            filePath: file.path,
            fileName: file.name,
            title,
            status,
            priority,
            startDate,
            targetDate,
            due: targetDate,
            tags,
            description,
            color,
            icon,
            mtime: file.stat?.mtime ?? 0,
            tasks: projectTasks,
            stats,
        };
    }
}
