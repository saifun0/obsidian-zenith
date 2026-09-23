import type ZenithPlugin from '../../../main';
import type { EventSource, SourceEvent } from '../../../core/scheduler';
import type { NotificationRecord } from '../../../core/notifications/notificationState';
import { useZenithStore } from '../../../store';
import type { Task } from '../../../store/taskSlice';
import { featureEnabled } from '../../../core/features';
import { resolveLocale, translate, translatePlural } from '../../../core/i18n';
import { getTodayString, toLocalIsoDate } from '../../../core/dateUtils';
import { TaskWriter } from './taskWriter';

/**
 * Task reminders, told through the notification center.
 *
 * Two kinds, both from what is already in the notes:
 * - a task with a time (`⏰ 18:00`) is announced at that time, or a set number
 *   of minutes before it;
 * - once a morning, a summary of the day's tasks that have no time — the ones
 *   nothing else would ever mention — with how many are overdue.
 *
 * Nothing is scheduled that is not in a note, and nothing is kept that a note
 * could contradict: when a reminder comes due the task is looked up again, and
 * one done, moved or deleted since says nothing. From the notice a task can be
 * opened, snoozed, or marked done — through the same writer the list uses, so
 * a recurring task rolls over exactly as it would from a tick.
 */

export const TASK_SOURCE = 'tasks';

export interface TaskEvent extends SourceEvent {
    type: 'task' | 'digest';
    /** `YYYY-MM-DD` the event is for. */
    date: string;
    /** For `task`: which one, by the fields that identify it. */
    filePath?: string;
    title?: string;
    time?: string;
}

const open = (t: Task) => t.status !== 'done' && t.status !== 'cancelled';

/** Midnight of an ISO date plus `HH:MM`, as epoch ms. */
function at(iso: string, hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(`${iso}T00:00:00`);
    d.setHours(h, m, 0, 0);
    return d.getTime();
}

/**
 * The reminder for every open task with a time, `beforeMinutes` early, that
 * falls in `[from, to)`. Keyed by the occurrence — date, time, note and title —
 * so the same task moved to another day is a new reminder, and one reminded
 * already is not reminded twice.
 */
export function taskEvents(
    tasks: readonly Task[],
    from: number,
    to: number,
    beforeMinutes: number
): TaskEvent[] {
    const out: TaskEvent[] = [];
    for (const task of tasks) {
        if (!open(task) || !task.dueDate || !task.dueTime) continue;
        const when = at(task.dueDate, task.dueTime) - beforeMinutes * 60_000;
        if (when < from || when >= to) continue;
        out.push({
            key: `task:${task.dueDate}T${task.dueTime}:${task.filePath}:${task.title}`,
            at: when,
            type: 'task',
            date: task.dueDate,
            filePath: task.filePath,
            title: task.title,
            time: task.dueTime,
        });
    }
    return out;
}

/** The morning summary for each day whose `hour` falls in `[from, to)`. */
export function digestEvents(from: number, to: number, hour: number): TaskEvent[] {
    if (hour < 0) return [];
    const out: TaskEvent[] = [];
    const first = new Date(from);
    for (let i = 0; i < 8; i++) {
        const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, hour);
        const when = day.getTime();
        if (when >= to) break;
        if (when < from) continue;
        const date = toLocalIsoDate(day);
        out.push({ key: `tasks-digest:${date}`, at: when, type: 'digest', date });
    }
    return out;
}

/** What the summary says about a day: its tasks with no time, and what is overdue. */
export function digestCounts(
    tasks: readonly Task[],
    date: string
): { today: number; overdue: number } {
    let today = 0;
    let overdue = 0;
    for (const task of tasks) {
        if (!open(task) || !task.dueDate) continue;
        if (task.dueDate === date && !task.dueTime) today++;
        else if (task.dueDate < date) overdue++;
    }
    return { today, overdue };
}

/** The task a reminder is about, as the notes have it now — or nothing, if it is gone or done. */
export function findTask(
    tasks: readonly Task[],
    ref: { filePath?: string; title?: string; date?: string; time?: string }
): Task | undefined {
    return tasks.find(
        (t) =>
            open(t) &&
            t.filePath === ref.filePath &&
            t.title === ref.title &&
            (ref.date === undefined || t.dueDate === ref.date) &&
            (ref.time === undefined || t.dueTime === ref.time)
    );
}

export class TaskReminderService implements EventSource<TaskEvent> {
    readonly id = TASK_SOURCE;
    private disposers: Array<() => void> = [];

    constructor(private readonly plugin: ZenithPlugin) {}

    start(): void {
        this.disposers.push(this.plugin.scheduler.register(this));
        this.disposers.push(
            this.plugin.notifications.registerActions(TASK_SOURCE, {
                complete: (record) => this.complete(record),
            })
        );
        const reschedule = () => this.plugin.scheduler.reschedule();
        // A task gaining a time, losing one, or being ticked off moves the next
        // reminder — as does any of the settings below.
        this.disposers.push(
            useZenithStore.subscribe((s) => s.tasks, reschedule),
            useZenithStore.subscribe(
                (s) =>
                    [
                        featureEnabled(s.settings, 'tasks.reminders'),
                        s.settings.taskRemindBefore,
                        s.settings.taskDigestHour,
                    ].join('|'),
                reschedule
            )
        );
    }

    stop(): void {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    events(from: number, to: number): TaskEvent[] {
        const { settings, tasks } = useZenithStore.getState();
        if (!featureEnabled(settings, 'tasks.reminders')) return [];
        return [
            ...taskEvents(tasks, from, to, settings.taskRemindBefore),
            ...digestEvents(from, to, settings.taskDigestHour),
        ];
    }

    deliver(event: TaskEvent, late: boolean): void {
        const { settings, tasks } = useZenithStore.getState();
        const locale = resolveLocale(settings.language);

        if (event.type === 'digest') {
            // Yesterday's summary is not news; today's, read at nine instead of
            // eight, still is — and is shown as current, not as missed.
            if (late && event.date !== getTodayString()) return;
            const { today, overdue } = digestCounts(tasks, event.date);
            if (!today && !overdue) return;
            const parts = [
                today ? translatePlural(locale, 'tasks.digest.today', today) : '',
                overdue ? translatePlural(locale, 'tasks.digest.overdue', overdue) : '',
            ].filter(Boolean);
            this.plugin.notifications.notify(
                {
                    key: event.key,
                    source: TASK_SOURCE,
                    title: translate(locale, 'tasks.digest.title'),
                    body: parts.join(' · '),
                    at: event.at,
                    open: { module: 'tasks' },
                },
                false
            );
            return;
        }

        // Looked up again: a task done or moved since the reminder was aimed
        // has nothing to be reminded of.
        const task = findTask(tasks, event);
        if (!task || !event.time) return;
        const minutesLeft = Math.round((at(event.date, event.time) - Date.now()) / 60_000);
        this.plugin.notifications.notify(
            {
                key: event.key,
                source: TASK_SOURCE,
                title: task.title,
                body:
                    minutesLeft > 0 && !late
                        ? translate(locale, 'tasks.remind.in', {
                              minutes: minutesLeft,
                              time: event.time,
                          })
                        : translate(locale, 'tasks.remind.at', { time: event.time }),
                at: event.at,
                open: { path: task.filePath, line: task.lineNumber },
                completable: true,
            },
            late
        );
    }

    /** "Done" from a notice: the task as the notes have it now, ticked through the writer. */
    private async complete(record: NotificationRecord): Promise<boolean> {
        const path = record.open && 'path' in record.open ? record.open.path : undefined;
        const task = findTask(useZenithStore.getState().tasks, {
            filePath: path,
            title: record.title,
        });
        if (!task) return false;
        return new TaskWriter(this.plugin.app).setStatusInFile(
            task.filePath,
            task.lineNumber,
            'done',
            task.title
        );
    }
}
