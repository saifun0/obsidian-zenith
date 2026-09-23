import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { ContentItem } from '../../../store/contentSlice';
import { PieChart } from '../../../components/shared/PieChart';
import { Card } from '../../../components/shared/Card';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { computeContentStats } from '../services/contentStats';

interface ContentStatsProps {
    items: ContentItem[];
    /** Clicking a genre asks the library to show it. */
    onSelectGenre?: (genre: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
    backlog: '#6b7280',
    'in-progress': '#3b82f6',
    completed: '#10b981',
    dropped: '#ef4444',
};

const STATUS_KEYS: Record<string, string> = {
    backlog: 'status.backlog',
    'in-progress': 'status.inProgress',
    completed: 'status.completed',
    dropped: 'status.dropped',
};

const DAY_MS = 86_400_000;

/**
 * ContentStats — the library at a distance.
 *
 * Beyond the totals, this answers the two questions a backlog actually raises:
 * what have I finished lately, and what have I quietly abandoned. Both come from
 * the notes' own timestamps — there's no history of *when* progress moved, so
 * anything resembling a reading speed would be fabricated.
 *
 * The type breakdown now uses each type's own colour instead of a private
 * lookup table, so a custom type stops being grey.
 */
export const ContentStats: React.FC<ContentStatsProps> = ({ items, onSelectGenre }) => {
    const t = useTranslation();
    const savedTypes = useZenithStore((s) => s.settings.contentTypes);
    const types = useMemo(() => effectiveContentTypes(savedTypes), [savedTypes]);

    // `Date.now()` is read here rather than inside the service, which keeps that
    // service pure and testable.
    const now = Date.now();
    const stats = useMemo(() => computeContentStats(items, now), [items, now]);

    const statusData = useMemo(
        () =>
            Object.entries(stats.byStatus).map(([status, value]) => ({
                label: STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status,
                value,
                color: STATUS_COLORS[status] ?? '#6b7280',
            })),
        [stats.byStatus, t]
    );

    const typeData = useMemo(
        () =>
            Object.entries(stats.byType).map(([type, value]) => {
                const cfg = resolveContentType(types, type);
                return { label: cfg.label, value, color: cfg.color };
            }),
        [stats.byType, types]
    );

    const maxMonth = Math.max(1, ...stats.addedByMonth.map((m) => m.count));

    return (
        <div className="zenith-content-stats">
            <div className="zenith-content-stats__summary">
                <Card className="zenith-content-stats__metric" padding="md">
                    <span className="zenith-content-stats__metric-value">{stats.total}</span>
                    <span className="zenith-content-stats__metric-label">{t('content.stats.total')}</span>
                </Card>
                <Card className="zenith-content-stats__metric" padding="md">
                    <span className="zenith-content-stats__metric-value">
                        {stats.avgRating.toFixed(1)}
                    </span>
                    <span className="zenith-content-stats__metric-label">
                        {t('content.stats.avgRating')}
                    </span>
                </Card>
                <Card className="zenith-content-stats__metric" padding="md">
                    <span className="zenith-content-stats__metric-value">{stats.completionRate}%</span>
                    <span className="zenith-content-stats__metric-label">
                        {t('content.stats.completion')}
                    </span>
                </Card>
                <Card className="zenith-content-stats__metric" padding="md">
                    <span className="zenith-content-stats__metric-value">{stats.finishedRecently}</span>
                    <span className="zenith-content-stats__metric-label">
                        {t('content.stats.finishedRecently')}
                    </span>
                </Card>
                {stats.averageProgress != null && (
                    <Card className="zenith-content-stats__metric" padding="md">
                        <span className="zenith-content-stats__metric-value">
                            {Math.round(stats.averageProgress)}%
                        </span>
                        <span className="zenith-content-stats__metric-label">
                            {t('content.stats.avgProgress')}
                        </span>
                    </Card>
                )}
                {stats.avgDaysToFinish != null && (
                    <Card className="zenith-content-stats__metric" padding="md">
                        <span className="zenith-content-stats__metric-value">
                            {Math.round(stats.avgDaysToFinish)}
                        </span>
                        <span className="zenith-content-stats__metric-label">
                            {t('content.stats.avgDaysToFinish')}
                        </span>
                    </Card>
                )}
            </div>

            <div className="zenith-content-stats__charts">
                <Card className="zenith-content-stats__chart" padding="lg">
                    <h3 className="zenith-content-stats__chart-title">{t('content.stats.byStatus')}</h3>
                    <PieChart data={statusData} size={180} showLegend donut />
                </Card>
                <Card className="zenith-content-stats__chart" padding="lg">
                    <h3 className="zenith-content-stats__chart-title">{t('content.stats.byType')}</h3>
                    <PieChart data={typeData} size={180} showLegend donut />
                </Card>
            </div>

            {stats.stalled.length > 0 && (
                <Card padding="lg">
                    <h3 className="zenith-content-stats__chart-title">
                        <Clock size={14} /> {t('content.stats.stalled')}
                    </h3>
                    <p className="zenith-content-stats__hint">{t('content.stats.stalledHint')}</p>
                    <ul className="zenith-content-stats__stalled">
                        {stats.stalled.slice(0, 6).map((i) => (
                            <li key={i.id}>
                                <span className="zenith-content-stats__stalled-title">{i.title}</span>
                                <span className="zenith-content-stats__stalled-days">
                                    {t.plural(
                                        'content.stats.daysIdle',
                                        Math.floor((now - (i.updatedAt ?? now)) / DAY_MS)
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {stats.topGenres.length > 0 && (
                <Card padding="lg">
                    <h3 className="zenith-content-stats__chart-title">{t('content.stats.topGenres')}</h3>
                    <div className="zenith-content-stats__genres">
                        {stats.topGenres.map((g) => (
                            <button
                                type="button"
                                key={g.genre}
                                className="zenith-content-stats__genre"
                                title={
                                    onSelectGenre
                                        ? t('content.filterByGenre', { genre: g.genre })
                                        : undefined
                                }
                                onClick={() => onSelectGenre?.(g.genre)}
                            >
                                {g.genre}
                                <span className="zenith-content-stats__genre-count">{g.count}</span>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {stats.addedByMonth.length > 1 && (
                <Card padding="lg">
                    <h3 className="zenith-content-stats__chart-title">
                        {t('content.stats.addedOverTime')}
                    </h3>
                    <div className="zenith-content-stats__bars">
                        {stats.addedByMonth.map((m) => (
                            <div
                                key={m.month}
                                className="zenith-content-stats__bar"
                                title={`${m.month}: ${m.count}`}
                            >
                                <div
                                    className="zenith-content-stats__bar-fill"
                                    style={{ height: `${(m.count / maxMonth) * 100}%` }}
                                />
                                <span className="zenith-content-stats__bar-label">
                                    {m.month.slice(5)}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};
