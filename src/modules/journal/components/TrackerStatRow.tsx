import React, { type FC } from 'react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import type { TrackerStat } from '../services/journalStats';
import { summarizeTracker } from './trackerSummary';
import { TrackerPlot } from './TrackerPlot';

export interface TrackerRowScale {
    /** Plot height in px. Zero hides it. */
    plotHeight: number;
    /** Show what the figure stands on ("avg · 3 d") under it. */
    showBasis: boolean;
}

interface TrackerStatRowProps {
    stat: TrackerStat;
    scale: TrackerRowScale;
}

/**
 * One tracker's line: who it is on the left, its window across the middle, its
 * figure on the right.
 *
 * All three on ONE line. Stacking the plot under the name doubled the row's
 * height, and three of those no longer fit the card they were drawn in.
 *
 * Colour does one job per channel. The tracker's identity is its icon, in the
 * colour chosen in settings; the value's colour lives only inside the plot,
 * where a scale runs red → green. A single bar carrying both meant "Mood"
 * rendered orange because its average was 2, not because Mood is yellow, and
 * there was no way to tell those apart.
 *
 * Read-only by design. Setting a value is what the check-in widget, the in-note
 * block and the journal view are for.
 */
export const TrackerStatRow: FC<TrackerStatRowProps> = ({ stat, scale }) => {
    const t = useTranslation();
    const { tracker } = stat;
    const summary = summarizeTracker(stat, t);

    return (
        <li
            className="zenith-jrow"
            style={{ ['--hmon-color' as string]: tracker.color }}
            title={`${tracker.label} · ${summary.basis}`}
        >
            <span className="zenith-jrow__name">
                <DynamicIcon name={tracker.icon} size={14} />
                <span className="zenith-jrow__label">{tracker.label}</span>
            </span>

            {scale.plotHeight > 0 ? (
                <TrackerPlot stat={stat} height={scale.plotHeight} />
            ) : (
                <span />
            )}

            <span className="zenith-jrow__figure">
                <span className="zenith-jrow__value">
                    {summary.value}
                    {summary.suffix && <span className="zenith-jrow__unit">{summary.suffix}</span>}
                </span>
                {scale.showBasis && <span className="zenith-jrow__basis">{summary.basis}</span>}
            </span>
        </li>
    );
};
