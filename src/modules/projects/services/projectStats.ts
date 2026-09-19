import type { Task } from '../../../store/taskSlice';
import type { Translator } from '../../../core/i18n';
import type { Project, ProjectStats } from '../projectsTypes';
import { toLocalIsoDate } from '../../../core/dateUtils';

const DAY_MS = 86_400_000;

/**
 * Pure helper to compute completion percentage, counts, and overdue status
 * for a project based on its tasks and target date.
 */
export function computeProjectStats(
    tasks: Task[],
    targetDate?: string,
    now: number = Date.now()
): ProjectStats {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in-progress').length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    let isOverdue = false;
    let daysRemaining: number | undefined;

    if (targetDate) {
        const todayStr = toLocalIsoDate(new Date(now));
        if (progressPercent < 100 && targetDate < todayStr) {
            isOverdue = true;
        }

        const targetEpoch = Date.parse(targetDate);
        const todayEpoch = Date.parse(todayStr);
        if (Number.isFinite(targetEpoch) && Number.isFinite(todayEpoch)) {
            daysRemaining = Math.round((targetEpoch - todayEpoch) / DAY_MS);
        }
    }

    return {
        totalTasks,
        completedTasks,
        inProgressTasks,
        progressPercent,
        isOverdue,
        daysRemaining,
    };
}

/**
 * A project's deadline, in the words that are true of it.
 *
 * Two things were wrong with the version that lived inline in the card. It
 * built "7 просрочено" by putting a number in front of the word "overdue",
 * which is not a sentence in either language this speaks. And it drew a
 * countdown on projects that have already landed: a finished project whose
 * date has passed reported "−13 days left", a negative number of days
 * remaining on something that does not remain.
 *
 * So a project that is done or shelved has no deadline to report, and the rest
 * get a phrase rather than a number with a word after it.
 */
export function dueLabel(project: Project, t: Translator): { text: string; tone: string } | null {
    if (!project.due) return null;
    if (project.status === 'completed' || project.status === 'archived') return null;

    const days = project.stats.daysRemaining;
    if (days === undefined) return null;
    if (project.stats.isOverdue || days < 0) {
        return { text: t('projects.stats.overdueDays', { count: Math.abs(days) }), tone: 'is-overdue' };
    }
    if (days === 0) return { text: t('projects.stats.today'), tone: 'is-today' };
    return { text: t('projects.stats.daysLeftN', { count: days }), tone: '' };
}
