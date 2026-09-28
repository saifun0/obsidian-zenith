import React, { useMemo } from 'react';
import { Clock, Star } from 'lucide-react';
import { ChallengeBars, useChallenge } from './ChallengeBars';
import { useFeature } from '../../../core/useFeature';
import type { ContentItem } from '../../../store/contentSlice';
import { useTranslation } from '../../../core/i18n';
import { computeContentStats } from '../services/contentStats';
import { STATUS_COLOR, STATUS_ORDER, statusLabel } from '../contentLabels';
import type { LibraryTypes } from '../useContentTypes';

interface ContentStatsProps {
    items: ContentItem[];
    types: LibraryTypes;
    /** Clicking a genre asks the library to show it. */
    onSelectGenre?: (genre: string) => void;
}

const DAY_MS = 86_400_000;

/**
 * ContentStats — the library at a distance.
 *
 * Four figures in a row, not seven boxes: how much there is, what was finished
 * lately, the average score, what is under way. Statuses are one bar, as on
 * the dashboard card, and types are bars too — a ring with eight slices is a
 * guessing game. Then the one thing the numbers alone cannot say: how the
 * library moves, as finishes month by month. What has gone quiet and the
 * genres come last.
 *
 * Only dates the items record count in time — see `computeContentStats`.
 */
export const ContentStats: React.FC<ContentStatsProps> = ({ items, types, onSelectGenre }) => {
    const t = useTranslation();
    const challengeOn = useFeature('content.challenge');
    const challenge = useChallenge();

    // `Date.now()` is read here rather than inside the service, which keeps that
    // service pure and testable.
    const now = Date.now();
    const stats = useMemo(() => computeContentStats(items, now), [items, now]);

    const statuses = STATUS_ORDER.map((status) => ({
        status,
        count: stats.byStatus[status] ?? 0,
    })).filter((s) => s.count > 0);

    const byType = useMemo(
        () =>
            Object.entries(stats.byType)
                .map(([id, count]) => ({ type: types.typeOf(id), count }))
                .sort((a, b) => b.count - a.count),
        [stats.byType, types]
    );
    const maxType = Math.max(1, ...byType.map((x) => x.count));

    const monthName = useMemo(
        () => new Intl.DateTimeFormat(t.locale, { month: 'short' }),
        [t.locale]
    );
    const maxMonth = Math.max(1, ...stats.finishedByMonth.map((m) => m.count));
    const finishedThisYear = stats.finishedByMonth.reduce((n, m) => n + m.count, 0);

    return (
        <div className="zenith-cstats">
            <div className="zenith-cstats__figures">
                <Figure value={stats.total} label={t('content.stats.total')} />
                <Figure value={stats.finishedRecently} label={t('content.stats.finishedRecently')} />
                <Figure
                    value={
                        stats.avgRating > 0 ? (
                            <>
                                <Star size={16} fill="#f59e0b" stroke="#f59e0b" />
                                {stats.avgRating.toFixed(1)}
                            </>
                        ) : (
                            '—'
                        )
                    }
                    label={t('content.stats.avgRating')}
                />
                <Figure value={stats.inProgress} label={t('content.status.inProgress')} />
            </div>

            {challengeOn && challenge.length > 0 && (
                <section className="zenith-cstats__section">
                    <ChallengeBars progress={challenge} />
                </section>
            )}

            {statuses.length > 0 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('content.stats.byStatus')}</h3>
                    <div className="zenith-cstats__stack" aria-hidden="true">
                        {statuses.map(({ status, count }) => (
                            <span
                                key={status}
                                style={{ flexGrow: count, background: STATUS_COLOR[status] }}
                            />
                        ))}
                    </div>
                    <div className="zenith-cstats__legend">
                        {statuses.map(({ status, count }) => (
                            <span key={status} className="zenith-cstats__legend-item">
                                <span
                                    className="zenith-cstats__dot"
                                    style={{ background: STATUS_COLOR[status] }}
                                />
                                {statusLabel(t, status)}
                                <b>{count}</b>
                            </span>
                        ))}
                    </div>
                </section>
            )}

            {byType.length > 1 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('content.stats.byType')}</h3>
                    <div className="zenith-cstats__types">
                        {byType.map(({ type, count }) => (
                            <div key={type.id} className="zenith-cstats__type">
                                <span className="zenith-cstats__type-label">{type.label}</span>
                                <span className="zenith-cstats__type-track">
                                    <span
                                        className="zenith-cstats__type-fill"
                                        style={{
                                            width: `${(count / maxType) * 100}%`,
                                            background: type.color,
                                        }}
                                    />
                                </span>
                                <span className="zenith-cstats__type-count">{count}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="zenith-cstats__section">
                <h3 className="zenith-cstats__title">
                    {t('content.stats.finishedByMonth')}
                    <span className="zenith-cstats__aside">
                        {t('content.stats.finishedYear', { count: finishedThisYear })}
                        {stats.avgDaysToFinish != null &&
                            ` · ${t('content.stats.avgDays', {
                                count: Math.round(stats.avgDaysToFinish),
                            })}`}
                    </span>
                </h3>
                <div className="zenith-cstats__months">
                    {stats.finishedByMonth.map((m) => {
                        const [year, month] = m.month.split('-').map(Number);
                        const name = monthName.format(new Date(year, month - 1, 1));
                        return (
                            <div key={m.month} className="zenith-cstats__month" title={`${name} ${year}: ${m.count}`}>
                                <span className="zenith-cstats__month-count">{m.count || ''}</span>
                                <span className="zenith-cstats__month-track">
                                    <span
                                        className="zenith-cstats__month-fill"
                                        style={{ height: `${(m.count / maxMonth) * 100}%` }}
                                    />
                                </span>
                                <span className="zenith-cstats__month-label">{name}</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {stats.stalled.length > 0 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">
                        <Clock size={14} /> {t('content.stats.stalled')}
                    </h3>
                    <p className="zenith-cstats__hint">{t('content.stats.stalledHint')}</p>
                    <ul className="zenith-cstats__stalled">
                        {stats.stalled.slice(0, 6).map((i) => (
                            <li key={i.id}>
                                <span className="zenith-cstats__stalled-title">{i.title}</span>
                                <span className="zenith-cstats__stalled-days">
                                    {t.plural(
                                        'content.stats.daysIdle',
                                        Math.floor((now - (i.updatedAt ?? now)) / DAY_MS)
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {stats.topGenres.length > 0 && (
                <section className="zenith-cstats__section">
                    <h3 className="zenith-cstats__title">{t('content.stats.topGenres')}</h3>
                    <div className="zenith-cstats__genres">
                        {stats.topGenres.map((g) => (
                            <button
                                type="button"
                                key={g.genre}
                                className="zenith-cstats__genre"
                                title={
                                    onSelectGenre
                                        ? t('content.filterByGenre', { genre: g.genre })
                                        : undefined
                                }
                                onClick={() => onSelectGenre?.(g.genre)}
                            >
                                {g.genre}
                                <span className="zenith-cstats__genre-count">{g.count}</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

const Figure: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
    <div className="zenith-cstats__figure">
        <span className="zenith-cstats__figure-value">{value}</span>
        <span className="zenith-cstats__figure-label">{label}</span>
    </div>
);
