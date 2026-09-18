import React, { type CSSProperties, type FC } from 'react';
import { TrendingUp, CalendarCheck2, Flame, Clock, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { summarizeTracker } from './trackerSummary';
import { trackerFacts } from './trackerWindow';
import { TrackerPlot } from './TrackerPlot';

interface TrackerPanelProps {
    stat: TrackerStat;
    /** Height of the window plot, in px. Zero leaves it out. */
    plotHeight: number;
}

const FACT_ICONS: Record<string, LucideIcon> = {
    average: TrendingUp,
    coverage: CalendarCheck2,
    run: Flame,
    last: Clock,
};

/**
 * The active tracker's window, read out beside the ring.
 *
 * Rendered as an organized grid of tactile metric tiles with clear icons,
 * prominent values, and consistent visual hierarchy.
 */
export const TrackerPanel: FC<TrackerPanelProps> = ({ stat, plotHeight }) => {
    const t = useTranslation();
    const summary = summarizeTracker(stat, t);
    const facts = trackerFacts(stat, t);

    return (
        <div
            className="zenith-jdial__panel"
            style={{ ['--hmon-color' as string]: stat.tracker.color } as CSSProperties}
            aria-label={t('journal.stats.panelAria', { name: stat.tracker.label })}
        >
            {facts.map((fact, i) => {
                const Icon = FACT_ICONS[fact.key];
                return (
                    <div
                        key={fact.key}
                        className={`zenith-jstat ${i === 0 ? 'zenith-jstat--lead' : ''} zenith-jstat--${fact.key}`}
                    >
                        <div className="zenith-jstat__header">
                            {Icon && <Icon size={12} className="zenith-jstat__icon" />}
                            <span className="zenith-jstat__label">{fact.label}</span>
                        </div>
                        <span className="zenith-jstat__value">{fact.value}</span>
                    </div>
                );
            })}

            {plotHeight > 0 && (
                <div className="zenith-jstat__plot">
                    <TrackerPlot stat={stat} height={plotHeight} />
                    <span className="zenith-jstat__label">{summary.axisLabel}</span>
                </div>
            )}
        </div>
    );
};
