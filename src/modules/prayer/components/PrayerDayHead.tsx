import React, { type FC } from 'react';
import { ChevronLeft, ChevronRight, CloudDownload, CloudOff, MapPin, PenLine } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import type { PrayerDay } from '../prayerStats';
import {
    formatClock,
    formatCountdown,
    type NextPrayer,
    type PrayerTimeId,
} from '../prayerTimes';
import { PrayerTimeline } from './PrayerTimeline';
import type { TimesSource } from '../usePrayer';

interface PrayerDayHeadProps {
    dateLabel: string;
    /** Hijri date, already rendered — null where the conversion has no answer. */
    hijriLabel: string | null;
    placeLabel: string;
    methodLabel: string;
    /**
     * The published table was asked for and is not what is shown: still on its
     * way, or unreachable. Said in words, because a time that looks exactly
     * like the table's but is the calculation is the one mistake a tracker
     * must not make silently.
     */
    source?: TimesSource | null;
    isToday: boolean;
    next: NextPrayer | null;
    times: Record<PrayerTimeId, number>;
    record: PrayerDay;
    nowMinutes?: number;
    onShiftDay: (delta: number) => void;
    onToday: () => void;
    onOpenNote: () => void;
}

/**
 * Everything the page says before it starts asking questions: which day, where,
 * what's next, and the shape of the day.
 *
 * These were three stacked blocks — a 32px title, a 48px banner, and a labelled
 * band — which between them spent a third of the view restating one date. Held
 * together they read as one statement, and the accent rail down the left says
 * where the page begins without a heading having to.
 *
 * The arrows are the only way to another day now that the month grid is gone,
 * so they sit next to the date rather than in a toolbar: the control and the
 * thing it changes are the same object.
 */
export const PrayerDayHead: FC<PrayerDayHeadProps> = ({
    dateLabel,
    hijriLabel,
    placeLabel,
    methodLabel,
    source,
    isToday,
    next,
    times,
    record,
    nowMinutes,
    onShiftDay,
    onToday,
    onOpenNote,
}) => {
    const t = useTranslation();

    return (
        <header className="zenith-prayer__head">
            <div className="zenith-prayer__daybar">
                <button
                    type="button"
                    className="zenith-prayer__step"
                    onClick={() => onShiftDay(-1)}
                    aria-label={t('prayer.prevDay')}
                >
                    <ChevronLeft size={14} />
                </button>
                <h1 className="zenith-prayer__date">{dateLabel}</h1>
                <button
                    type="button"
                    className="zenith-prayer__step"
                    onClick={() => onShiftDay(1)}
                    aria-label={t('prayer.nextDay')}
                >
                    <ChevronRight size={14} />
                </button>

                {/* Nothing to return to while you're already there. */}
                {!isToday && (
                    <button
                        type="button"
                        className="zenith-prayer__step is-wide"
                        onClick={onToday}
                    >
                        {t('prayer.today')}
                    </button>
                )}

                <button type="button" className="zenith-prayer__note-btn" onClick={onOpenNote}>
                    <PenLine size={13} />
                    <span>{isToday ? t('prayer.openNote') : t('prayer.openDayNote')}</span>
                </button>
            </div>

            <p className="zenith-prayer__meta">
                {hijriLabel && <span>{hijriLabel}</span>}
                <span className="zenith-prayer__place">
                    <MapPin size={11} />
                    {placeLabel}
                </span>
                <span>{methodLabel}</span>
                {source && (
                    <span
                        className="zenith-prayer__offline"
                        title={t(
                            source.pending ? 'prayer.table.pendingHint' : 'prayer.api.fallback'
                        )}
                    >
                        {source.pending ? <CloudDownload size={11} /> : <CloudOff size={11} />}
                        {t(
                            source.origin === 'missing'
                                ? source.pending
                                    ? 'prayer.table.pending'
                                    : 'prayer.table.unavailable'
                                : source.pending
                                  ? 'prayer.table.calcPending'
                                  : 'prayer.table.calcFailed'
                        )}
                    </span>
                )}
            </p>

            {next && (
                <div className="zenith-prayer__next">
                    <span className="zenith-prayer__kicker">
                        {t('prayer.next')}
                        {next.tomorrow && ` · ${t('prayer.tomorrow')}`}
                    </span>
                    <span className="zenith-prayer__next-name">{t(`prayer.${next.id}`)}</span>
                    <span className="zenith-prayer__next-time">
                        {formatClock(next.at, t.locale)}
                    </span>
                    <span className="zenith-prayer__countdown">
                        {t('prayer.in', {
                            time: formatCountdown(
                                next.minutesAway,
                                t('common.hourShort'),
                                t('common.minShort')
                            ),
                        })}
                    </span>
                </div>
            )}

            <PrayerTimeline times={times} record={record} nowMinutes={nowMinutes} />
        </header>
    );
};
