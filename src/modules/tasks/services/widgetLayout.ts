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
 * Each preset is a different composition rather than the same one cropped:
 * `sm` is one urgency-ordered list, `md` is two labelled columns, `lg` is
 * labelled groups with subtasks and a summary strip along the bottom.
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
    /** A group/column label with the gap that follows it. */
    label: number;
    foot: number;
    stats: number;
    /** Checkbox edge. */
    box: number;
    /** `lg` alone has room for subtasks, tags and recurrence. */
    detailed: boolean;
}

export const METRICS: Record<WidgetSize, Metrics> = {
    sm: { task: 32, sub: 24, more: 20, gap: 10, gapExpanded: 6, area: 7, head: 24, label: 0, foot: 17, stats: 0, box: 16, detailed: false },
    md: { task: 32, sub: 24, more: 20, gap: 5, gapExpanded: 4, area: 7, head: 28, label: 16, foot: 17, stats: 0, box: 16, detailed: false },
    lg: { task: 38, sub: 28, more: 22, gap: 3, gapExpanded: 3, area: 10, head: 32, label: 29, foot: 17, stats: 46, box: 18, detailed: true },
};

/** Height of the load bar under the heading. */
export const LOAD_H = 3;

/** Gap between the week strip and the figures beside it. */
export const STATS_GAP = 24;

/** Gap between two figures. */
export const FIGURE_GAP = 26;

/** Widths of the week strip's cells: an ordinary day, today, and the overdue tally. */
export const WEEK_CELL = 30;
export const WEEK_TODAY = 42;
export const WEEK_OVERDUE = 46;
/** Days the strip looks ahead, today included. */
export const WEEK_DAYS = 7;

/**
 * How wide the week strip wants to be.
 *
 * Computed rather than measured on purpose. The strip is allowed to compress as
 * a last resort on a very narrow card, and measuring it once it has done so
 * would report a width that already gave way — the figures beside it would then
 * look affordable, nothing would be dropped, and the week would be squeezed to
 * unreadable stubs to pay for them. Deciding against the width it *wants* keeps
 * that from happening.
 */
export function weekWidth(hasOverdue: boolean): number {
    return WEEK_TODAY + WEEK_CELL * (WEEK_DAYS - 1) + (hasOverdue ? WEEK_OVERDUE : 0);
}

/**
 * Figures of the bottom strip, in the order they are given up when the card is
 * too narrow to hold them all.
 *
 * Redundancy decides the order, not importance: the heading already leads with
 * the active count and what is overdue, so those cost width to repeat a line
 * the eye has just passed. What the heading never says is kept longest — and
 * the day's outcome, what got finished and what got dropped, is the part that
 * only exists here. "In progress" isn't offered at all: it was the plainest
 * duplicate of the heading.
 */
export const FIGURE_DROP_ORDER = ['active', 'overdue', 'cancelled', 'subtasks', 'nextDue', 'done'] as const;

/**
 * Which figures fit the width there is.
 *
 * Widths are measured from what the browser actually drew rather than guessed
 * from the label text: they depend on the theme's font and on the language, and
 * a guess that is wrong by a few px clips the last figure — the bug this
 * exists to prevent. An unmeasured figure counts as zero and is kept, so a
 * first pass shows everything and the pass after it is exact.
 */
export function fitFigures(
    keys: string[],
    widths: Record<string, number>,
    available: number,
    gap: number = FIGURE_GAP
): string[] {
    // Only measured figures are costed — including the gaps, or a strip that
    // has not been measured yet would price six gaps against a width of zero
    // and drop everything before it ever got drawn.
    const total = (ks: string[]): number => {
        const known = ks.filter((k) => widths[k] !== undefined);
        return known.reduce((n, k) => n + widths[k], 0) + gap * Math.max(0, known.length - 1);
    };

    let kept = [...keys];
    for (const key of FIGURE_DROP_ORDER) {
        if (total(kept) <= available) break;
        kept = kept.filter((k) => k !== key);
    }
    return kept;
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
    /** The single list (`sm`) or the left column (`md`). */
    lines: Line[];
    /** The right column (`md` only). */
    lines2: Line[];
    /** Labelled groups (`lg` only); null on the flat presets. */
    groups: Group[] | null;
    /** Column labels; the second is empty when it continues the first. */
    columns: [GroupKey | '', GroupKey | ''] | null;
    /** Tasks that did not fit — the honest number behind "+N more". */
    hidden: number;
    /** Vertical gap the rendered rows must use for the maths to hold. */
    gap: number;
}

export interface PlanInput {
    split: Split;
    size: WidgetSize;
    /** Measured usable height of the card, in px. */
    available: number;
    /** Id of the task whose subtasks are open, if any. */
    expanded: string | null;
}

export function planWidget({ split, size, available, expanded }: PlanInput): Plan {
    const m = METRICS[size];
    const gap = expanded !== null ? m.gapExpanded : m.gap;

    const blockFor = (task: Task, withSubs: boolean): Line[] => {
        const lines: Line[] = [{ kind: 'task', key: task.id, task, height: m.task }];
        if (!withSubs) return lines;
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

    /** Take tasks in order while they fit; count the ones that don't. */
    const fit = (items: Task[], budget: number, into: Line[]): number => {
        let used = 0;
        let dropped = 0;
        for (const task of items) {
            const block = blockFor(task, expanded === task.id);
            const cost = blockHeight(block) + (used > 0 ? gap : 0);
            if (used + cost > budget) {
                dropped++;
                continue;
            }
            used += cost;
            into.push(...block);
        }
        return dropped;
    };

    /** The expanded task floats up, so its subtasks are never the part cut. */
    const floatExpanded = (items: Task[]): Task[] =>
        expanded === null
            ? items
            : [...items].sort((a, b) => Number(b.id === expanded) - Number(a.id === expanded));

    const lines: Line[] = [];
    const lines2: Line[] = [];
    const empty: Plan = { lines, lines2, groups: null, columns: null, hidden: 0, gap };

    if (split.active.length === 0) return empty;

    if (size === 'sm') {
        const ordered = floatExpanded([...split.burning, ...split.doing, ...split.next]);
        const free = available - m.head - LOAD_H - 2 * m.area;
        let hidden = fit(ordered, free, lines);
        if (hidden > 0) {
            // Something overflowed, so the footer has to be paid for — and that
            // changes what fits. Lay out again against the smaller box.
            lines.length = 0;
            hidden = fit(ordered, free - m.foot - m.area, lines);
        }
        return { ...empty, hidden };
    }

    if (size === 'md') {
        const cols: Array<{ label: GroupKey | ''; items: Task[] }> = [];
        let hidden = 0;
        if (split.burning.length) cols.push({ label: 'today', items: split.burning });
        if (split.doing.length) cols.push({ label: 'doing', items: split.doing });
        if (split.next.length && cols.length < 2) cols.push({ label: 'next', items: split.next });
        else hidden += split.next.length;

        // A single long group reads better down two columns than truncated in
        // one: the second column continues it and repeats no label.
        if (cols.length === 1 && cols[0].items.length > 3) {
            const all = cols[0].items;
            cols[0] = { label: cols[0].label, items: all.slice(0, 3) };
            cols.push({ label: '', items: all.slice(3, 6) });
            hidden += Math.max(0, all.length - 6);
        }

        // The footer is reserved whether or not it appears, so the two columns
        // are the same height in every state.
        const budget = available - m.head - LOAD_H - m.foot - 3 * m.area - m.label - gap;
        hidden += fit(floatExpanded(cols[0]?.items ?? []), budget, lines);
        hidden += fit(floatExpanded(cols[1]?.items ?? []), budget, lines2);
        return {
            ...empty,
            hidden,
            columns: [cols[0]?.label ?? '', cols[1]?.label ?? ''],
        };
    }

    const build = (budget: number): { groups: Group[]; dropped: number } => {
        let left = budget;
        let dropped = 0;
        const out: Group[] = [];
        const section = (label: GroupKey, items: Task[], withSubs: boolean) => {
            if (items.length === 0) return;
            const collected: Line[] = [];
            for (const task of items) {
                const block = blockFor(task, withSubs);
                let cost = block.reduce((n, l) => n + l.height, 0) + m.gap * block.length;
                // A label costs a row too, so headings can't crowd out the tasks
                // they head — the first task of a group pays for it.
                if (collected.length === 0) cost += m.label + (out.length > 0 ? m.area : 0);
                if (cost > left) {
                    dropped++;
                    continue;
                }
                left -= cost;
                collected.push(...block);
            }
            if (collected.length) out.push({ label, count: items.length, lines: collected });
        };
        if (split.burning.length) {
            section('today', split.burning, true);
            section('doing', split.doing, true);
            section('next', split.next, false);
        } else {
            section('doing', split.doing, true);
            section('next', split.next, true);
        }
        return { groups: out, dropped };
    };

    const free = available - m.head - LOAD_H - m.stats - 3 * m.area;
    let built = build(free);
    if (built.dropped > 0) built = build(free - m.foot - m.area);
    return {
        ...empty,
        groups: built.groups.length ? built.groups : null,
        hidden: built.dropped,
    };
}
