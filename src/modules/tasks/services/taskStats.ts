import type { SubTask, Task } from '../../../store/taskSlice';
import { TASK_STATUSES } from '../../../core/constants';
import type { TaskStatus } from '../../../core/constants';
import { daysBetweenIso as daysBetween } from '../../../core/dateUtils';

export type StatsRange = 'week' | 'month' | 'year' | 'all';

/** Done/total across a task's whole subtask tree. */
export interface SubtaskTally {
    done: number;
    total: number;
}

/**
 * Recursively tally subtask completion.
 *
 * Cancelled counts as resolved alongside done: a cancelled subtask is a
 * decision, not outstanding work, and leaving it in the denominator makes a
 * finished task look permanently incomplete.
 */
export function countSubtasks(subs: SubTask[]): SubtaskTally {
    let done = 0;
    let total = 0;
    const walk = (arr: SubTask[]) => {
        for (const s of arr) {
            total++;
            if (s.status === 'done' || s.status === 'cancelled') done++;
            if (s.subtasks.length) walk(s.subtasks);
        }
    };
    walk(subs);
    return { done, total };
}

export interface TagCount {
    tag: string;
    count: number;
}

export interface HeatCell {
    date: string; // YYYY-MM-DD
    count: number;
}

export interface TaskStats {
    total: number; // non-cancelled tasks
    byStatus: Record<TaskStatus, number>;
    done: number;
    active: number; // todo + in-progress
    inProgress: number;
    overdue: number; // active with a past due date
    dueToday: number;
    progress: number; // 0..100
    byTag: TagCount[];
    completedInRange: number;
    activeDays: number; // distinct days with a completion in range
    streak: number; // consecutive days up to today with a completion
    avgOffsetDays: number | null; // mean(done - due); negative = finished early
    heatmap: HeatCell[]; // completions per day for the last 52 weeks
}

function rangeStart(range: StatsRange, today: string): string | null {
    if (range === 'all') return null;
    const d = new Date(`${today}T00:00:00`);
    if (range === 'week') d.setDate(d.getDate() - 7);
    else if (range === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
}

function iso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Compute the aggregate metrics shown in the Tasks stats panel. Pure: `today`
 * and `range` are injected so it's deterministic and unit-testable.
 */
export function computeTaskStats(tasks: Task[], today: string, range: StatsRange = 'year'): TaskStats {
    const start = rangeStart(range, today);

    const byStatus = { todo: 0, 'in-progress': 0, done: 0, cancelled: 0 } as Record<TaskStatus, number>;
    for (const s of TASK_STATUSES) byStatus[s] = 0;

    const tagCounts = new Map<string, number>();
    const completionsByDay = new Map<string, number>();
    let overdue = 0;
    let dueToday = 0;
    let offsetSum = 0;
    let offsetN = 0;
    let completedInRange = 0;

    for (const t of tasks) {
        byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;

        if (t.status !== 'cancelled') {
            for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }

        const isActive = t.status === 'todo' || t.status === 'in-progress';
        if (isActive && t.dueDate) {
            if (t.dueDate < today) overdue++;
            else if (t.dueDate === today) dueToday++;
        }

        if (t.status === 'done' && t.doneDate) {
            if (!start || t.doneDate >= start) {
                completedInRange++;
                completionsByDay.set(t.doneDate, (completionsByDay.get(t.doneDate) ?? 0) + 1);
            }
            if (t.dueDate) {
                offsetSum += daysBetween(t.dueDate, t.doneDate);
                offsetN++;
            }
        }
    }

    const total = tasks.filter((t) => t.status !== 'cancelled').length;
    const done = byStatus.done;
    const inProgress = byStatus['in-progress'];
    const active = byStatus.todo + inProgress;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    const byTag = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

    return {
        total,
        byStatus,
        done,
        active,
        inProgress,
        overdue,
        dueToday,
        progress,
        byTag,
        completedInRange,
        activeDays: completionsByDay.size,
        streak: computeStreak(completionsByDay, today),
        avgOffsetDays: offsetN > 0 ? Math.round((offsetSum / offsetN) * 10) / 10 : null,
        heatmap: buildHeatmap(completionsByDay, today),
    };
}

/** Consecutive days (ending today, or yesterday) that have ≥1 completion. */
function computeStreak(byDay: Map<string, number>, today: string): number {
    const cursor = new Date(`${today}T00:00:00`);
    // Allow the streak to be "alive" if today has none but yesterday does.
    if (!byDay.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (byDay.has(iso(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

/** One cell per day for the trailing 52 weeks (aligned so it ends today). */
function buildHeatmap(byDay: Map<string, number>, today: string): HeatCell[] {
    const cells: HeatCell[] = [];
    const end = new Date(`${today}T00:00:00`);
    const DAYS = 371; // 53 weeks
    const start = new Date(end);
    start.setDate(start.getDate() - (DAYS - 1));
    for (let i = 0; i < DAYS; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = iso(d);
        cells.push({ date: key, count: byDay.get(key) ?? 0 });
    }
    return cells;
}
