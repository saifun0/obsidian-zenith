import React, { useMemo } from 'react';
import { useTranslation } from '../../../core/i18n';
import { PRAYERS, isPerformed } from '../prayerConfig';
import { recentDays, type PrayerDay, type PrayerStatsResult } from '../prayerStats';

interface PrayerStatsPanelProps {
    stats: PrayerStatsResult;
    days: Map<string, PrayerDay>;
    today: string;
    /** The day loaded into the list above, so the strip can show where you are. */
    selected: string;
    onSelect: (iso: string) => void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * The month, as one figure and a shape you can reach into.
 *
 * A grid of six equal boxes gave every number the same weight and read as a
 * form to fill in. One figure carries the answer; the bar per day beside it
 * carries the shape of the month, which no percentage can; the rest are a quiet
 * line underneath.
 *
 * The bars are buttons. With the month grid gone, this is the only place a day
 * two weeks back can be reached in one go — and it is the better place for it,
 * because a low bar is exactly the day you came looking for. Beyond the window
 * the arrows in the header are the way back.
 *
 * Counts sit next to rates deliberately. "82%" is a score, and a score invites
 * gaming; "126 of 150, 9 missed" is a description of a month.
 */
export const PrayerStatsPanel: React.FC<PrayerStatsPanelProps> = ({
    stats,
    days,
    today,
    selected,
    onSelect,
}) => {
    const t = useTranslation();

    const series = useMemo(
        () =>
            recentDays(days, today, stats.windowDays).map((day) => ({
                date: day.date,
                performed: PRAYERS.filter((id) => isPerformed(day.statuses[id])).length,
            })),
        [days, today, stats.windowDays]
    );

    const slots = stats.windowDays * PRAYERS.length;

    const line = [
        { key: 'punctuality', value: percent(stats.punctuality) },
        { key: 'late', value: String(stats.counts.late) },
        { key: 'missed', value: String(stats.counts.missed) },
        { key: 'complete', value: String(stats.completeDays) },
        { key: 'best', value: String(stats.longestStreak) },
    ];

    return (
        <section className="zenith-prayer__stats">
            <div className="zenith-prayer__stats-head">
                <span className="zenith-prayer__stats-value">{stats.counts.performed}</span>
                <span className="zenith-prayer__stats-caption">
                    {t('prayer.performedOf', { total: slots })}
                </span>
                <span className="zenith-prayer__kicker">
                    {t('prayer.stats.window', { count: stats.windowDays })}
                </span>
            </div>

            <div className="zenith-prayer__stats-strip" title={t('prayer.pickDay')}>
                {series.map((point) => (
                    <button
                        key={point.date}
                        type="button"
                        className={`zenith-prayer__stats-day ${
                            point.date === selected ? 'is-selected' : ''
                        }`}
                        onClick={() => onSelect(point.date)}
                        aria-label={`${point.date} — ${t('prayer.done', {
                            done: point.performed,
                            total: PRAYERS.length,
                        })}`}
                        aria-current={point.date === selected ? 'date' : undefined}
                        title={`${point.date} — ${point.performed}/${PRAYERS.length}`}
                    >
                        {/* Height carries the count; a day with nothing recorded
                            still gets a stub, so the strip reads as a run of
                            days rather than as gaps in the axis. */}
                        <i
                            className={`zenith-prayer__stats-bar ${
                                point.date === today ? 'is-today' : ''
                            } ${point.performed === PRAYERS.length ? 'is-full' : ''}`}
                            style={{ height: `${6 + point.performed * 4}px` }}
                        />
                    </button>
                ))}
            </div>

            <div className="zenith-prayer__stats-line">
                {line.map((item) => (
                    <span key={item.key} className="zenith-prayer__stat">
                        <b>{item.value}</b> {t(`prayer.stats.${item.key}`)}
                    </span>
                ))}
            </div>
        </section>
    );
};
