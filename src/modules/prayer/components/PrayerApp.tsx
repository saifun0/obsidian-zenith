import React, { useMemo, useState, type FC } from 'react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString, toLocalIsoDate } from '../../../core/dateUtils';
import { placeLabel } from '../../../services/geocode';
import { openDailyNote } from '../../journal/services/journalActions';
import { isoToDate } from '../../journal/services/journalDates';
import { EXTRA_PRAYERS, PRAYERS, isPerformed, type PrayerId } from '../prayerConfig';
import { setExtraPrayer, setPrayerStatus, statusForTap } from '../prayerActions';
import { dayOf, prayerStats } from '../prayerStats';
import { hasEntered, nextPrayer, type PrayerTimeId } from '../prayerTimes';
import { hijriMonthKey } from '../hijri';
import { useFeature } from '../../../core/useFeature';
import {
    useDayTimes,
    useTimesFallback,
    useHijri,
    useNowMinutes,
    usePrayerDays,
    usePrayerExtras,
    usePrayerPlace,
} from '../usePrayer';
import { PrayerNoPlace } from './PrayerNoPlace';
import { PrayerDayHead } from './PrayerDayHead';
import { PrayerStatsPanel } from './PrayerStatsPanel';
import { PrayerRow, PrayerMarkerRow } from './PrayerRow';
import { ExtraButton } from './PrayerWidget';

/** Window the statistics summarise. A month is the shortest honest habit view. */
const STATS_WINDOW = 30;

/**
 * PrayerApp — the full view.
 *
 * The widget answers "what's next"; this answers "how am I doing", and is where
 * a day missed at the time gets filled in. Every prayer of a past day is
 * editable with no gesture to discover.
 *
 * Three blocks, and each is a different question: the head says which day and
 * what's next, the list is where a day is answered, the strip is the month.
 * There used to be a month grid between the last two, drawing the same five
 * marks a third time; the strip below took over reaching a past day, and the
 * arrows in the head reach the rest.
 */
export const PrayerApp: FC = () => {
    const t = useTranslation();
    const { app } = useApp();
    const settings = useZenithStore((s) => s.settings);
    const journalEntries = useZenithStore((s) => s.journalEntries);

    const today = getTodayString();
    const [selected, setSelected] = useState(today);

    const place = usePrayerPlace();
    const day = useDayTimes(selected);
    const fallback = useTimesFallback(selected);
    const days = usePrayerDays();
    const extras = usePrayerExtras();
    const nowMinutes = useNowMinutes();
    const hijriOn = useFeature('prayer.hijri');
    const statsOn = useFeature('prayer.stats');
    const hijri = useHijri(selected);

    const stats = useMemo(
        () => prayerStats(journalEntries, today, STATS_WINDOW),
        [journalEntries, today]
    );

    const dateLabel = useMemo(
        () =>
            isoToDate(selected).toLocaleDateString(t.locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
            }),
        [selected, t.locale]
    );

    if (!place || !day) {
        return (
            <div className="zenith-prayer zenith-prayer-view">
                <PrayerNoPlace />
            </div>
        );
    }

    const { times } = day;
    const record = dayOf(days, selected);
    const isToday = selected === today;
    const isFuture = selected > today;
    const next = isToday ? nextPrayer(times, nowMinutes) : null;
    const done = PRAYERS.filter((id) => isPerformed(record.statuses[id])).length;
    const enabledExtras = EXTRA_PRAYERS.filter((id) => extras.includes(id));
    const showNight = enabledExtras.includes('tahajjud');

    const shiftDay = (delta: number) => {
        const d = isoToDate(selected);
        d.setDate(d.getDate() + delta);
        setSelected(toLocalIsoDate(d));
    };

    const rows: PrayerTimeId[] = [
        'fajr',
        ...(settings.prayerShowSunrise ? (['sunrise'] as PrayerTimeId[]) : []),
        'dhuhr',
        'asr',
        'maghrib',
        'isha',
        ...(showNight ? (['midnight', 'lastThird'] as PrayerTimeId[]) : []),
    ];

    const markerNote: Partial<Record<PrayerTimeId, string>> = {
        sunrise: 'prayer.sunriseEnds',
        midnight: 'prayer.midnightNote',
        lastThird: 'prayer.lastThirdNote',
    };

    return (
        <div className="zenith-prayer zenith-prayer-view">
            <PrayerDayHead
                dateLabel={dateLabel}
                hijriLabel={
                    hijriOn && hijri
                        ? `${hijri.day} ${t(hijriMonthKey(hijri.month))} ${hijri.year}`
                        : null
                }
                placeLabel={placeLabel(place)}
                methodLabel={t(`prayer.method.${settings.prayerMethod}`)}
                fallback={fallback}
                isToday={isToday}
                next={next}
                times={times}
                record={record}
                nowMinutes={isToday ? nowMinutes : undefined}
                onShiftDay={shiftDay}
                onToday={() => setSelected(today)}
                onOpenNote={() => void openDailyNote(app, settings, selected)}
            />

            <section className="zenith-prayer__list">
                <div className="zenith-prayer__list-head">
                    <span className="zenith-prayer__kicker">{t('prayer.times')}</span>
                    <span className="zenith-prayer__counter">
                        {t('prayer.done', { done, total: PRAYERS.length })}
                    </span>
                    {enabledExtras.map((id) => (
                        <ExtraButton
                            key={id}
                            extra={id}
                            compact
                            done={!!record.extras[id]}
                            disabled={isFuture}
                            onToggle={() =>
                                void setExtraPrayer(app, settings, selected, id, !record.extras[id])
                            }
                        />
                    ))}
                </div>

                {rows.map((id) => {
                    const note = markerNote[id];
                    if (note) return <PrayerMarkerRow key={id} id={id} at={times[id]} noteKey={note} />;
                    const prayer = id as PrayerId;
                    return (
                        <PrayerRow
                            key={id}
                            prayer={prayer}
                            at={times[prayer]}
                            status={record.statuses[prayer]}
                            // A past day is entirely editable; today stops at
                            // the prayer whose time hasn't come in.
                            entered={!isToday || hasEntered(times, prayer, nowMinutes)}
                            isNext={next?.id === prayer && !next.tomorrow}
                            locked={isFuture}
                            tapStatus={statusForTap(times, prayer, isToday ? nowMinutes : 1440)}
                            onSet={(target, status) =>
                                void setPrayerStatus(app, settings, selected, target, status)
                            }
                        />
                    );
                })}

                {day.invalid.length > 0 && (
                    <p className="zenith-prayer__note">
                        {t('prayer.noTimes')} {t('prayer.noTimesHint')}
                    </p>
                )}
            </section>

            {statsOn && (
                <PrayerStatsPanel
                    stats={stats}
                    days={days}
                    today={today}
                    selected={selected}
                    onSelect={setSelected}
                />
            )}
        </div>
    );
};
