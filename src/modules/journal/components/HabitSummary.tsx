import React, { type CSSProperties, type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import type { HabitRow, HabitSummary as Summary } from '../services/habitMonth';
import { useCountUp } from './useCountUp';

interface HabitSummaryProps {
    summary: Summary;
    animate: boolean;
}

interface CardProps {
    labelKey: string;
    percent: number;
    /** The row the figure belongs to; absent on the average card. */
    row?: HabitRow | null;
    /** The line under the card — a streak, or the total done. */
    foot: string;
    color?: string;
    animate: boolean;
}

const HabitCard: FC<CardProps> = ({ labelKey, percent, row, foot, color, animate }) => {
    const t = useTranslation();
    const shown = useCountUp(percent, animate);
    const hue = color ?? row?.tracker.color;

    return (
        <div
            className="zenith-hcard"
            style={{ '--hmon-color': hue ?? 'var(--zenith-accent)' } as CSSProperties}
        >
            <span className="zenith-hcard__label">{t(labelKey)}</span>
            <div className="zenith-hcard__figure">
                <span className="zenith-hcard__value">{Math.round(shown)}%</span>
                <span
                    className="zenith-hcard__ring"
                    style={{ '--hmon-pct': `${shown}%` } as CSSProperties}
                    aria-hidden="true"
                />
            </div>
            {row && (
                <span className="zenith-hcard__pill">
                    <DynamicIcon name={row.tracker.icon} size={11} />
                    <span className="zenith-hcard__pill-text">{row.tracker.label}</span>
                </span>
            )}
            <p className="zenith-hcard__foot">{foot}</p>
        </div>
    );
};

/**
 * The month in three numbers: the habit that went best, the one that went
 * worst, and the average across them.
 *
 * Worst is named on purpose. A dashboard that only reports your best habit is
 * a dashboard you stop believing, and the one that slipped is the only one the
 * next month can do anything about. It carries its longest streak alongside,
 * so a bad rate still shows what the habit is capable of.
 */
export const HabitSummary: FC<HabitSummaryProps> = ({ summary, animate }) => {
    const t = useTranslation();
    const { best, worst, average, totalDone } = summary;

    if (!best || !worst) return null;

    // One tracker is its own best, worst AND average — three cards would be one
    // figure printed three times under headings that contradict each other.
    const single = best.tracker.id === worst.tracker.id;

    if (single) {
        return (
            <div className="zenith-hcards">
                <HabitCard
                    labelKey="habits.only"
                    percent={Math.round(best.rate * 100)}
                    row={best}
                    foot={`${t('habits.longestStreak', { count: best.streak })} · ${t.plural(
                        'habits.totalDone',
                        totalDone
                    )}`}
                    animate={animate}
                />
            </div>
        );
    }

    return (
        <div className="zenith-hcards">
            <HabitCard
                labelKey="habits.best"
                percent={Math.round(best.rate * 100)}
                row={best}
                foot={t('habits.longestStreak', { count: best.streak })}
                animate={animate}
            />
            <HabitCard
                labelKey="habits.worst"
                percent={Math.round(worst.rate * 100)}
                row={worst}
                foot={t('habits.longestStreak', { count: worst.streak })}
                animate={animate}
            />
            <HabitCard
                labelKey="habits.average"
                percent={Math.round(average * 100)}
                color="var(--zenith-accent)"
                foot={t.plural('habits.totalDone', totalDone)}
                animate={animate}
            />
        </div>
    );
};
