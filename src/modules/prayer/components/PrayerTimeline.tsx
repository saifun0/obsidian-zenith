import React, { useMemo } from 'react';
import { useTranslation } from '../../../core/i18n';
import { PRAYERS, isPerformed } from '../prayerConfig';
import type { PrayerDay } from '../prayerStats';
import { formatClock, type PrayerTimeId } from '../prayerTimes';

interface PrayerTimelineProps {
    times: Record<PrayerTimeId, number>;
    record: PrayerDay;
    /** Minutes into the day, for the marker. Omit on a day that isn't today. */
    nowMinutes?: number;
}

/**
 * The day as a rail, midnight to midnight — a tick per prayer, the elapsed part
 * dimmed, a line at now.
 *
 * It used to be a 56px band with a name under every tick, which cost a block
 * and a heading of its own to repeat what the list underneath already said in
 * words. What only the rail can show is the *shape* of a day: how the prayers
 * bunch up in winter and spread through a summer evening. That survives at
 * 13px; the names move into the tooltips, since the list is two lines below.
 *
 * A performed prayer's tick is filled. That is the only status this carries.
 */
export const PrayerTimeline: React.FC<PrayerTimelineProps> = ({ times, record, nowMinutes }) => {
    const t = useTranslation();

    const marks = useMemo(
        () =>
            PRAYERS.filter((id) => Number.isFinite(times[id])).map((id) => ({
                id,
                at: times[id],
                left: (times[id] / 1440) * 100,
                done: isPerformed(record.statuses[id]),
            })),
        [times, record]
    );

    if (marks.length === 0) return null;
    const nowPct = nowMinutes === undefined ? null : (nowMinutes / 1440) * 100;

    return (
        <div className="zenith-prayer__rail" role="img" aria-label={t('prayer.band')}>
            <i className="zenith-prayer__rail-track" />
            {nowPct !== null && (
                <i className="zenith-prayer__rail-elapsed" style={{ width: `${nowPct}%` }} />
            )}

            {marks.map((mark) => (
                <i
                    key={mark.id}
                    className={`zenith-prayer__rail-tick ${mark.done ? 'is-done' : ''}`}
                    style={{ left: `${mark.left}%` }}
                    data-prayer={mark.id}
                    title={`${t(`prayer.${mark.id}`)} — ${formatClock(mark.at, t.locale)}`}
                />
            ))}

            {nowPct !== null && (
                <i
                    className="zenith-prayer__rail-now"
                    style={{ left: `${nowPct}%` }}
                    title={formatClock(nowMinutes ?? 0, t.locale)}
                />
            )}
        </div>
    );
};
