import React, { type FC } from 'react';
import { useTranslation } from '../../../core/i18n';
import type { JournalStatsResult } from '../services/journalStats';
import { addDays } from '../services/journalDates';

interface CoverageStripProps {
    stats: JournalStatsResult;
    today: string;
    /** Strip height in px. */
    height: number;
}

/**
 * One cell per day of the window: written, written-and-part-of-the-streak, or
 * blank.
 *
 * This is the header's evidence. "3 / 30" says how much data there is; the
 * strip says *where* it is — three entries last week and three from a month ago
 * are the same number and a completely different situation.
 *
 * It also absorbs the streak, which used to float in the corner as a flame and
 * a digit with nothing to relate to. Accenting the trailing run puts the number
 * on top of the days it counts.
 */
export const CoverageStrip: FC<CoverageStripProps> = ({ stats, today, height }) => {
    const t = useTranslation();

    // The streak runs back from today (or from yesterday, when today isn't
    // written yet) — mirroring how `currentStreak` counts it.
    const streakDays = new Set<string>();
    if (stats.currentStreak > 0) {
        const last = stats.filledDates.has(today) ? today : addDays(today, -1);
        for (let i = 0; i < stats.currentStreak; i++) streakDays.add(addDays(last, -i));
    }

    const days: string[] = [];
    for (let i = stats.windowDays - 1; i >= 0; i--) days.push(addDays(today, -i));

    return (
        <div
            className="zenith-jcov"
            style={{ height: `${height}px` }}
            role="img"
            aria-label={t('journal.widget.entriesOf', {
                count: stats.inRange,
                days: stats.windowDays,
            })}
        >
            {days.map((date) => {
                const filled = stats.filledDates.has(date);
                const streak = streakDays.has(date);
                return (
                    <span
                        key={date}
                        className={`zenith-jcov__cell ${streak ? 'is-streak' : filled ? 'is-filled' : ''}`}
                        title={filled ? date : `${date} · ${t('journal.stats.noEntry')}`}
                    />
                );
            })}
        </div>
    );
};
