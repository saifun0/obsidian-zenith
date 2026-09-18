import type { Priority } from '../../core/constants';
import type { Task } from '../../store/taskSlice';

export type ProjectStatus = 'active' | 'in-progress' | 'completed' | 'paused' | 'archived';

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
    /** Display title of the project */
    title: string;
    /** Current status */
    status: ProjectStatus;
    /** Priority marker */
    priority: Priority;
    /** Planned start date */
    startDate?: string;
    /** Target completion / deadline date */
    targetDate?: string;
    /** Due date alias for targetDate */
    due?: string;
    /** Associated tags */
    tags: string[];
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
