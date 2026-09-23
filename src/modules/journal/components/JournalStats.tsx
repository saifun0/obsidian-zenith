import React, { useMemo, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { daysBetweenIso } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import type { JournalEntry } from '../../../store/journalSlice';
import type { TrackerValue } from '../../../store/journalSlice';
import { entriesByDate, journalStats } from '../services/journalStats';
import { isoToDate } from '../services/journalDates';
import { CoverageStrip } from './CoverageStrip';
import { HabitMonth } from './HabitMonth';

interface JournalStatsProps {
    entries: JournalEntry[];
    trackers: JournalTracker[];
    today: string;
    /** Any date in the month the habit grid should show. */
    monthAnchor: string;
    /** The user's motion setting; off, the grid appears without animating. */
    animate: boolean;
    /** Changes when the reader asks for a refresh: replays the entrance. */
    replay: number;
    /** Recording a day from the grid. Absent makes the grid read-only. */
    onSetValue?: (tracker: JournalTracker, date: string, next: TrackerValue | null) => void;
    /** The thirty-day card — the `journal.stats` feature. */
    showOverview?: boolean;
    /** The words figure on it — `journal.wordCount`. */
    showWords?: boolean;
    /** The month of habits — `journal.habitMonth`. */
    showMonth?: boolean;
}

const WINDOW_DAYS = 30;

/** Within a week, "yesterday" / "3 days ago" says more than the date does. */
const RELATIVE_DAYS = 7;

/**
 * The journal's numbers: how much of it exists, and what the trackers did.
 *
 * Two cards. The first is the journal over the last thirty days — four figures
 * of equal weight over the strip that says where the entries fall. Coverage
 * used to be a 2.4rem headline with the other three pushed to the far edge,
 * which made the least actionable number on the page the loudest one.
 *
 * The second is the month. This used to be a plot per tracker over a rolling
 * 30-day window, which could answer "how often" but never "which days": the
 * plots carried no dates, so a gap in one couldn't be lined up with a gap in
 * another, and nothing in them could be clicked. The grid answers both by
 * putting every tracker on the same dated axis.
 */
export const JournalStats: FC<JournalStatsProps> = ({
    entries,
    trackers,
    today,
    monthAnchor,
    animate,
    replay,
    onSetValue,
    showOverview = true,
    showWords = true,
    showMonth = true,
}) => {
    const t = useTranslation();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const stats = useMemo(
        () => journalStats(entries, trackers, today, WINDOW_DAYS),
        [entries, trackers, today]
    );
    const byDate = useMemo(() => entriesByDate(entries), [entries]);

    const lastEntry = useMemo(() => {
        const last = stats.lastEntryDate;
        if (last === null) return t('journal.stats.never');
        if (last === today) return t('journal.stats.today');
        const ago = daysBetweenIso(last, today);
        if (ago > 0 && ago < RELATIVE_DAYS) {
            return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-ago, 'day');
        }
        return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
            isoToDate(last)
        );
    }, [stats.lastEntryDate, today, locale, t]);

    const metrics = [
        {
            key: 'streak',
            value: String(stats.currentStreak),
            label: t('journal.stats.streakBest', { count: stats.longestStreak }),
        },
        { key: 'last', value: lastEntry, label: t('journal.stats.lastEntry') },
        ...(showWords
            ? [
                  {
                      key: 'words',
                      value: stats.words.toLocaleString(locale),
                      label: t('journal.stats.wordsInWindow'),
                  },
              ]
            : []),
    ];

    return (
        <div className="zenith-jstats">
            {showOverview && (
                <section
                    className="zenith-jstats__overview"
                    aria-label={t('journal.stats.windowOf', { days: stats.windowDays })}
                >
                    <div className="zenith-jstats__metric">
                        <span className="zenith-jstats__metric-value">
                            {stats.inRange}
                            <span className="zenith-jstats__figure-of">/{stats.windowDays}</span>
                        </span>
                        <span className="zenith-jstats__metric-label">
                            {t('journal.stats.daysRecorded')}
                        </span>
                    </div>
                    {metrics.map((m) => (
                        <div key={m.key} className="zenith-jstats__metric">
                            <span className="zenith-jstats__metric-value">{m.value}</span>
                            <span className="zenith-jstats__metric-label">{m.label}</span>
                        </div>
                    ))}

                    {/* The window, drawn: where the entries fall, oldest on the left.
                    Its two ends are named in one line rather than in an axis row
                    of their own — the strip is evidence for the figures above
                    it, not a chart that needs reading. */}
                    <div className="zenith-jstats__coverage-block">
                        <span className="zenith-jstats__axis">
                            {t('journal.stats.windowOf', { days: stats.windowDays })}
                        </span>
                        <CoverageStrip stats={stats} today={today} height={6} />
                        <span className="zenith-jstats__axis">{t('journal.stats.axisToday')}</span>
                    </div>
                </section>
            )}

            {showMonth && (
                <HabitMonth
                    byDate={byDate}
                    trackers={trackers}
                    anchor={monthAnchor}
                    today={today}
                    animate={animate}
                    replay={replay}
                    onSetValue={onSetValue}
                />
            )}
        </div>
    );
};
