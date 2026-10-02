import React, { useEffect, useMemo, useRef, useState, type FC } from 'react';
import type { Task } from '../../../store/taskSlice';
import { TASK_STATUSES } from '../../../core/constants';
import { getTodayString } from '../../../core/dateUtils';
import { computeTaskStats, type HeatCell, type StatsRange } from '../services/taskStats';
import { STATUS_I18N, StatusBox } from './taskStatusUi';
import { useTranslation, type Translator } from '../../../core/i18n';
import { useFeature } from '../../../core/useFeature';
import { withFigures } from './inkFigures';

const RANGES: StatsRange[] = ['week', 'month', 'year', 'all'];

/** Tags listed; the rest are one "other" line. */
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
 * The tasks at a distance, written up as a short report rather than drawn as
 * a dashboard.
 *
 * It opens on what the period amounted to, in a sentence — "This year, 62 of
 * 104 closed — 60%" — and the rest of the numbers in the line under it. The
 * statuses are one line of ink in four shades; the tags a list with dotted
 * leaders, each over a hairline as long as its share; the year of
 * completions a heatmap in the same ink, its months named. There used to be
 * four figure tiles, a bar in four colours and grey bars: the shape every
 * dashboard has, which said nothing in particular about this one.
 */
export const TaskStats: FC<TaskStatsProps> = ({ tasks }) => {
    const heatmapOn = useFeature('tasks.heatmap');
    const t = useTranslation();
    const [range, setRange] = useState<StatsRange>('year');
    const today = getTodayString();
    const stats = useMemo(() => computeTaskStats(tasks, today, range), [tasks, today, range]);

    const statuses = TASK_STATUSES.map((status) => ({
        status,
        count: stats.byStatus[status],
    })).filter((s) => s.count > 0);
    const statusTotal = statuses.reduce((n, s) => n + s.count, 0);

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
        <div className="zenith-trep">
            <nav className="zenith-trep__range" aria-label={t('tasks.stats.range')}>
                {RANGES.map((r, i) => (
                    <React.Fragment key={r}>
                        {i > 0 && (
                            <span className="zenith-trep__sep" aria-hidden="true">
                                ·
                            </span>
                        )}
                        <button
                            type="button"
                            className={`zenith-trep__range-item ${range === r ? 'is-on' : ''}`}
                            aria-pressed={range === r}
                            onClick={() => setRange(r)}
                        >
                            {t(`tasks.stats.range.${r}`)}
                        </button>
                    </React.Fragment>
                ))}
            </nav>

            <p className="zenith-trep__lead">
                {withFigures(
                    t('tasks.stats.report.closed', {
                        period: t(`tasks.stats.report.period.${range}`),
                        done: stats.done,
                        total: stats.total,
                        progress: stats.progress,
                    })
                )}{' '}
                <span className="zenith-trep__lead-rest">
                    {withFigures(t('tasks.stats.report.doing', { count: stats.inProgress }))}
                    {stats.overdue > 0 && (
                        <>
                            {', '}
                            <span className="is-danger">
                                {withFigures(
                                    t('tasks.stats.report.overdue', { count: stats.overdue })
                                )}
                            </span>
                        </>
                    )}
                    .
                </span>
            </p>
            <p className="zenith-trep__line">{line.join(' · ')}</p>

            {statuses.length > 0 && (
                <section className="zenith-trep__section">
                    <h3 className="zenith-trep__title">{t('tasks.stats.byStatus')}</h3>
                    <div className="zenith-trep__stack" aria-hidden="true">
                        {statuses.map(({ status, count }) => (
                            <span
                                key={status}
                                className={`is-${status}`}
                                style={{
                                    flexGrow: count,
                                    flexBasis: `${(count / statusTotal) * 100}%`,
                                }}
                            />
                        ))}
                    </div>
                    <div className="zenith-trep__legend">
                        {statuses.map(({ status, count }) => (
                            <span key={status} className="zenith-trep__legend-item">
                                <StatusBox status={status} size={12} />
                                {t(STATUS_I18N[status])}
                                <em className="zenith-ink-figure">{count}</em>
                            </span>
                        ))}
                    </div>
                </section>
            )}

            {tags.length > 0 && (
                <section className="zenith-trep__section">
                    <h3 className="zenith-trep__title">{t('tasks.stats.byTag')}</h3>
                    <ol className="zenith-trep__tags">
                        {[...tags, ...(otherTags > 0 ? [{ tag: '', count: otherTags }] : [])].map(
                            ({ tag, count }) => (
                                <li key={tag || '·other'} className="zenith-trep__tag">
                                    <span className="zenith-trep__tag-label">
                                        {tag ? `#${tag}` : t('tasks.stats.otherTags')}
                                    </span>
                                    <span className="zenith-trep__tag-leader" aria-hidden="true" />
                                    <em className="zenith-ink-figure">{count}</em>
                                    <span
                                        className="zenith-trep__tag-share"
                                        style={{ width: `${(count / maxTag) * 100}%` }}
                                        aria-hidden="true"
                                    />
                                </li>
                            )
                        )}
                    </ol>
                </section>
            )}

            {heatmapOn && (
                <section className="zenith-trep__section">
                    <h3 className="zenith-trep__title">{t('tasks.stats.activity')}</h3>
                    <Heatmap cells={stats.heatmap} t={t} />
                </section>
            )}
        </div>
    );
};

/**
 * The year of completions, as many recent weeks as the width holds, with the
 * months named over the weeks they begin in.
 *
 * Measuring the width and dropping the oldest weeks keeps the newest one at
 * the right edge, always — a scroll that opened on the empty middle of the
 * year looked broken.
 */
const Heatmap: FC<{ cells: HeatCell[]; t: Translator }> = ({ cells, t }) => {
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

    // A month is named over the first week that holds its first days.
    let lastMonth = '';
    const months = columns.map((week, i) => {
        const month = week[0]?.date.slice(0, 7) ?? '';
        if (month === lastMonth) return '';
        lastMonth = month;
        // The first column is usually mid-month; naming it would crowd the next.
        if (i === 0) return '';
        return new Date(`${month}-01T00:00:00`)
            .toLocaleDateString(t.locale, { month: 'short' })
            .replace(/\.$/, '');
    });

    return (
        <div className="zenith-heatmap" ref={ref}>
            {columns.map((week, wi) => (
                <div key={wi} className="zenith-heatmap__col">
                    <span className="zenith-heatmap__month">{months[wi]}</span>
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
