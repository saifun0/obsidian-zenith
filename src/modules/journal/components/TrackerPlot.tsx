import React, { type CSSProperties, type FC } from 'react';
import { SCALE_COLORS, SCALE_MAX, type JournalTracker } from '../../../core/journalConfig';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';

/** One day's column colour: a scale runs red → green, other kinds keep theirs. */
function pointColor(tracker: JournalTracker, value: number): string {
    if (tracker.kind === 'scale') {
        return SCALE_COLORS[Math.min(SCALE_MAX, Math.max(1, Math.round(value)))];
    }
    return tracker.color;
}

interface TrackerPlotProps {
    stat: TrackerStat;
    /** Plot height in px. The widget scales this with its size. */
    height: number;
}

/**
 * One column per day of the window — a tracker's shape over the month.
 *
 * Columns are drawn against the tracker's OWN scale (`scaleMax`), so a count of
 * reps is a count of reps rather than a fraction of some shared denominator.
 * Nothing here is comparable with the plot above or below it, and nothing
 * pretends to be.
 *
 * A day that recorded nothing draws as a faint hairline rather than a
 * zero-height gap. "I didn't track this" and "I tracked it as none" are
 * different facts, and this is the one place both are visible at once — which
 * matters most in the normal case of three entries in thirty days.
 */
export const TrackerPlot: FC<TrackerPlotProps> = ({ stat, height }) => {
    const t = useTranslation();

    return (
        <div
            className="zenith-jplot"
            style={{ height: `${height}px` } as CSSProperties}
            role="img"
            aria-label={stat.tracker.label}
        >
            {stat.series.map((point) => {
                const recorded = point.value !== null;
                const filled = recorded
                    ? Math.max(8, Math.min(100, (point.value! / Math.max(stat.scaleMax, 1)) * 100))
                    : 0;
                return (
                    <span key={point.date} className="zenith-jplot__slot">
                        <span
                            className={`zenith-jplot__bar ${recorded ? '' : 'is-blank'}`}
                            title={
                                recorded
                                    ? `${point.date} · ${point.value}`
                                    : `${point.date} · ${t('journal.stats.noEntry')}`
                            }
                            style={
                                recorded
                                    ? {
                                          height: `${filled}%`,
                                          background: pointColor(stat.tracker, point.value!),
                                      }
                                    : undefined
                            }
                        />
                    </span>
                );
            })}
        </div>
    );
};
