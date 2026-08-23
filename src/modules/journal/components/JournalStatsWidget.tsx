import React, { useMemo, type FC } from 'react';
import { NotebookPen, CalendarDays } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { activeTrackers } from '../../../core/journalConfig';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import type { WidgetSize } from '../../dashboard/grid/gridTypes';
import { journalStats } from '../services/journalStats';
import { TrackerStatRow, type TrackerRowScale } from './TrackerStatRow';

const WINDOW_DAYS = 30;

interface SizeLayout extends TrackerRowScale {
    rows: number;
    /** The three-up metric row. */
    metrics: boolean;
}

/**
 * What each size shows.
 *
 * Three different summaries rather than one truncated three ways. Every size
 * shows the whole window — the plot is what says *when* something was
 * recorded, and cropping it to a week would make a small card answer a
 * different question from a large one. What grows is its height.
 *
 * The day-by-day coverage strip that used to sit under the header is gone: the
 * plots under every tracker already say which days were recorded, and saying
 * it twice cost the rows the room they needed.
 */
const LAYOUT: Record<WidgetSize, SizeLayout> = {
    sm: { rows: 3, metrics: false, plotHeight: 12, showBasis: false },
    md: { rows: 5, metrics: false, plotHeight: 16, showBasis: true },
    lg: { rows: 6, metrics: true, plotHeight: 20, showBasis: true },
};

/**
 * JournalStatsWidget — what the journal has collected, and nothing to click.
 *
 * The card now leads with how much data it is standing on. "3 / 30" was a 10px
 * footnote under an eyebrow, which put the caveat to every average below it in
 * the smallest type on the card; it is the headline instead.
 *
 * Deliberately read-only: values are set in the check-in widget, in the note's
 * own block, or in the journal view, and the button at the bottom goes there.
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
    const shown = stats.trackers.slice(0, layout.rows);
    const hidden = stats.trackers.length - shown.length;

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

    const covered = stats.windowDays > 0 ? (stats.inRange / stats.windowDays) * 100 : 0;

    return (
        <div className={`zenith-jw zenith-jw--stats zenith-jw--${size}`}>
            {/* The ring is the coverage and the number sits inside it: the
                share reads at a glance, the count still reads exactly. The
                streak moves out to a chip of its own — it is a different
                quantity, and sharing a line with the coverage buried it. */}
            <div className="zenith-jw__head">
                <span
                    className="zenith-jw__ring"
                    style={{ ['--jw-covered' as string]: `${covered}%` }}
                >
                    <span className="zenith-jw__ring-num">{stats.inRange}</span>
                </span>
                <span className="zenith-jw__head-text">
                    <span className="zenith-jw__head-main">
                        {t('journal.widget.coverage', {
                            count: stats.inRange,
                            days: stats.windowDays,
                        })}
                    </span>
                    {size !== 'sm' && (
                        <span className="zenith-jw__head-sub">{t('journal.stats.daysRecorded')}</span>
                    )}
                </span>
                <span className="zenith-jw__streak">
                    {t('journal.stats.streakShort')} {stats.currentStreak}
                </span>
                {/* In the corner, unlabelled: the card is a summary you read,
                    and the way out of it does not need a line of its own at the
                    bottom — that line was the widest element on a small card
                    and said what its icon already says. */}
                <button
                    className="zenith-jw__open"
                    onClick={openJournal}
                    aria-label={t('journal.widget.openJournal')}
                    title={t('journal.widget.openJournal')}
                >
                    <CalendarDays size={15} />
                </button>
            </div>

            {layout.metrics && (
                <div className="zenith-jw__metrics">
                    {metrics.map((m) => (
                        <div key={m.key} className="zenith-jw__metric">
                            <span className="zenith-jw__metric-value">{m.value}</span>
                            <span className="zenith-jw__metric-label">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {stats.trackers.length === 0 ? (
                <div className="zenith-jw__empty">
                    <NotebookPen size={24} strokeWidth={1.5} />
                    <span>{t('journal.noTrackers')}</span>
                </div>
            ) : (
                <ul className="zenith-jrows">
                    {shown.map((stat) => (
                        <TrackerStatRow key={stat.tracker.id} stat={stat} scale={layout} />
                    ))}
                </ul>
            )}

            {hidden > 0 && (
                <span className="zenith-jw__more">{t('journal.widget.more', { count: hidden })}</span>
            )}
        </div>
    );
};
