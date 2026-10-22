import type { TaskStatus } from '../../../core/constants';
import type { SubTask, Task } from '../../../store/taskSlice';
import type { WeekStart } from '../../../core/calendarDates';
import type { WeekCount, WeekLog } from './taskDetails';
import { shiftIsoDate, type TaskQuota } from './taskFormat';
import { amountTowards } from './taskHours';

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
 * its own, to any depth: a step with steps under it is a stage, one without
 * is a task to do. A task two goals need is under both. A loop of `⛔` — A
 * waits on B, B waits on A — is cut where it would come round again, and a
 * `⛔` naming an id no task has is passed over.
 *
 * How far along a node is, is said twice. Its count is of the steps right
 * under it, closed by hand — "1/2" is one of its two stages ticked off. Its
 * progress reaches all the way down: each step under it is an equal share of
 * it, and each step's share is as far along as that step is — so a goal moves
 * with every small thing done under it, before any stage is closed. Nothing
 * is closed by its steps: a node whose steps are all done is only `ready`.
 *
 * A task that asks for hours (`🎯`) is a step like any other, as far along as
 * its hours are: fifty of a hundred is half its share. One that asks for so
 * many a week is a habit, not a step — it never ends — so it stands in the
 * tree with its week's hours and is left out of every count above it, which
 * would otherwise fall back each Monday. A goal or a stage may ask for hours
 * in all itself — "three hundred hours of C++" — and then it is as far along
 * as all the time put in under it, the habits' included.
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
    dueTime?: string;
    ref?: string;
    needs?: string[];
    target?: TaskQuota;
    spentMinutes?: number;
    timerMinutes?: number;
    weeks?: WeekLog[];
    tally?: number;
    counts?: WeekCount[];
    doneDate?: string;
    cancelledDate?: string;
    createdDate?: string;
    subtasks: SubTask[];
    /** The task's own record, when the item is a task rather than a subtask. */
    task?: Task;
    /** The subtask's own record, when it is one — for its editor. */
    sub?: SubTask;
}

/**
 * A project a step stands for: its title links to the project's note, and it
 * is as far along as the project's tasks (`projectGoals`).
 */
export interface LinkedProject {
    title: string;
    filePath: string;
    done: number;
    total: number;
}

export interface GoalNode {
    /** Unique in the tree: the lines from the goal down to this one. */
    key: string;
    /**
     * What its fold is remembered by: its note and the names from the goal
     * down to it. Not its line, which moves as the note is written.
     */
    foldKey: string;
    title: string;
    status: TaskStatus;
    filePath: string;
    lineNumber: number;
    dueDate?: string;
    dueTime?: string;
    /** What it asks for, hours or times, and what has been put in (`taskHours`). */
    target?: TaskQuota;
    spentMinutes?: number;
    weeks?: WeekLog[];
    tally?: number;
    counts?: WeekCount[];
    /** The time put in on it and on everything under it, in minutes. */
    hoursUnder: number;
    /** The times done on it and on everything under it. */
    countUnder: number;
    /** The countdown its line carries, for a timer started from the tree. */
    timerMinutes?: number;
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
     * The steps right under it that are done, and that count. A step that was
     * given up counts for neither: it is not going to be done, and it is not
     * in the way.
     */
    done: number;
    total: number;
    /** How far along it is, 0 to 1, with everything under it counted in shares. */
    progress: number;
    /** Open, with steps under it, and every one of them done: it can be closed. */
    ready: boolean;
    /** The first task still to do under it, in the order the tree reads. */
    next?: GoalNode;
    /** The project it stands for, when its title links to one and nothing is written under it. */
    project?: LinkedProject;
    /**
     * The last day anything is known to have happened on it or under it: a
     * step closed or given up (`✅`, `❌`), one written (`➕`), the week of
     * hours or times put in — read as that week's last day, for the line
     * says the week and not the day. None, when nothing says.
     */
    lastMoved?: string;
    /** A goal's area, from its tag: `#goal/здоровье` → "Здоровье". */
    area?: string;
}

const closed = (status: TaskStatus) => status === 'done' || status === 'cancelled';

/**
 * The area a goal is filed under: the first part of its tag after the goal
 * tag — `#goal/здоровье`, `#goal/здоровье/сон` → "Здоровье" — or none, for a
 * goal tagged `#goal` alone.
 */
export function goalArea(tags: readonly string[], goalTag: string): string | undefined {
    const want = goalTag.replace(/^#/, '').trim().toLowerCase();
    if (!want) return undefined;
    for (const tag of tags) {
        const have = tag.replace(/^#/, '');
        if (!have.toLowerCase().startsWith(`${want}/`)) continue;
        const name = have.slice(want.length + 1).split('/')[0].replace(/[-_]+/g, ' ').trim();
        if (name) return name.charAt(0).toLocaleUpperCase() + name.slice(1);
    }
    return undefined;
}
/** A step that asks for hours or times every week: a habit, counted by none of the nodes above it. */
const isHabit = (node: { target?: TaskQuota }) => !!node.target?.weekly;
/** The last day a line itself says something happened on it. */
function movedOn(item: Item): string | undefined {
    const days = [item.doneDate, item.cancelledDate, item.createdDate];
    for (const w of item.weeks ?? []) days.push(shiftIsoDate(w.start, 6));
    for (const w of item.counts ?? []) days.push(shiftIsoDate(w.start, 6));
    let last: string | undefined;
    for (const day of days) if (day && (!last || day > last)) last = day;
    return last;
}

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
    dueTime: task.dueTime,
    ref: task.ref,
    needs: task.needs,
    target: task.target,
    spentMinutes: task.spentMinutes,
    timerMinutes: task.timerMinutes,
    weeks: task.weeks,
    tally: task.tally,
    counts: task.counts,
    doneDate: task.doneDate,
    cancelledDate: task.cancelledDate,
    createdDate: task.createdDate,
    subtasks: task.subtasks,
    task,
});

const fromSub = (sub: SubTask, filePath: string): Item => ({
    title: sub.title,
    status: sub.status,
    filePath,
    lineNumber: sub.lineNumber,
    dueDate: sub.dueDate,
    dueTime: sub.dueTime,
    ref: sub.ref,
    needs: sub.needs,
    target: sub.target,
    spentMinutes: sub.spentMinutes,
    timerMinutes: sub.timerMinutes,
    weeks: sub.weeks,
    tally: sub.tally,
    counts: sub.counts,
    doneDate: sub.doneDate,
    cancelledDate: sub.cancelledDate,
    createdDate: sub.createdDate,
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

/**
 * The goals and everything under them. Open goals first, by when they are due.
 *
 * `linked` says which project a step's title names, if any: such a step,
 * with nothing written under it, is as far along as that project's tasks.
 */
export function buildGoals(
    tasks: Task[],
    goalTag: string,
    linked?: (title: string) => LinkedProject | undefined
): GoalNode[] {
    const refs = byRef(tasks);

    const grow = (item: Item, via: GoalNode['via'], path: string[], names: string[]): GoalNode => {
        const trail = [...path, lineKey(item)];
        const titles = [...names, item.title];
        const children: GoalNode[] = [];
        for (const sub of item.subtasks) {
            children.push(grow(fromSub(sub, item.filePath), 'subtask', trail, titles));
        }
        for (const id of item.needs ?? []) {
            const target = refs.get(id);
            // Nothing has that id, or the id leads back up the branch.
            if (!target || trail.includes(lineKey(target))) continue;
            children.push(grow(target, 'link', trail, titles));
        }

        const project = via !== 'goal' && children.length === 0 ? linked?.(item.title) : undefined;
        const counted = children.filter((child) => child.status !== 'cancelled' && !isHabit(child));
        const done = counted.filter((child) => child.status === 'done').length;
        const total = counted.length;
        const hoursUnder =
            (item.spentMinutes ?? 0) + children.reduce((sum, child) => sum + child.hoursUnder, 0);
        const countUnder =
            (item.tally ?? 0) + children.reduce((sum, child) => sum + child.countUnder, 0);
        // Asking for hours or times in all, it is as far along as they are —
        // whatever is under it.
        const inAll = item.target && !item.target.weekly ? item.target.amount : 0;
        const putIn = item.target?.count ? countUnder : hoursUnder;
        const progress =
            item.status === 'done'
                ? 1
                : inAll
                  ? Math.min(1, putIn / inAll)
                  : project
                    ? project.total > 0
                        ? project.done / project.total
                        : 0
                    : total > 0
                      ? counted.reduce((sum, child) => sum + child.progress, 0) / total
                      : 0;
        let lastMoved = movedOn(item);
        for (const child of children) {
            if (child.lastMoved && (!lastMoved || child.lastMoved > lastMoved)) {
                lastMoved = child.lastMoved;
            }
        }
        // Standing for a project, it is ready when the project's tasks are all done.
        const projectDone = !!project && project.total > 0 && project.done === project.total;

        let next: GoalNode | undefined;
        if (!closed(item.status)) {
            for (const child of children) {
                if (closed(child.status) || isHabit(child)) continue;
                next = child.children.length > 0 ? child.next : child;
                if (next) break;
            }
        }
        const allIn = inAll > 0 && putIn >= inAll;

        return {
            key: trail.join('>'),
            foldKey: `${item.filePath}::${titles.join(' > ')}`,
            title: item.title,
            status: item.status,
            filePath: item.filePath,
            lineNumber: item.lineNumber,
            dueDate: item.dueDate,
            dueTime: item.dueTime,
            target: item.target,
            spentMinutes: item.spentMinutes,
            weeks: item.weeks,
            tally: item.tally,
            counts: item.counts,
            hoursUnder,
            countUnder,
            timerMinutes: item.timerMinutes,
            via,
            ref: item.ref,
            needs: item.needs ?? [],
            task: item.task,
            sub: item.sub,
            children,
            done,
            total,
            progress,
            // Asking for hours or times, it is ready when they are in; otherwise when its steps are.
            ready:
                !closed(item.status) &&
                (inAll ? allIn : project ? projectDone : total > 0 && done === total),
            next,
            project,
            lastMoved,
        };
    };

    return tasks
        .filter((task) => isGoal(task, goalTag))
        .map((task) => ({
            ...grow(fromTask(task), 'goal', [], []),
            area: goalArea(task.tags, goalTag),
        }))
        .sort((a, b) => {
            if (closed(a.status) !== closed(b.status)) return closed(a.status) ? 1 : -1;
            const due = (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
            return due !== 0 ? due : a.title.localeCompare(b.title);
        });
}

/**
 * The tasks without the goals: what the list and the dashboard's card show.
 * A goal is not a thing to do today; its steps are. Those written as tasks of
 * their own and tied under it stay in the list; those written under it, as
 * its subtasks, go with it into the tree.
 */
export function withoutGoals<T extends { tags: string[] }>(tasks: T[], goalTag: string): T[] {
    return tasks.filter((task) => !isGoal(task, goalTag));
}

/** Where the week is, for the habits: today, and the day weeks start on. */
export interface WeekNow {
    today: string;
    weekStart: WeekStart;
}

/**
 * The steps of the goals that have a day, as rows for the list: the goals are
 * not in it, and a step with a day is a thing to do on that day, like any
 * task. Only what is written under a goal — a tied task is in the list as
 * itself already — and only what is open, under nothing closed. A step with
 * a day carries its own steps along, so none of those is listed twice.
 *
 * With `now`, the habits too — the steps that ask for hours or times a week — under
 * today, every day until the week's hours are in: they are where the time is
 * put in, and the list is where one looks every day.
 */
export function goalSteps(tasks: Task[], goalTag: string, now?: WeekNow): Task[] {
    const rows: Task[] = [];
    const walk = (subs: SubTask[], goal: Task) => {
        for (const sub of subs) {
            if (closed(sub.status)) continue;
            if (sub.dueDate) rows.push(asTask(sub, goal));
            else if (now && sub.target?.weekly) {
                if (amountTowards(sub, now.today, now.weekStart) < sub.target.amount) {
                    rows.push({ ...asTask(sub, goal), dueDate: now.today, habit: true });
                }
            } else walk(sub.subtasks, goal);
        }
    };
    for (const task of tasks) {
        if (isGoal(task, goalTag) && !closed(task.status)) walk(task.subtasks, task);
    }
    return rows;
}

/** A subtask as a list row of its own, saying which goal it is a step of. */
function asTask(sub: SubTask, goal: Task): Task {
    return {
        ...sub,
        id: `${goal.filePath}:${sub.lineNumber}`,
        priority: 'none',
        tags: [],
        filePath: goal.filePath,
        lineNumber: sub.lineNumber,
        createdAt: goal.createdAt,
        goal: goal.title,
    };
}

/**
 * What the list and the dashboard's card show: every task but the goals, and
 * the goals' steps that have a day — and, with `now`, their habits.
 */
export function listedTasks(tasks: Task[], goalTag: string, now?: WeekNow): Task[] {
    return [...withoutGoals(tasks, goalTag), ...goalSteps(tasks, goalTag, now)];
}

/** Days of quiet before a goal says so. */
export const QUIET_DAYS = 14;

/**
 * The whole weeks a goal has been quiet, from its `lastMoved` to `today` —
 * or nothing, when it moved in the last two weeks, is closed, or says nothing
 * of when it moved at all.
 */
export function quietWeeks(goal: GoalNode, today: string): number | null {
    if (closed(goal.status) || !goal.lastMoved) return null;
    const last = goal.lastMoved < today ? goal.lastMoved : today;
    const days = Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000
    );
    return days >= QUIET_DAYS ? Math.floor(days / 7) : null;
}

/** The habits under a node — the open steps that ask for hours or times a week — in the order of the tree. */
export function habitsUnder(node: GoalNode): GoalNode[] {
    const out: GoalNode[] = [];
    const walk = (nodes: GoalNode[]) => {
        for (const child of nodes) {
            if (closed(child.status)) continue;
            if (isHabit(child)) out.push(child);
            walk(child.children);
        }
    };
    walk(node.children);
    return out;
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
