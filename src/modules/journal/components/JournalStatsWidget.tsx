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
import { TrackerDeck, type TrackerDeckScale } from './TrackerDeck';

const WINDOW_DAYS = 30;

interface SizeLayout extends TrackerDeckScale {
    /** The three-up journal metrics under the deck. */
    metrics: boolean;
}

/**
 * What each size shows.
 *
 * The deck is on every one of them — it *is* the card — and what grows around
 * it is context: the basis under the figure, then the active tracker's window
 * as a plot, then the three journal-wide numbers that belong to no tracker at
 * all.
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
 * thing the row exists to say — in the smallest type on it. Then it was a dial,
 * which put one tracker in the middle of a ring and the rest around the edge.
 * It is a deck now: one tracker's icon and figure at a time, swapping for the
 * next. See `TrackerDeck`.
 *
 * The card carried a header too — the coverage, a streak chip and a button, in
 * a bordered row directly under the card's own title bar. Two headers stacked,
 * and the lower one shouting: a chip in a second colour and a bordered button
 * for what is, either way, a footnote. Neither number is about the tracker on
 * screen; both are about the journal as a whole. So they read as a footnote
 * now, in one thin line at the foot of the card, and the way to the journal is
 * a ghost button at the end of it.
 *
 * Deliberately read-only: values are set in the check-in widget, in the note's
 * own block, or in the journal view, and that button goes there.
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
            {stats.trackers.length === 0 ? (
                <div className="zenith-jw__empty">
                    <NotebookPen size={24} strokeWidth={1.5} />
                    <span>{t('journal.noTrackers')}</span>
                </div>
            ) : (
                <TrackerDeck stats={stats.trackers} scale={layout} />
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

            {/* The journal's own two numbers, and the way into it. The streak
                only comes down here on the sizes with no metrics row — the
                large card already sets it as a figure of its own, and a card
                that says "streak 11" twice has one of them too many. */}
            <div className="zenith-jw__meta">
                <span className="zenith-jw__meta-fact">
                    <CheckCircle2 size={11} />
                    <span>
                        {t('journal.widget.coverage', {
                            count: stats.inRange,
                            days: stats.windowDays,
                        })}
                    </span>
                </span>
                {!layout.metrics && (
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
