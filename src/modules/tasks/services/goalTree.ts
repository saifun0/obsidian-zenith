import type { TaskStatus } from '../../../core/constants';
import type { SubTask, Task } from '../../../store/taskSlice';

/**
 * Goals, as a tree: each goal at the top, and under it what has to be done to
 * reach it — and under each of those, what that needs in turn.
 *
 * A goal is a task with the goal tag (`#goal`, or `#goal/…`). What hangs under
 * a task is of two kinds, and both are things the note itself says:
 *
 * - its subtasks, written indented under it — the step is in the same note;
 * - the tasks its `⛔` names by their `🆔` — the Tasks plugin's way of saying
 *   "this waits on that", which reaches into any note.
 *
 * Every task in the tree is read the same way, so a step can have steps of
 * its own, to any depth. A task two goals need is under both. A loop of `⛔`
 * — A waits on B, B waits on A — is cut where it would come round again, and
 * a `⛔` naming an id no task has is passed over.
 *
 * Pure: tasks in, tree out. Drawing it is `GoalTree`; writing it is the
 * task writer, through `goalActions`.
 */

/** A task or a subtask, as the tree uses it: something with a line in a note. */
interface Item {
    title: string;
    status: TaskStatus;
    filePath: string;
    lineNumber: number;
    dueDate?: string;
    ref?: string;
    needs?: string[];
    subtasks: SubTask[];
    /** The task's own record, when the item is a task rather than a subtask. */
    task?: Task;
    /** The subtask's own record, when it is one — for its editor. */
    sub?: SubTask;
}

export interface GoalNode {
    /** Unique in the tree: the lines from the goal down to this one. */
    key: string;
    title: string;
    status: TaskStatus;
    filePath: string;
    lineNumber: number;
    dueDate?: string;
    /** How it hangs from the node above: a goal has none above it. */
    via: 'goal' | 'subtask' | 'link';
    /** Its `🆔`, if it has one. */
    ref?: string;
    /** Its `⛔`, as written — what unlinking takes an id out of. */
    needs: string[];
    /** The task's record, when it is a task and not a subtask. */
    task?: Task;
    /** The subtask's record, when it is one. */
    sub?: SubTask;
    children: GoalNode[];
    /**
     * The steps at the bottom of it — itself, when it has none — that are
     * done, and that count. A step that was given up counts for neither: it
     * is not going to be done, and it is not in the way.
     */
    done: number;
    total: number;
}

const closed = (status: TaskStatus) => status === 'done' || status === 'cancelled';
const lineKey = (item: { filePath: string; lineNumber: number }) =>
    `${item.filePath}:${item.lineNumber}`;

/** Does this task carry the goal tag? Without regard to case, and nested ones too. */
export function isGoal(task: { tags: string[] }, goalTag: string): boolean {
    const want = goalTag.replace(/^#/, '').trim().toLowerCase();
    if (!want) return false;
    return task.tags.some((tag) => {
        const have = tag.replace(/^#/, '').toLowerCase();
        return have === want || have.startsWith(`${want}/`);
    });
}

const fromTask = (task: Task): Item => ({
    title: task.title,
    status: task.status,
    filePath: task.filePath,
    lineNumber: task.lineNumber,
    dueDate: task.dueDate,
    ref: task.ref,
    needs: task.needs,
    subtasks: task.subtasks,
    task,
});

const fromSub = (sub: SubTask, filePath: string): Item => ({
    title: sub.title,
    status: sub.status,
    filePath,
    lineNumber: sub.lineNumber,
    ref: sub.ref,
    needs: sub.needs,
    subtasks: sub.subtasks,
    sub,
});

/** Every task and subtask that has a `🆔`, by it. The first one to claim an id keeps it. */
function byRef(tasks: Task[]): Map<string, Item> {
    const refs = new Map<string, Item>();
    const claim = (item: Item) => {
        if (item.ref && !refs.has(item.ref)) refs.set(item.ref, item);
    };
    const walk = (subs: SubTask[], filePath: string) => {
        for (const sub of subs) {
            claim(fromSub(sub, filePath));
            walk(sub.subtasks, filePath);
        }
    };
    for (const task of tasks) {
        claim(fromTask(task));
        walk(task.subtasks, task.filePath);
    }
    return refs;
}

/** The goals and everything under them. Open goals first, by when they are due. */
export function buildGoals(tasks: Task[], goalTag: string): GoalNode[] {
    const refs = byRef(tasks);

    const grow = (item: Item, via: GoalNode['via'], path: string[]): GoalNode => {
        const here = lineKey(item);
        const trail = [...path, here];
        const children: GoalNode[] = [];
        for (const sub of item.subtasks) {
            children.push(grow(fromSub(sub, item.filePath), 'subtask', trail));
        }
        for (const id of item.needs ?? []) {
            const target = refs.get(id);
            // Nothing has that id, or the id leads back up the branch.
            if (!target || trail.includes(lineKey(target))) continue;
            children.push(grow(target, 'link', trail));
        }

        let done = 0;
        let total = 0;
        if (children.length > 0) {
            for (const child of children) {
                done += child.done;
                total += child.total;
            }
        } else if (item.status !== 'cancelled') {
            total = 1;
            done = item.status === 'done' ? 1 : 0;
        }

        return {
            key: trail.join('>'),
            title: item.title,
            status: item.status,
            filePath: item.filePath,
            lineNumber: item.lineNumber,
            dueDate: item.dueDate,
            via,
            ref: item.ref,
            needs: item.needs ?? [],
            task: item.task,
            sub: item.sub,
            children,
            done,
            total,
        };
    };

    return tasks
        .filter((task) => isGoal(task, goalTag))
        .map((task) => grow(fromTask(task), 'goal', []))
        .sort((a, b) => {
            if (closed(a.status) !== closed(b.status)) return closed(a.status) ? 1 : -1;
            const due = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
            return due !== 0 ? due : a.title.localeCompare(b.title);
        });
}

/** The goals that are still open — what the tally counts. */
export function openGoals(tasks: Task[], goalTag: string): number {
    return tasks.filter((task) => isGoal(task, goalTag) && !closed(task.status)).length;
}

/**
 * A new `🆔`, unlike any in use: six letters and digits, the way the Tasks
 * plugin makes them. `random` is there for the tests.
 */
export function newRef(tasks: Task[], random: () => number = Math.random): string {
    const used = new Set(byRef(tasks).keys());
    const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (;;) {
        let id = '';
        for (let i = 0; i < 6; i++) id += letters[Math.floor(random() * letters.length)];
        if (!used.has(id)) return id;
    }
}
