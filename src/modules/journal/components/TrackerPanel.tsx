import React, { type CSSProperties, type FC } from 'react';
import { useTranslation, type Translator } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { trackerHistory } from '../services/journalStats';
import { summarizeTracker } from './trackerSummary';
import { clampRate } from './dialGeometry';
import { TrackerPlot } from './TrackerPlot';

/** "today" / "3 d ago" / "never" — how stale the tracker is, in words. */
function staleness(sinceLast: number | null, t: Translator): string {
    if (sinceLast === null) return t('journal.stats.never');
    if (sinceLast === 0) return t('journal.stats.today');
    return t('journal.stats.daysAgo', { count: sinceLast });
}

interface TrackerPanelProps {
    stat: TrackerStat;
    /** Height of the window plot, in px. Zero leaves it out. */
    plotHeight: number;
}

/**
 * The active tracker's window, read out beside the ring.
 *
 * The ring used to carry a coloured arc for the tracker's coverage, and the
 * arc was the whole of what the dial said about the window: one figure, drawn
 * rather than written, on a ring that already had four other jobs. It is a
 * number now, and having stopped drawing it there is room to say the three
 * things a coverage figure cannot.
 *
 * Because "eleven days of thirty" is the same number whether they were eleven
 * in a row or one every third day, and the same again whether the last of them
 * was this morning or three weeks ago. The run and the staleness are what tell
 * those apart; the plot is the shape none of the three can draw.
 *
 * Everything here is about ONE tracker — the one in the middle of the ring. The
 * journal's own numbers stay in the header and in the metrics strip below,
 * where they cannot be mistaken for this tracker's.
 */
export const TrackerPanel: FC<TrackerPanelProps> = ({ stat, plotHeight }) => {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);
    const history = trackerHistory(stat.series);
    const dayShort = t('journal.stats.dayShort');
    const percent = Math.round(clampRate(stat.rate) * 100);

    const stats = [
        {
            key: 'coverage',
            lead: true,
            value: `${percent}%`,
            label: t('journal.stats.coverageDays', {
                count: stat.days,
                days: stat.windowDays,
            }),
        },
        {
            key: 'run',
            lead: false,
            value: `${history.currentRun} ${dayShort}`,
            label: t('journal.stats.runLabel', { count: history.bestRun }),
        },
        {
            key: 'last',
            lead: false,
            value: staleness(history.sinceLast, t),
            label: t('journal.stats.lastMark'),
        },
    ];

    return (
        <div
            className="zenith-jdial__panel"
            style={{ ['--hmon-color' as string]: stat.tracker.color } as CSSProperties}
            aria-label={t('journal.stats.panelAria', { name: stat.tracker.label })}
        >
            {stats.map((row) => (
                <div
                    key={row.key}
                    className={`zenith-jstat ${row.lead ? 'zenith-jstat--lead' : ''}`}
                >
                    <span className="zenith-jstat__value">{row.value}</span>
                    <span className="zenith-jstat__label">{row.label}</span>
                </div>
            ))}

            {plotHeight > 0 && (
                <div className="zenith-jstat__plot">
                    <TrackerPlot stat={stat} height={plotHeight} />
                    <span className="zenith-jstat__label">{summary.axisLabel}</span>
                </div>
            )}
        </div>
    );
};
