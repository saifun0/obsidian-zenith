import { useFeature } from '../../../core/useFeature';
import React, { useMemo, type FC } from 'react';
import { ChevronLeft, ChevronRight, Grid3x3 } from 'lucide-react';
import { coerceTrackerValue, trackerColor, type JournalTracker } from '../../../core/journalConfig';
import { useTranslation } from '../../../core/i18n';
import type { JournalEntry } from '../../../store/journalSlice';
import type { JournalWeekStart } from '../../../store/settingsSlice';
import { isJournalled } from '../services/journalStats';
import { keptOn } from '../services/habitMonth';
import { monthGrid, weekdayLabels, monthLabel, isoToDate, sameMonth } from '../services/journalDates';
import { weekOfRange } from '../services/reviewPeriods';

interface JournalCalendarProps {
    /** Any date inside the month being shown. */
    monthAnchor: string;
    selected: string;
    today: string;
    byDate: Map<string, JournalEntry>;
    weekStart: JournalWeekStart;
    /**
     * Tracker whose value tints the day cells — the first `scale` one, by
     * convention the mood. Undefined when no scale tracker is configured, and
     * the calendar then falls back to marking days as simply written or not.
     */
    colorBy?: JournalTracker;
    /** Every configured tracker, for the completion ring around a day. */
    trackers: JournalTracker[];
    /** Dates that have at least one task due, for the marker dot. */
    taskDays: Set<string>;
    onSelect: (date: string) => void;
    onOpen: (date: string) => void;
    onMonthChange: (anchor: string) => void;
    /** Switch to the year in pixels; absent while that feature is off. */
    onYear?: () => void;
    /** Open the note of the week a row is; absent while reviews are off. */
    onWeek?: (date: string) => void;
}

/**
 * The month grid.
 *
 * Two readings, kept separate on purpose. The **fill** inside each day is its
 * mood (or whichever scale tracker comes first), so a month reads as a mood
 * strip at a glance. The **ring** around it is how much of that day was kept —
 * the same question the habit grid's totals row answers, asked one day at a
 * time. Merged into a single tinted cell, as they were, a good mood on a day
 * you did nothing looked exactly like a full day.
 *
 * Days journalled without either still get a neutral dot instead of being left
 * blank, because "wrote something" and "wrote nothing" is the distinction the
 * calendar existed to show in the first place.
 */
export const JournalCalendar: FC<JournalCalendarProps> = ({
    monthAnchor,
    selected,
    today,
    byDate,
    weekStart,
    colorBy,
    trackers,
    taskDays,
    onSelect,
    onOpen,
    onMonthChange,
    onYear,
    onWeek,
}) => {
    const t = useTranslation();
    const wordsOn = useFeature('journal.wordCount');
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';

    const days = useMemo(() => monthGrid(monthAnchor, weekStart), [monthAnchor, weekStart]);
    const weekdays = useMemo(() => weekdayLabels(locale, weekStart), [locale, weekStart]);

    /** Days of the month itself — the grid also carries neighbouring weeks. */
    const inMonth = useMemo(
        () => days.filter((date) => sameMonth(date, monthAnchor)),
        [days, monthAnchor]
    );

    const written = useMemo(
        () => inMonth.filter((date) => isJournalled(byDate.get(date))).length,
        [inMonth, byDate]
    );

    /** Longest unbroken run of journalled days inside this month. */
    const bestRun = useMemo(() => {
        let best = 0;
        let run = 0;
        for (const date of inMonth) {
            run = isJournalled(byDate.get(date)) ? run + 1 : 0;
            if (run > best) best = run;
        }
        return best;
    }, [inMonth, byDate]);

    const shiftMonth = (delta: number) => {
        const anchor = isoToDate(monthAnchor);
        anchor.setDate(1);
        anchor.setMonth(anchor.getMonth() + delta);
        onMonthChange(
            `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`
        );
    };

    return (
        <div className={`zenith-jcal${onWeek ? ' has-weeks' : ''}`}>
            <div className="zenith-jcal__head">
                <button
                    className="zenith-jcal__nav"
                    onClick={() => shiftMonth(-1)}
                    aria-label={t('clock.prevMonth')}
                >
                    <ChevronLeft size={16} />
                </button>
                <button
                    className="zenith-jcal__month"
                    onClick={() => onMonthChange(today)}
                    title={t('clock.thisMonth')}
                >
                    {monthLabel(monthAnchor, locale)}
                </button>
                <button
                    className="zenith-jcal__nav"
                    onClick={() => shiftMonth(1)}
                    aria-label={t('clock.nextMonth')}
                >
                    <ChevronRight size={16} />
                </button>
                {onYear && (
                    <button
                        className="zenith-jcal__nav zenith-jcal__scale"
                        onClick={onYear}
                        title={t('journal.year.open')}
                        aria-label={t('journal.year.open')}
                    >
                        <Grid3x3 size={15} />
                    </button>
                )}
            </div>

            <div className="zenith-jcal__weekdays">
                {onWeek && <span className="zenith-jcal__weekday is-week" aria-hidden="true" />}
                {weekdays.map((label, i) => (
                    <span key={i} className="zenith-jcal__weekday">
                        {label}
                    </span>
                ))}
            </div>

            <div className="zenith-jcal__grid">
                {days.map((date, index) => {
                    const entry = byDate.get(date);
                    const written = isJournalled(entry);
                    const outside = !sameMonth(date, monthAnchor);
                    const score = colorBy
                        ? coerceTrackerValue(colorBy.kind, entry?.values[colorBy.id])
                        : undefined;
                    const { kept, total } = keptOn(entry, trackers);
                    const ring = total > 0 ? Math.round((kept / total) * 100) : 0;

                    const classes = [
                        'zenith-jcal__day',
                        outside ? 'is-outside' : '',
                        date === today ? 'is-today' : '',
                        date === selected ? 'is-selected' : '',
                        written ? 'is-written' : '',
                        date > today ? 'is-future' : '',
                    ]
                        .filter(Boolean)
                        .join(' ');

                    const week = weekOfRange(date).week;
                    return (
                        <React.Fragment key={date}>
                            {onWeek && index % 7 === 0 && (
                                <button
                                    className="zenith-jcal__week"
                                    onClick={() => onWeek(date)}
                                    title={t('review.week.open', { week })}
                                    aria-label={t('review.week.open', { week })}
                                >
                                    {week}
                                </button>
                            )}
                            <button
                                className={classes}
                                style={{ ['--jcal-ring' as string]: `${ring}%` }}
                                onClick={() => onSelect(date)}
                                onDoubleClick={() => onOpen(date)}
                                aria-current={date === today ? 'date' : undefined}
                                aria-pressed={date === selected}
                                title={
                                    entry
                                        ? `${date}` +
                                          (wordsOn ? ` · ${t.plural('journal.words', entry.words)}` : '') +
                                          (total > 0 ? ` · ${t('journal.keptOn', { kept, total })}` : '')
                                        : date
                                }
                            >
                                {score !== undefined && colorBy && (
                                    <span
                                        className="zenith-jcal__fill"
                                        style={{
                                            background: `color-mix(in srgb, ${trackerColor(colorBy, score)} 26%, transparent)`,
                                        }}
                                    />
                                )}
                                {ring > 0 && <span className="zenith-jcal__ring" />}
                                <span className="zenith-jcal__num">{Number(date.slice(8, 10))}</span>
                                {written && score === undefined && <span className="zenith-jcal__dot" />}
                                {taskDays.has(date) && <span className="zenith-jcal__task-dot" />}
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* The month in two numbers, where the grid used to simply stop.
                Both are about the days themselves rather than the trackers, so
                they still say something on a journal with no trackers at all. */}
            <div className="zenith-jcal__foot">
                <span>{t('journal.cal.written', { count: written, days: inMonth.length })}</span>
                <span>{t('journal.cal.bestRun', { count: bestRun })}</span>
                {trackers.length > 0 && (
                    <span className="zenith-jcal__legend" title={t('journal.cal.ringHint')}>
                        <i aria-hidden="true" />
                        {t('journal.cal.ring')}
                    </span>
                )}
            </div>
        </div>
    );
};
