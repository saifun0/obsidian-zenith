import React, { type CSSProperties, type FC } from 'react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import { useTranslation } from '../../../core/i18n';
import type { HabitCell, HabitRow } from '../services/habitMonth';
import type { TrackerStat } from '../services/journalStats';
import { valueLabel } from './HabitTrack';
import { summarizeTracker } from './trackerSummary';
import { trackerWindow } from './trackerWindow';

interface HabitGlanceProps {
    /** One row per tracker over the window, oldest day first. */
    rows: HabitRow[];
    /** The same trackers' window statistics, in the same order. */
    stats: TrackerStat[];
    today: string;
    animate: boolean;
}

/**
 * Today's mark while today is still open.
 *
 * A day that has not ended cannot have been missed yet, so an unticked today
 * is drawn as a place still waiting for its mark rather than as a skip. It is
 * also the column the card is most often opened to check.
 */
function isOpenToday(cell: HabitCell, today: string): boolean {
    return cell.date === today && cell.state !== 'done' && cell.state !== 'partial';
}

/**
 * Every tracker at once: one row each, its recent days, one figure.
 *
 * It was a deck — one tracker's figure at a time, the rest behind pips and a
 * timer — so the one question a habit card is opened to answer, "how are my
 * habits going", took a minute of watching to answer for eight of them. A row
 * apiece answers it in a glance, and the day marks are the same four states the
 * journal's month grid draws, so a dot here means what a dot there means.
 *
 * Every row carries the whole window; the stylesheet drops the oldest days as
 * the card narrows, from thirty to fourteen to seven. Asking the container
 * rather than the size preset is what lets a card resized to an odd width still
 * land on a whole number of weeks.
 */
export const HabitGlance: FC<HabitGlanceProps> = ({ rows, stats, today, animate }) => {
    const t = useTranslation();
    const windowDays = rows[0]?.cells.length ?? 0;

    return (
        <ul
            className={`zenith-jhab ${animate ? '' : 'is-still'}`}
            aria-label={t('journal.widget.habitsAria', { days: windowDays })}
        >
            {rows.map((row, i) => {
                const stat = stats[i];
                const summary = summarizeTracker(stat, t);
                const reading = trackerWindow(stat, t);
                const figure = `${summary.value}${summary.suffix}`;

                const details = [`${row.tracker.label} — ${figure}`, summary.basis];
                if (row.tracker.kind !== 'check') {
                    details.push(
                        t('journal.stats.coverageDays', {
                            count: reading.days,
                            days: reading.windowDays,
                        })
                    );
                }
                details.push(`${t('journal.stats.lastMark')}: ${reading.lastMark}`);

                return (
                    <li
                        key={row.tracker.id}
                        className="zenith-jhab__row"
                        style={
                            {
                                '--jhab-color': row.tracker.color,
                                '--jhab-at': i,
                            } as CSSProperties
                        }
                        title={details.join('\n')}
                        aria-label={details.join(', ')}
                    >
                        <span className="zenith-jhab__icon" aria-hidden="true">
                            <DynamicIcon name={row.tracker.icon} size={14} />
                        </span>
                        <span className="zenith-jhab__name">{row.tracker.label}</span>
                        <span className="zenith-jhab__days" aria-hidden="true">
                            {row.cells.map((cell) => (
                                <span
                                    key={cell.date}
                                    className={`zenith-jhab__day is-${
                                        isOpenToday(cell, today) ? 'open' : cell.state
                                    }`}
                                    style={{ '--jhab-fill': cell.fill } as CSSProperties}
                                    title={
                                        isOpenToday(cell, today)
                                            ? `${cell.date} — ${t('journal.widget.todayOpen')}`
                                            : `${cell.date} — ${valueLabel(row, cell, t)}`
                                    }
                                />
                            ))}
                        </span>
                        <span className="zenith-jhab__figure">
                            {summary.value}
                            {summary.suffix && (
                                <span className="zenith-jhab__suffix">{summary.suffix}</span>
                            )}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
};
