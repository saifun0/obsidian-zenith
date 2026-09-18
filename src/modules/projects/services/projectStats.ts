import type { Task } from '../../../store/taskSlice';
import type { ProjectStats } from '../projectsTypes';
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
