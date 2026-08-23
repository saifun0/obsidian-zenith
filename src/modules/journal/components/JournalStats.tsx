import React, { useMemo, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import type { JournalTracker } from '../../../core/journalConfig';
import type { JournalEntry } from '../../../store/journalSlice';
import type { TrackerValue } from '../../../store/journalSlice';
import { entriesByDate, journalStats } from '../services/journalStats';
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
}

const WINDOW_DAYS = 30;

/**
 * The journal's numbers: how much of it exists, and what the trackers did.
 *
 * Coverage leads, because every figure below it is conditional on it — three
 * entries and thirty entries produce figures that look equally confident and
 * are not.
 *
 * Below it, the month. This used to be a plot per tracker over a rolling
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
}) => {
    const t = useTranslation();
    const stats = useMemo(
        () => journalStats(entries, trackers, today, WINDOW_DAYS),
        [entries, trackers, today]
    );
    const byDate = useMemo(() => entriesByDate(entries), [entries]);

    const lastEntry =
        stats.lastEntryDate === null
            ? t('journal.stats.never')
            : stats.lastEntryDate === today
              ? t('journal.stats.today')
              : stats.lastEntryDate;

    const metrics = [
        {
            key: 'streak',
            value: String(stats.currentStreak),
            label: t('journal.stats.streakBest', { count: stats.longestStreak }),
        },
        { key: 'last', value: lastEntry, label: t('journal.stats.lastEntry') },
        { key: 'words', value: String(stats.words), label: t('journal.stats.wordsInWindow') },
    ];

    return (
        <div className="zenith-jstats">
            <div className="zenith-jstats__head">
                <div className="zenith-jstats__coverage">
                    <span className="zenith-jstats__eyebrow">
                        {t('journal.stats.windowOf', { days: stats.windowDays })}
                    </span>
                    <span className="zenith-jstats__figure">
                        {stats.inRange}
                        <span className="zenith-jstats__figure-of">/{stats.windowDays}</span>
                        <span className="zenith-jstats__figure-label">
                            {t('journal.stats.daysRecorded')}
                        </span>
                    </span>
                </div>
                <div className="zenith-jstats__metrics">
                    {metrics.map((m) => (
                        <div key={m.key} className="zenith-jstats__metric">
                            <span className="zenith-jstats__metric-value">{m.value}</span>
                            <span className="zenith-jstats__metric-label">{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="zenith-jstats__coverage-block">
                <CoverageStrip stats={stats} today={today} height={10} />
                <div className="zenith-jstats__axis-row">
                    <span>{t('journal.stats.axisStart', { days: stats.windowDays })}</span>
                    <span>{t('journal.stats.axisToday')}</span>
                </div>
            </div>

            <HabitMonth
                byDate={byDate}
                trackers={trackers}
                anchor={monthAnchor}
                today={today}
                animate={animate}
                replay={replay}
                onSetValue={onSetValue}
            />

        </div>
    );
};
