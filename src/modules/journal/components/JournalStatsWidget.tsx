import { useFeature } from '../../../core/useFeature';
import React, { useMemo, type CSSProperties, type FC } from 'react';
import { NotebookPen, CalendarDays, Flame, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { usableTrackers } from '../services/usableTrackers';
import { useReducedMotion } from '../../../components/shared/useCrossFade';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { useCardRoom } from '../../dashboard/cardRoom';
import { entriesByDate, journalStats } from '../services/journalStats';
import { recentHabits } from '../services/habitMonth';
import { HabitGlance } from './HabitGlance';

const WINDOW_DAYS = 30;

/** A tracker's row: as tall as it likes to be, and as short as it can go. */
const ROW_PX = 26;
const ROW_MIN_PX = 18;
/** The footnote line, and the three journal figures when there is room for them. */
const META_PX = 34;
const METRICS_PX = 70;

/**
 * JournalStatsWidget — every tracker's last few weeks, at a glance.
 *
 * One row per tracker: its icon and name, its recent days as marks, and one
 * figure. See `HabitGlance`. A card with the height to spare adds three
 * numbers about the journal as a whole, and every card ends on one thin line —
 * how much of the window was written on, the writing streak, and the way into
 * the journal.
 *
 * The card is as tall as its trackers: it follows its content. Where there
 * are more of them than the height it was given holds at full size, the rows
 * close up before anything scrolls.
 *
 * Those footnote numbers are the JOURNAL's, and nothing above them is: no row
 * repeats a streak or a day count of its own, so the card never shows two
 * different "streaks" side by side and leaves the reader to work out which is
 * which. A row's own run and coverage are on its tooltip.
 *
 * Deliberately read-only: values are set in the check-in widget, in the note's
 * own block, or in the journal view, and that button goes there.
 */
export const JournalStatsWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const wordsOn = useFeature('journal.wordCount');
    const { plugin } = useApp();
    const entries = useZenithStore((s) => s.journalEntries);
    const settings = useZenithStore((s) => s.settings);
    const animations = useZenithStore((s) => s.settings.uiAnimations);
    const reduced = useReducedMotion();
    const trackers = useMemo(() => usableTrackers(settings), [settings]);
    const weekStart = settings.journalWeekStart;

    const today = getTodayString();
    const stats = useMemo(
        () => journalStats(entries, trackers, today, WINDOW_DAYS, weekStart),
        [entries, trackers, today, weekStart]
    );
    const rows = useMemo(
        () => recentHabits(entriesByDate(entries), trackers, today, WINDOW_DAYS, weekStart),
        [entries, trackers, today, weekStart]
    );

    const room = useCardRoom();
    const n = rows.length;
    // The three figures come when the trackers at full height leave room.
    const showMetrics = n > 0 && room.height >= n * ROW_PX + META_PX + METRICS_PX;
    const rowPx =
        n > 0 && room.height > 0
            ? Math.min(ROW_PX, Math.max(ROW_MIN_PX, Math.floor((room.height - META_PX) / n)))
            : ROW_PX;

    const openJournal = () => void plugin.moduleManager.get('journal')?.activateView();

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
        ...(wordsOn
            ? [
                  {
                      key: 'words',
                      value: String(stats.words),
                      label: t('journal.stats.wordsInWindow'),
                  },
              ]
            : []),
    ];

    return (
        <div
            className="zenith-jw zenith-jw--stats"
            style={{ '--jhab-row': `${rowPx}px` } as CSSProperties}
        >
            {rows.length === 0 ? (
                <p className="zenith-wempty">
                    <NotebookPen size={14} />
                    {t('journal.noTrackers')}
                </p>
            ) : (
                <HabitGlance
                    rows={rows}
                    stats={stats.trackers}
                    today={today}
                    animate={animations && !reduced}
                />
            )}

            {showMetrics && rows.length > 0 && (
                <div className="zenith-jw__metrics">
                    {metrics.map((m) => (
                        <div key={m.key} className="zenith-jw__metric">
                            <span className="zenith-jw__metric-value">{m.value}</span>
                            <span className="zenith-jw__metric-label">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* The journal's own two numbers, and the way into it. The streak
                only comes down here on the sizes with no metrics row — the
                large card already sets it as a figure of its own, and a card
                that says "streak 11" twice has one of them too many. */}
            <div className="zenith-jw__meta zenith-wsink">
                <span className="zenith-jw__meta-fact">
                    <CheckCircle2 size={11} />
                    <span>
                        {t('journal.widget.coverage', {
                            count: stats.inRange,
                            days: stats.windowDays,
                        })}
                    </span>
                </span>
                {!showMetrics && (
                    <span className="zenith-jw__meta-fact">
                        <Flame size={11} />
                        <span>
                            {t('journal.stats.streakShort')} {stats.currentStreak}
                        </span>
                    </span>
                )}
                <button
                    className="zenith-jw__open"
                    onClick={openJournal}
                    aria-label={t('journal.widget.openJournal')}
                    title={t('journal.widget.openJournal')}
                >
                    <CalendarDays size={14} />
                </button>
            </div>
        </div>
    );
};
