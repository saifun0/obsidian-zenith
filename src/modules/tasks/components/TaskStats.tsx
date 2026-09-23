import React, { useMemo, useState, type FC } from 'react';
import type { Task } from '../../../store/taskSlice';
import { STATUS_META } from '../../../core/constants';
import type { TaskStatus } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { computeTaskStats, type StatsRange } from '../services/taskStats';
import { PieChart } from '../../../components/shared/PieChart';
import { STATUS_COLOR } from './taskStatusUi';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';

const RANGES: { id: StatsRange; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
];

// Distinct, theme-neutral colors for tag segments.
const TAG_PALETTE = [
    '#7c6cff',
    '#4c9be8',
    '#3fb950',
    '#e0913b',
    '#e5534b',
    '#d9b02a',
    '#c678dd',
    '#2bb0a3',
    '#e06c9f',
    '#8a94a6',
];

function heatLevel(count: number): number {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 5) return 3;
    return 4;
}

interface TaskStatsProps {
    tasks: Task[];
}

export const TaskStats: FC<TaskStatsProps> = ({ tasks }) => {
    const heatmapOn = useFeature('tasks.heatmap');
    const t = useTranslation();
    const [range, setRange] = useState<StatsRange>('year');
    const today = getTodayString();
    const stats = useMemo(() => computeTaskStats(tasks, today, range), [tasks, today, range]);

    const statusData = useMemo(
        () =>
            (Object.keys(stats.byStatus) as TaskStatus[])
                .filter((s) => stats.byStatus[s] > 0)
                .map((s) => ({
                    label: STATUS_META[s].label,
                    value: stats.byStatus[s],
                    color: STATUS_COLOR[s],
                })),
        [stats]
    );

    const tagData = useMemo(() => {
        const top = stats.byTag.slice(0, 9);
        const rest = stats.byTag.slice(9).reduce((sum, t) => sum + t.count, 0);
        const data = top.map((t, i) => ({
            label: t.tag,
            value: t.count,
            color: TAG_PALETTE[i % TAG_PALETTE.length],
        }));
        if (rest > 0) data.push({ label: 'Other', value: rest, color: '#5a6373' });
        return data;
    }, [stats]);

    return (
        <div className="zenith-taskstats">
            <div className="zenith-taskstats__rangebar">
                <span className="zenith-taskstats__range-label">{t('tasks.stats.range')}</span>
                <div className="zenith-seg">
                    {RANGES.map((r) => (
                        <button
                            key={r.id}
                            className={`zenith-seg__btn ${range === r.id ? 'is-active' : ''}`}
                            onClick={() => setRange(r.id)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stat tiles */}
            <div className="zenith-taskstats__tiles">
                <div className="zenith-stat-tile zenith-stat-tile--done">
                    <div className="zenith-stat-tile__value">
                        {stats.done}
                        <span className="zenith-stat-tile__sub"> / {stats.total}</span>
                    </div>
                    <div className="zenith-stat-tile__label">{t('tasks.stats.done')}</div>
                </div>
                <div className="zenith-stat-tile zenith-stat-tile--progress">
                    <div className="zenith-stat-tile__value">{stats.inProgress}</div>
                    <div className="zenith-stat-tile__label">{t('tasks.stats.inProgress')}</div>
                </div>
                <div className="zenith-stat-tile zenith-stat-tile--overdue">
                    <div className="zenith-stat-tile__value">{stats.overdue}</div>
                    <div className="zenith-stat-tile__label">{t('tasks.stats.overdue')}</div>
                </div>
                <div className="zenith-stat-tile zenith-stat-tile--pct">
                    <div className="zenith-stat-tile__value">{stats.progress}%</div>
                    <div className="zenith-stat-tile__label">{t('tasks.stats.progress')}</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="zenith-taskstats__progress">
                <div className="zenith-taskstats__progress-label">
                    {stats.done} of {stats.total} tasks done
                </div>
                <div className="zenith-taskstats__progress-track">
                    <div
                        className="zenith-taskstats__progress-fill"
                        style={{ width: `${stats.progress}%` }}
                    />
                </div>
            </div>

            {/* Chips */}
            <div className="zenith-taskstats__chips">
                <span className="zenith-chip">
                    {stats.completedInRange} done this {range === 'all' ? 'time' : range}
                </span>
                <span className="zenith-chip">{stats.activeDays} active days</span>
                <span className="zenith-chip">{stats.streak} streak</span>
                {stats.avgOffsetDays !== null && (
                    <span className="zenith-chip">
                        {stats.avgOffsetDays > 0 ? '+' : ''}
                        {stats.avgOffsetDays}d avg vs due
                    </span>
                )}
            </div>

            {/* Donuts */}
            <div className="zenith-taskstats__charts">
                <div className="zenith-taskstats__chart">
                    <div className="zenith-taskstats__chart-title">{t('tasks.stats.byStatus')}</div>
                    <PieChart
                        data={statusData}
                        size={150}
                        centerLabel={stats.total}
                        centerCaption="tasks"
                    />
                </div>
                <div className="zenith-taskstats__chart">
                    <div className="zenith-taskstats__chart-title">{t('tasks.stats.byTag')}</div>
                    <PieChart
                        data={tagData}
                        size={150}
                        centerLabel={`${stats.progress}%`}
                        centerCaption="done"
                    />
                </div>
            </div>

            {/* Heatmap */}
            {heatmapOn && (
                <div className="zenith-taskstats__heat">
                    <div className="zenith-taskstats__chart-title">{t('tasks.stats.activity')}</div>
                    <div className="zenith-heatmap">
                        {chunkWeeks(stats.heatmap).map((week, wi) => (
                            <div key={wi} className="zenith-heatmap__col">
                                {week.map((cell) => (
                                    <div
                                        key={cell.date}
                                        className={`zenith-heatmap__cell zenith-heatmap__cell--l${heatLevel(cell.count)}`}
                                        title={`${cell.date}: ${cell.count} done`}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/** Split the flat day list into weeks (columns of 7). */
function chunkWeeks<T>(cells: T[]): T[][] {
    const weeks: T[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}
