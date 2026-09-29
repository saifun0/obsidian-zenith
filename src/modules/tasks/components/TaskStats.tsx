import React, { useEffect, useMemo, useRef, useState, type FC } from 'react';
import type { Task } from '../../../store/taskSlice';
import { TASK_STATUSES } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { computeTaskStats, type HeatCell, type StatsRange } from '../services/taskStats';
import { STATUS_COLOR, STATUS_I18N } from './taskStatusUi';
import { useTranslation } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';

const RANGES: StatsRange[] = ['week', 'month', 'year', 'all'];

/** Tags drawn as bars; the rest are one "other" line. */
const TAGS_SHOWN = 8;

/** A heatmap column: an 11px cell and the 3px gap after it. */
const WEEK_PX = 14;

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

/**
 * TaskStats — the tasks at a distance, in the library's own shape.
 *
 * Four figures in a row rather than four boxes that ran off the edge of a
 * phone; the rest of what the numbers say in one quiet line under them — the
 * active days, the streak, how the deadlines are kept. Statuses are one bar,
 * tags are bars: two rings the height of a phone screen said less. Last, the
 * year of completions, which fits the width it is given — a phone gets the
 * recent months, never a scroll that started in the empty middle of the year.
 */
export const TaskStats: FC<TaskStatsProps> = ({ tasks }) => {
    const heatmapOn = useFeature('tasks.heatmap');
    const t = useTranslation();
    const [range, setRange] = useState<StatsRange>('year');
    const today = getTodayString();
    const stats = useMemo(() => computeTaskStats(tasks, today, range), [tasks, today, range]);

    const statuses = TASK_STATUSES.map((status) => ({ status, count: stats.byStatus[status] })).filter(
        (s) => s.count > 0
    );

    const tags = stats.byTag.slice(0, TAGS_SHOWN);
    const otherTags = stats.byTag.slice(TAGS_SHOWN).reduce((n, x) => n + x.count, 0);
    const maxTag = Math.max(1, ...tags.map((x) => x.count), otherTags);

    const line: string[] = [
        t.plural('tasks.stats.activeDays', stats.activeDays),
        t.plural('tasks.stats.streakDays', stats.streak),
    ];
    if (stats.avgOffsetDays !== null) {
        const days = Math.abs(stats.avgOffsetDays);
        line.push(
            stats.avgOffsetDays > 0
                ? t('tasks.stats.late', { days })
                : stats.avgOffsetDays < 0
                  ? t('tasks.stats.early', { days })
                  : t('tasks.stats.onTime')
        );
    }

    return (
        <div className="zenith-cstats zenith-taskstats">
            <div className="zenith-seg zenith-taskstats__range" role="group" aria-label={t('tasks.stats.range')}>
                {RANGES.map((r) => (
                    <button
                        key={r}
                        type="button"
                        className={`zenith-seg__btn ${range === r ? 'is-active' : ''}`}
                        aria-pressed={range === r}
                        onClick={() => setRange(r)}
                    >
                        {t(`tasks.stats.range.${r}`)}
                    </button>
                ))}
            </div>

            <div className="zenith-cstats__figures">
                <Figure
                    value={
                        <>
                            {stats.done}
                            <span className="zenith-taskstats__of">/{stats.total}</span>
                        </>
                    }
                    label={t('tasks.stats.done')}
                />
                <Figure value={stats.inProgress} label={t('tasks.stats.inProgress')} />
                <Figure
                    value={stats.overdue}
                    label={t('tasks.stats.overdue')}
                    tone={stats.overdue > 0 ? 'danger' : undefined}
                />
                <Figure value={`${stats.progress}%`} label={t('tasks.stats.progress')} />
            </div>
            <p className="zenith-taskstats__line">{line.join(' · ')}</p>

            {statuses.length > 0 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('tasks.stats.byStatus')}</h3>
                    <div className="zenith-cstats__stack" aria-hidden="true">
                        {statuses.map(({ status, count }) => (
                            <span key={status} style={{ flexGrow: count, background: STATUS_COLOR[status] }} />
                        ))}
                    </div>
                    <div className="zenith-cstats__legend">
                        {statuses.map(({ status, count }) => (
                            <span key={status} className="zenith-cstats__legend-item">
                                <span className="zenith-cstats__dot" style={{ background: STATUS_COLOR[status] }} />
                                {t(STATUS_I18N[status])}
                                <b>{count}</b>
                            </span>
                        ))}
                    </div>
                </section>
            )}

            {tags.length > 0 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('tasks.stats.byTag')}</h3>
                    <div className="zenith-cstats__types">
                        {[...tags, ...(otherTags > 0 ? [{ tag: '', count: otherTags }] : [])].map(
                            ({ tag, count }) => (
                                <div key={tag || '·other'} className="zenith-cstats__type">
                                    <span className="zenith-cstats__type-label">
                                        {tag ? `#${tag}` : t('tasks.stats.otherTags')}
                                    </span>
                                    <span className="zenith-cstats__type-track">
                                        <span
                                            className="zenith-cstats__type-fill zenith-taskstats__tag-fill"
                                            style={{ width: `${(count / maxTag) * 100}%` }}
                                        />
                                    </span>
                                    <span className="zenith-cstats__type-count">{count}</span>
                                </div>
                            )
                        )}
                    </div>
                </section>
            )}

            {heatmapOn && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('tasks.stats.activity')}</h3>
                    <Heatmap cells={stats.heatmap} t={t} />
                </section>
            )}
        </div>
    );
};

const Figure: FC<{ value: React.ReactNode; label: string; tone?: 'danger' }> = ({ value, label, tone }) => (
    <div className="zenith-cstats__figure">
        <span className={`zenith-cstats__figure-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
        <span className="zenith-cstats__figure-label">{label}</span>
    </div>
);

/**
 * The year of completions, as many recent weeks as the width holds.
 *
 * It used to be all 53 weeks, centred in a box that scrolled: wider than a
 * phone, the centring pushed the recent weeks past the edge and left the
 * empty middle of the year in view — a heatmap that looked broken. Measuring
 * the width and dropping the oldest weeks keeps the newest one at the right
 * edge, always.
 */
const Heatmap: FC<{ cells: HeatCell[]; t: ReturnType<typeof useTranslation> }> = ({ cells, t }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [weeks, setWeeks] = useState(53);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entry]) => {
            const fit = Math.floor((entry.contentRect.width + 3) / WEEK_PX);
            setWeeks(Math.max(8, Math.min(53, fit)));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const shown = cells.slice(-weeks * 7);
    const columns: HeatCell[][] = [];
    for (let i = 0; i < shown.length; i += 7) columns.push(shown.slice(i, i + 7));

    return (
        <div className="zenith-heatmap" ref={ref}>
            {columns.map((week, wi) => (
                <div key={wi} className="zenith-heatmap__col">
                    {week.map((cell) => (
                        <div
                            key={cell.date}
                            className={`zenith-heatmap__cell zenith-heatmap__cell--l${heatLevel(cell.count)}`}
                            title={t('tasks.stats.cell', { date: cell.date, count: cell.count })}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};
