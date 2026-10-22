import type { Priority, TaskStatus } from '../core/constants';
import type { TaskAttachment, WeekCount, WeekLog } from '../modules/tasks/services/taskDetails';
import type { TaskQuota } from '../modules/tasks/services/taskFormat';
import type { ZenithSliceCreator } from './types';

// ── Task Types ───────────────────────────────────────

/**
 * Everything a subtask can carry beyond its title.
 *
 * Shared with `Task` rather than duplicated: the user asked for the same four
 * things at both levels, and one interface is what keeps an editor, a writer or
 * a timer from quietly supporting only one of them.
 */
export interface TaskExtras {
    /** Hour of the day it is due, `HH:MM`. Qualifies `dueDate`. */
    dueTime?: string;
    /**
     * Hour it ends at, `HH:MM` — the `-10:30` of `⏰ 09:00-10:30`.
     *
     * Always after `dueTime` (the parser drops anything else), and absent for a
     * task that only states when it starts. The calendar's hour grid falls back
     * to `timerMinutes` and then to a default slot, so an absent end never
     * means "no duration" — it means the note didn't say.
     */
    dueEndTime?: string;
    /** Minutes spent on it so far, accumulated across sessions. */
    spentMinutes?: number;
    /** Minutes the countdown was last set to. */
    timerMinutes?: number;
    /** Free text from the indented block under the line. */
    description?: string;
    /** Images, notes, links and other tasks, from the same block. */
    attachments?: TaskAttachment[];
    /**
     * The Tasks plugin's `🆔`: what other tasks call this one by. A goal names
     * its steps in other notes this way (`goalTree`).
     */
    ref?: string;
    /** The Tasks plugin's `⛔`: the ids of the tasks this one waits on. */
    needs?: string[];
    /** `🎯` — what it asks for, hours or times, in all or a week (`taskHours`). */
    target?: TaskQuota;
    /** `🔢` — the times done, of a target that is a count. */
    tally?: number;
    /** The hours of each week, for a task that asks for so many a week. */
    weeks?: WeekLog[];
    /** The times of each week, for a task that asks for so many times a week. */
    counts?: WeekCount[];
}

export interface SubTask extends TaskExtras {
    title: string;
    status: TaskStatus;
    completed: boolean;
    lineNumber: number;
    /** Its own day, `📅` — a step of a goal has one of its own more often than not. */
    dueDate?: string;
    /** Nested subtasks (a subtask can have its own subtasks, recursively). */
    subtasks: SubTask[];
}

export interface Task extends TaskExtras {
    id: string;
    /**
     * The goal this row is a step of, when it is one written under a goal and
     * brought into the list for its day (`goalSteps`). It is a subtask's line,
     * not a task's: it is not reordered from the list.
     */
    goal?: string;
    /**
     * A goal's weekly habit, listed under today until its week is done. The
     * day is where the list puts it, not one it was given: the editor opens it
     * with none.
     */
    habit?: boolean;
    title: string;
    /** 4-state status derived from the checkbox char. */
    status: TaskStatus;
    /** Convenience flag: `status === 'done'`. */
    completed: boolean;
    priority: Priority;
    tags: string[];
    dueDate?: string;
    startDate?: string;
    scheduledDate?: string;
    /** Completion date (from ✅), set automatically when marked done. */
    doneDate?: string;
    /** The day it was given up on (from ❌), set automatically when cancelled. */
    cancelledDate?: string;
    /** Recurrence rule text (e.g. "weekly", "every 3 days"). */
    recurrence?: string;
    subtasks: SubTask[];
    filePath: string;
    lineNumber: number;
    description?: string;
    createdAt: string;
}

// ── Task Slice ───────────────────────────────────────

export interface TaskSlice {
    tasks: Task[];
    tasksLoading: boolean;

    setTasks: (tasks: Task[]) => void;
    /**
     * Swap in the tasks of a single file, dropping whatever that file had
     * before. Lets a vault change re-read one file instead of the whole folder.
     */
    replaceTasksForFile: (filePath: string, tasks: Task[]) => void;
    addTask: (task: Task) => void;
    toggleTask: (id: string) => void;
    setTaskStatus: (id: string, status: TaskStatus) => void;
    removeTask: (id: string) => void;
    setTasksLoading: (loading: boolean) => void;
    /**
     * The task list is being put in order by hand. On a touch screen the
     * handles to drag by are hidden until this is asked for: a row swipes,
     * and a handle on every row read as clutter. Not saved — it is a mode,
     * not a preference.
     */
    taskReorderMode: boolean;
    setTaskReorderMode: (on: boolean) => void;
    /**
     * A task the list has been asked to show, by its `detailKey` — from the
     * dashboard's subtasks dialog, say. The list turns to it, scrolls to it
     * and clears this. Not saved: it is a request, not a state.
     */
    taskFocus: string | null;
    setTaskFocus: (key: string | null) => void;
    /** The goals' tree, asked for by its command: the list turns to it and clears this. */
    goalsAsked: boolean;
    setGoalsAsked: (on: boolean) => void;
}

export const createTaskSlice: ZenithSliceCreator<TaskSlice> = (set) => ({
    tasks: [],
    tasksLoading: false,

    replaceTasksForFile: (filePath, tasks) =>
        set((state) => ({
            tasks: [...state.tasks.filter((t) => t.filePath !== filePath), ...tasks],
        })),

    setTasks: (tasks) => set(() => ({ tasks })),

    addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),

    toggleTask: (id) =>
        set((state) => ({
            tasks: state.tasks.map((t) => {
                if (t.id !== id) return t;
                const completed = !t.completed;
                return { ...t, completed, status: completed ? 'done' : 'todo' };
            }),
        })),

    setTaskStatus: (id, status) =>
        set((state) => ({
            tasks: state.tasks.map((t) =>
                t.id === id ? { ...t, status, completed: status === 'done' } : t
            ),
        })),

    removeTask: (id) =>
        set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== id),
        })),

    setTasksLoading: (loading) => set(() => ({ tasksLoading: loading })),

    taskReorderMode: false,
    setTaskReorderMode: (on) => set(() => ({ taskReorderMode: on })),

    taskFocus: null,
    setTaskFocus: (key) => set(() => ({ taskFocus: key })),

    goalsAsked: false,
    setGoalsAsked: (on) => set(() => ({ goalsAsked: on })),
});
