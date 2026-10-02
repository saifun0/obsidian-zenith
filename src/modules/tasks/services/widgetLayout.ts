import type { SubTask, Task } from '../../../store/taskSlice';
import type { WidgetSize } from '../../dashboard/grid/gridTypes';

/**
 * What fits in the tasks card, and in what shape.
 *
 * The card is not allowed to scroll — an overview you have to scroll is just a
 * short list with extra steps — so something has to decide what is left out and
 * say so honestly in the "+N more" link. That decision is arithmetic on row
 * heights against the height the card actually has, which makes it worth
 * keeping out of the component and under test.
 *
 * `sm` is the three most urgent tasks and nothing else. `md` and `lg` are the
 * same composition at two sizes: labelled groups — due now, in progress, up
 * next — over the day's progress, `md` stopping at five tasks. Subtasks stay
 * folded behind their tally everywhere, and one task at a time opens.
 */

/** Row heights and spacing, in px, per preset. */
export interface Metrics {
    task: number;
    sub: number;
    more: number;
    /** Gap between task blocks; tighter while a block is expanded. */
    gap: number;
    gapExpanded: number;
    /** Gap between the card's own blocks (heading, list, footer). */
    area: number;
    head: number;
    /** A group label with the gap that follows it. */
    label: number;
    foot: number;
    /** The day's progress along the bottom; none on `sm`. */
    stats: number;
    /** Checkbox edge. */
    box: number;
    /** Room for tags and the repeat beside a title. */
    tags: boolean;
    /** Tasks shown at most, however tall the card is. */
    cap: number;
}

export const METRICS: Record<WidgetSize, Metrics> = {
    sm: { task: 30, sub: 24, more: 20, gap: 6, gapExpanded: 4, area: 8, head: 24, label: 0, foot: 17, stats: 0, box: 16, tags: false, cap: 3 },
    md: { task: 30, sub: 24, more: 20, gap: 3, gapExpanded: 3, area: 8, head: 26, label: 22, foot: 17, stats: 40, box: 16, tags: false, cap: 5 },
    lg: { task: 34, sub: 26, more: 22, gap: 3, gapExpanded: 3, area: 10, head: 28, label: 24, foot: 17, stats: 44, box: 17, tags: true, cap: Infinity },
};

/**
 * The day's progress, for the ink line along the bottom of the card: what was
 * closed today out of what today asked for — closed today, plus what is still
 * due today or already late. Null on a day that asked for nothing.
 */
export function dayProgress(split: Split): { done: number; total: number } | null {
    const done = split.doneToday;
    const total = done + split.burning.length;
    return total > 0 ? { done, total } : null;
}

/** Subtasks previewed per task before the rest collapse into a link. */
export const SUB_PREVIEW = 2;

/**
 * Usable height assumed until the card has been measured.
 *
 * The grid's row height is user-configurable, so the real figure is whatever
 * the card turns out to be — but a first paint against a plausible height beats
 * one against zero, which would render an empty list for a frame.
 */
export const NOMINAL_H: Record<WidgetSize, number> = { sm: 190, md: 190, lg: 460 };

const DAY_MS = 86_400_000;

/** Whole days from `today` to `date`; negative once the date has passed. */
export function daysUntil(date: string, today: string): number {
    return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/** The ISO date `offset` days after `today`. */
export function isoOf(today: string, offset: number): string {
    return new Date(Date.parse(`${today}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Incomplete subtasks — the only ones worth previewing. */
export const openSubs = (task: Task): SubTask[] =>
    task.subtasks.filter((s) => s.status !== 'done' && s.status !== 'cancelled');

export interface Split {
    active: Task[];
    /** Due today or already past — the only tasks that can be "burning". */
    burning: Task[];
    /** Started, and not burning. */
    doing: Task[];
    /** Not started, not burning, soonest first. */
    next: Task[];
    overdue: number;
    dueToday: number;
    inProgress: number;
    /** Finished today, and given up on today. */
    doneToday: number;
    cancelledToday: number;
}

export function splitTasks(tasks: Task[], today: string): Split {
    const active = tasks.filter((t) => t.status === 'todo' || t.status === 'in-progress');
    const burning = active.filter((t) => t.dueDate !== undefined && daysUntil(t.dueDate, today) <= 0);
    const rest = active.filter((t) => !burning.includes(t));
    const doing = rest.filter((t) => t.status === 'in-progress');
    // A task with no due date sorts last: '9' is past any ISO year we can store.
    const next = rest
        .filter((t) => t.status === 'todo')
        .sort((a, b) => ((a.dueDate ?? '9') < (b.dueDate ?? '9') ? -1 : 1));
    const overdue = burning.filter((t) => daysUntil(t.dueDate as string, today) < 0).length;
    return {
        active,
        burning,
        doing,
        next,
        overdue,
        dueToday: burning.length - overdue,
        inProgress: doing.length + burning.filter((t) => t.status === 'in-progress').length,
        // Only tasks carrying the day's stamp can be counted — ✅ for finished,
        // ❌ for given up on. One closed by hand without a marker simply doesn't
        // show up here, which is the price of keeping the count in the notes
        // rather than in a database of our own.
        doneToday: tasks.filter((t) => t.status === 'done' && t.doneDate === today).length,
        cancelledToday: tasks.filter((t) => t.status === 'cancelled' && t.cancelledDate === today)
            .length,
    };
}

/** Which group a run of rows belongs to. Translated at render time. */
export type GroupKey = 'today' | 'doing' | 'next';

export type Line =
    | { kind: 'task'; key: string; task: Task; height: number }
    | { kind: 'sub'; key: string; task: Task; sub: SubTask; height: number }
    | { kind: 'more'; key: string; count: number; height: number };

export interface Group {
    label: GroupKey;
    count: number;
    lines: Line[];
}

export interface Plan {
    /** The flat list of `sm`; empty on the grouped presets. */
    lines: Line[];
    /** Labelled groups (`md`, `lg`); null on `sm` and on an empty day. */
    groups: Group[] | null;
    /** Tasks that did not fit — the honest number behind "+N more". */
    hidden: number;
    /** Vertical gap the rendered rows must use for the maths to hold. */
    gap: number;
}

/**
 * The card's fixed furniture, as it was actually drawn.
 *
 * `METRICS` says what the heading and the bottom strip are *expected* to cost,
 * and both depend on things this file cannot see: the theme's font and the
 * language of the labels. Neither height depends on what this function
 * decides, which is what makes measuring them safe.
 */
export interface Chrome {
    /** Drawn height of the heading block, in px. Zero falls back to METRICS. */
    head?: number;
    /** Drawn height of the bottom strip, including its rule. */
    stats?: number;
}

export interface PlanInput {
    split: Split;
    size: WidgetSize;
    /** Measured usable height of the card, in px. */
    available: number;
    /** Id of the task whose subtasks are open, if any. */
    expanded: string | null;
    /** What the card's own furniture turned out to cost. See `Chrome`. */
    chrome?: Chrome;
}

export function planWidget({ split, size, available, expanded, chrome }: PlanInput): Plan {
    const metrics = METRICS[size];
    // A measurement of zero is "not measured yet", never "takes no room".
    const m: Metrics = {
        ...metrics,
        head: chrome?.head && chrome.head > 0 ? chrome.head : metrics.head,
        stats: chrome?.stats && chrome.stats > 0 ? chrome.stats : metrics.stats,
    };
    const gap = expanded !== null ? m.gapExpanded : m.gap;

    /** A task, and its open subtasks when it is the one opened. */
    const blockFor = (task: Task): Line[] => {
        const lines: Line[] = [{ kind: 'task', key: task.id, task, height: m.task }];
        if (expanded !== task.id) return lines;
        const open = openSubs(task);
        for (const sub of open.slice(0, SUB_PREVIEW)) {
            lines.push({ kind: 'sub', key: `${task.id}:${sub.lineNumber}`, task, sub, height: m.sub });
        }
        const rest = open.length - Math.min(open.length, SUB_PREVIEW);
        if (rest > 0) lines.push({ kind: 'more', key: `${task.id}:more`, count: rest, height: m.more });
        return lines;
    };

    const blockHeight = (lines: Line[]): number =>
        lines.reduce((n, l) => n + l.height, 0) + gap * (lines.length - 1);

    const empty: Plan = { lines: [], groups: null, hidden: 0, gap };
    if (split.active.length === 0) return empty;

    if (size === 'sm') {
        // The opened task floats up, so its subtasks are never the part cut.
        const ordered = [...split.burning, ...split.doing, ...split.next].sort(
            (a, b) => Number(b.id === expanded) - Number(a.id === expanded)
        );
        const fit = (budget: number): { lines: Line[]; hidden: number } => {
            const lines: Line[] = [];
            let used = 0;
            let shown = 0;
            for (const task of ordered) {
                const block = blockFor(task);
                const cost = blockHeight(block) + (used > 0 ? gap : 0);
                if (shown >= m.cap || used + cost > budget) continue;
                used += cost;
                shown++;
                lines.push(...block);
            }
            return { lines, hidden: ordered.length - shown };
        };
        const free = available - m.head - 2 * m.area;
        let plan = fit(free);
        // Something was left out, so the "+N more" link has to be paid for —
        // and that changes what fits. Lay out again against the smaller box.
        if (plan.hidden > 0) plan = fit(free - m.foot - m.area);
        return { ...empty, lines: plan.lines, hidden: plan.hidden };
    }

    const build = (budget: number): { groups: Group[]; dropped: number } => {
        let left = budget;
        let dropped = 0;
        let shown = 0;
        const out: Group[] = [];
        const section = (label: GroupKey, items: Task[]) => {
            if (items.length === 0) return;
            const collected: Line[] = [];
            for (const task of items) {
                const block = blockFor(task);
                let cost = block.reduce((n, l) => n + l.height, 0) + gap * block.length;
                // A label costs a row too, so a heading never crowds out the
                // tasks under it: the first task of a group pays for it.
                if (collected.length === 0) cost += m.label + (out.length > 0 ? m.area : 0);
                if (shown >= m.cap || cost > left) {
                    dropped++;
                    continue;
                }
                left -= cost;
                shown++;
                collected.push(...block);
            }
            if (collected.length) out.push({ label, count: items.length, lines: collected });
        };
        section('today', split.burning);
        section('doing', split.doing);
        section('next', split.next);
        return { groups: out, dropped };
    };

    const free = available - m.head - m.stats - 3 * m.area;
    let built = build(free);
    if (built.dropped > 0) built = build(free - m.foot - m.area);
    return {
        ...empty,
        groups: built.groups.length ? built.groups : null,
        hidden: built.dropped,
    };
}
