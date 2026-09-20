import type { Priority } from '../../core/constants';
import type { Task } from '../../store/taskSlice';

/**
 * The five states a project can be in, in the order the card's menu offers
 * them: the two that mean it is happening, then the three ways it can stop.
 */
export const PROJECT_STATUSES = [
    'active',
    'in-progress',
    'paused',
    'completed',
    'archived',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectStats {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    progressPercent: number;
    isOverdue: boolean;
    daysRemaining?: number;
}

export interface Project {
    /** Unique identifier, vault file path */
    id: string;
    /** Vault file path */
    filePath: string;
    /** File name */
    fileName: string;
    /**
     * Display title of the project.
     *
     * The file is the project's address and this is its name, and the two are
     * deliberately allowed to drift: tasks point at a project by wikilink, so
     * renaming the file to follow a retitled project would break the very
     * links that make those tasks its own. Renaming stays what it is in
     * Obsidian — a deliberate act in the file tree, which repairs links itself.
     */
    title: string;
    /** Current status */
    status: ProjectStatus;
    /** Priority marker */
    priority: Priority;
    /** Planned start date */
    startDate?: string;
    /**
     * Target completion date.
     *
     * Read from `targetDate`, `target`, `dueDate` or `due` — four spellings
     * that existed before anything wrote this field — and always written back
     * as `targetDate`, which is what every project in a real vault already
     * uses. There is no `due` alias on this object any more: one fact under
     * two names is how a card and a widget end up disagreeing about a deadline.
     */
    targetDate?: string;
    /** Associated tags */
    tags: string[];
    /**
     * Tags whose tasks belong to this project, stated by the user.
     *
     * The thing this replaced was a guess: any task sharing any tag with the
     * project was its task, minus a blacklist of `project`/`todo`/`task`
     * hardcoded in the parser to stop `#project` swallowing the vault. The
     * blacklist was the admission that the rule did not work — it caught
     * `#logistics → Flat Move` and, with the same confidence, filed a task
     * tagged `#sport` under a marathon that finished in September.
     *
     * So the guess became a declaration. Empty by default, including for
     * projects that have `tags`: what a project is filed under and what its
     * tasks are tagged with are two different questions, and answering the
     * second with the first is exactly the old mistake.
     */
    taskTags: string[];
    /** Short summary or description */
    description?: string;
    /** Custom accent color */
    color?: string;
    /** Lucide or Obsidian icon name */
    icon?: string;
    /** Last modified time */
    mtime?: number;
    /** Tasks belonging to or referencing this project */
    tasks: Task[];
    /** Computed stats */
    stats: ProjectStats;
}
