import React, { useMemo, type FC } from 'react';
import { NotebookPen, CalendarDays, Flame, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { activeTrackers } from '../../../core/journalConfig';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import type { WidgetSize } from '../../dashboard/grid/gridTypes';
import { journalStats } from '../services/journalStats';
import { TrackerDial, type TrackerDialScale } from './TrackerDial';

const WINDOW_DAYS = 30;

interface SizeLayout extends TrackerDialScale {
    /** The three-up journal metrics under the dial. */
    metrics: boolean;
}

/**
 * What each size shows.
 *
 * The dial is on every one of them — it *is* the card — and what grows around
 * it is context: the basis under the figure, then the active tracker's window
 * as a plot, then the three journal-wide numbers that belong to no tracker at
 * all. A small card is not the dial cropped; it is the dial with nothing else
 * competing for the height.
 */
const LAYOUT: Record<WidgetSize, SizeLayout> = {
    sm: { showBasis: false, plotHeight: 0, metrics: false },
    md: { showBasis: true, plotHeight: 0, metrics: false },
    lg: { showBasis: true, plotHeight: 22, metrics: true },
};

/**
 * JournalStatsWidget — what the journal has collected, one thing at a time.
 *
 * This was a list: every tracker got a row, and each row set its figure — the
 * thing the row exists to say — in the smallest type on it. Four trackers made
 * four cramped lines and a footnote reading "one more, in the journal", which
 * is a list apologising for being a list.
 *
 * Now one tracker stands in the middle of the card and the rest are on the ring
 * around it, and the dial moves on by itself. See `TrackerDial`.
 *
 * The header keeps what belongs to the journal rather than to any tracker: how
 * much of the window was written on, and the streak. It lost its own small
 * coverage ring when the dial arrived — two arcs on one card, at two scales,
 * meaning two different things, is one arc too many.
 *
 * Deliberately read-only: values are set in the check-in widget, in the note's
 * own block, or in the journal view, and the corner button goes there.
 */
export const JournalStatsWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const entries = useZenithStore((s) => s.journalEntries);
    const configured = useZenithStore((s) => s.settings.journalTrackers);
    const trackers = useMemo(() => activeTrackers(configured), [configured]);

    const today = getTodayString();
    const stats = useMemo(
        () => journalStats(entries, trackers, today, WINDOW_DAYS),
        [entries, trackers, today]
    );

    const layout = LAYOUT[size];

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
        { key: 'words', value: String(stats.words), label: t('journal.stats.wordsInWindow') },
    ];

    return (
        <div className={`zenith-jw zenith-jw--stats zenith-jw--${size}`}>
            {/* One line, and it is about the journal: the dial below is about
                one tracker, and the two must not look like the same claim. */}
            <div className="zenith-jw__head">
                <span className="zenith-jw__head-text">
                    <span className="zenith-jw__head-main">
                        <CheckCircle2 size={13} className="zenith-jw__head-icon" />
                        <span>
                            {t('journal.widget.coverage', {
                                count: stats.inRange,
                                days: stats.windowDays,
                            })}
                        </span>
                    </span>
                </span>
                <span className="zenith-jw__streak">
                    <Flame size={12} className="zenith-jw__streak-flame" />
                    <span>{t('journal.stats.streakShort')} {stats.currentStreak}</span>
                </span>
                <button
                    className="zenith-jw__open"
                    onClick={openJournal}
                    aria-label={t('journal.widget.openJournal')}
                    title={t('journal.widget.openJournal')}
                >
                    <CalendarDays size={14} />
                </button>
            </div>

            {stats.trackers.length === 0 ? (
                <div className="zenith-jw__empty">
                    <NotebookPen size={24} strokeWidth={1.5} />
                    <span>{t('journal.noTrackers')}</span>
                </div>
            ) : (
                <TrackerDial stats={stats.trackers} scale={layout} />
            )}

            {layout.metrics && stats.trackers.length > 0 && (
                <div className="zenith-jw__metrics">
                    {metrics.map((m) => (
                        <div key={m.key} className="zenith-jw__metric">
                            <span className="zenith-jw__metric-value">{m.value}</span>
                            <span className="zenith-jw__metric-label">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
