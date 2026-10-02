import type { Task } from '../../../store/taskSlice';
import type { Translator } from '../../../core/i18n';
import { addDays } from './taskBuckets';

/**
 * What a task's row writes in its margin.
 *
 * The margin is the planner's: a narrow column left of the checkbox, so the
 * dates of a list read down as a column instead of hiding at the start of a
 * second line under every title. It says as little as the group around it
 * leaves unsaid — under "Today" only the hour, under "This week" the weekday,
 * further out the date — and in a list without groups it says the day in full.
 */
export interface MarginText {
    text: string;
    tone: 'overdue' | 'today' | 'plain' | 'closed';
}

const DAY_MS = 86_400_000;
const daysFrom = (today: string, iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);

const lower = (s: string, t: Translator) => s.toLocaleLowerCase(t.locale);

/** "12 окт", "Oct 12", "10月12日" — and the year, short, when it is not this one. */
export function shortDate(iso: string, today: string, t: Translator): string {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    const text = date
        .toLocaleDateString(t.locale, { day: 'numeric', month: 'short' })
        // "окт." — the abbreviation's full stop is noise in a column of them.
        .replace(/\.$/, '');
    return iso.slice(0, 4) === today.slice(0, 4) ? text : `${text} ’${iso.slice(2, 4)}`;
}

/** "пт", "Fri", "周五". */
function weekday(iso: string, t: Translator): string {
    return new Date(`${iso}T00:00:00`)
        .toLocaleDateString(t.locale, { weekday: 'short' })
        .replace(/\.$/, '');
}

/**
 * @param grouped Whether the row sits under a smart group, which already says
 *   "today" or "tomorrow" so the margin need not.
 */
export function marginText(task: Task, today: string, t: Translator, grouped: boolean): MarginText {
    if (task.status === 'done' || task.status === 'cancelled') {
        const closedOn = task.status === 'done' ? task.doneDate : task.cancelledDate;
        if (!closedOn) return { text: '', tone: 'closed' };
        const d = daysFrom(today, closedOn);
        const text =
            d === 0
                ? lower(t('date.today'), t)
                : d === -1
                  ? lower(t('date.yesterday'), t)
                  : shortDate(closedOn, today, t);
        return { text, tone: 'closed' };
    }

    if (!task.dueDate) return { text: '', tone: 'plain' };
    const d = daysFrom(today, task.dueDate);
    if (Number.isNaN(d)) return { text: '', tone: 'plain' };
    const time = task.dueTime ?? '';

    if (d < 0) {
        const text = d === -1 ? lower(t('date.yesterday'), t) : shortDate(task.dueDate, today, t);
        return { text, tone: 'overdue' };
    }
    if (d === 0) {
        return { text: time || (grouped ? '' : lower(t('date.today'), t)), tone: 'today' };
    }
    if (d === 1) {
        if (grouped) return { text: time, tone: 'plain' };
        return {
            text: [lower(t('date.tomorrow'), t), time].filter(Boolean).join(' '),
            tone: 'plain',
        };
    }
    if (task.dueDate <= addDays(today, 6)) {
        return { text: [weekday(task.dueDate, t), time].filter(Boolean).join(' '), tone: 'plain' };
    }
    return { text: shortDate(task.dueDate, today, t), tone: 'plain' };
}
