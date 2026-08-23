import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { isoToDate } from '../../journal/services/journalDates';
import { PRAYERS, isPerformed } from '../prayerConfig';
import { recentDays, type PrayerDay } from '../prayerStats';

const DAYS = 7;

/**
 * The week as five stacked strokes per day.
 *
 * Read bottom-up: a filled stroke is a prayer performed, an outlined one a
 * miss the user owned up to, a faint one an unanswered slot. Stacking rather
 * than counting is the point — a week of 4s and a week of 5s look different at
 * a glance, and so does the day that fell over completely.
 *
 * Not clickable: fixing a past day is what the full view is for, and a mis-tap
 * here would rewrite history you were only glancing at.
 */
export const PrayerWeekStrip: FC<{ days: Map<string, PrayerDay>; today: string }> = ({
    days,
    today,
}) => {
    const t = useTranslation();
    const strip = recentDays(days, today, DAYS);

    return (
        <div className="zenith-prayer__week">
            <span className="zenith-prayer__kicker">{t('prayer.week')}</span>
            <div className="zenith-prayer__week-grid">
                {strip.map((day) => {
                    const date = isoToDate(day.date);
                    const performed = PRAYERS.filter((id) => isPerformed(day.statuses[id])).length;
                    const missed = PRAYERS.filter((id) => day.statuses[id] === 'missed').length;
                    return (
                        <div
                            key={day.date}
                            className={`zenith-prayer__week-day ${day.date === today ? 'is-today' : ''}`}
                            title={`${day.date} — ${t('prayer.done', {
                                done: performed,
                                total: PRAYERS.length,
                            })}`}
                        >
                            <span className="zenith-prayer__week-label">
                                {date.toLocaleDateString(t.locale, { weekday: 'short' })}
                            </span>
                            <span className="zenith-prayer__week-segs">
                                {PRAYERS.map((_, i) => (
                                    <i
                                        key={i}
                                        className={`zenith-prayer__seg is-${
                                            i < performed
                                                ? 'done'
                                                : i < performed + missed
                                                  ? 'missed'
                                                  : 'none'
                                        }`}
                                    />
                                ))}
                            </span>
                            <span className="zenith-prayer__week-num">{date.getDate()}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
