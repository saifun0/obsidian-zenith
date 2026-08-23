import React, { type CSSProperties, type FC, type MouseEvent } from 'react';
import type { Translator } from '../../../core/i18n';
import { coerceTrackerValue, SCALE_MAX, trackerGoal } from '../../../core/journalConfig';
import type { HabitCell, HabitRow } from '../services/habitMonth';

interface HabitTrackProps {
    row: HabitRow;
    /** Which row this is, for the entrance stagger. */
    index: number;
    t: Translator;
    /**
     * The date just recorded in this row, so its mark and its run can react.
     * `nonce` rises with every write, which is what lets the same cell animate
     * again when it is touched twice.
     */
    pulse: { date: string; nonce: number } | null;
    /** Absent for a read-only grid. */
    onPick?: (row: HabitRow, cell: HabitCell, button: HTMLElement) => void;
}

/** What a cell's tooltip says the day recorded. */
function valueLabel(row: HabitRow, cell: HabitCell, t: Translator): string {
    const { tracker } = row;
    const value = coerceTrackerValue(tracker.kind, cell.value);

    if (value === undefined) {
        return cell.state === 'empty' ? t('journal.stats.noEntry') : t('habits.notDone');
    }
    if (typeof value === 'boolean') return t('habits.done');
    if (tracker.kind === 'scale') return `${value} / ${SCALE_MAX}`;

    const goal = trackerGoal(tracker);
    const unit = tracker.unit ? ` ${tracker.unit}` : '';
    return goal > 0 ? `${value} / ${goal}${unit}` : `${value}${unit}`;
}

/**
 * One habit across the month: a chain of day marks, with its runs behind them.
 *
 * The whole row is one positioned surface rather than a cell per column,
 * because a run of days that met their target is drawn as a single bar spanning
 * several of them — and a bar cannot live in one grid cell. Marks sit at the
 * centre of their day's column, computed as a percentage, so they stay lined up
 * with the headers above and the totals below at any width.
 */
export const HabitTrack: FC<HabitTrackProps> = ({ row, index, t, pulse, onPick }) => {
    const step = 100 / row.cells.length;
    const centre = (day: number) => step * (day - 0.5);

    /** The streak a day belongs to, if any. */
    const runOf = (column: number) =>
        row.runs.find((candidate) => column >= candidate.from && column <= candidate.to);

    /**
     * The chain's colour at a day column: full strength where a streak starts,
     * palest where it ends.
     *
     * Measured along the STREAK, not along the month. Spread over all thirty-one
     * days it was arithmetically present and visually absent — a week-long run
     * covers a quarter of the month, so its colour shifted by eight percent,
     * which is below the point at which anyone can see it. Anchored to the run
     * itself, every chain carries the full drift however short it is, and a day
     * standing alone is simply the colour at full strength.
     */
    const shade = (column: number) => {
        const streak = runOf(column);
        const along = streak ? (column - streak.from) / Math.max(streak.to - streak.from, 1) : 0;
        const strength = Math.round(100 - along * 45);
        return `color-mix(in oklab, var(--hmon-color) ${strength}%, var(--hmon-fade))`;
    };
    return (
        <div
            className="zenith-hmon__track"
            data-at={index}
            style={{ '--hmon-color': row.tracker.color } as CSSProperties}
        >
            {/* The chain: the streak bars and a disc under every kept day, on
                one filtered layer. The filter (see {@link GooeyDefs}) sharpens
                alpha after a blur, which fuses shapes that touch and leaves a
                concave fillet where they meet — so a run reads as one drawn-out
                drop rather than as a bar with beads sitting on it. Only kept
                days are on this layer: an empty ring blurred to nothing would
                lose its hole. */}
            <span className="zenith-hmon__chain" aria-hidden="true">
                {row.runs.map((run) => {
                    const from = run.from + 1;
                    const to = run.to + 1;
                    return (
                        <span
                            key={`${run.from}-${run.to}`}
                            className="zenith-hmon__run"
                            // Where it sits, for the entrance stagger: read
                            // from the DOM because the sequence is driven from
                            // script. Both numbers live on the element itself
                            // so nothing has to walk the tree to work out
                            // which row it is in.
                            data-at={run.from}
                            data-to={run.to}
                            data-row={index}
                            style={
                                {
                                    left: `${centre(from)}%`,
                                    width: `${centre(to) - centre(from)}%`,
                                    // Its own slice of the row's gradient, so
                                    // the bar and the discs on it agree at
                                    // every column instead of stepping.
                                    background: `linear-gradient(90deg, ${shade(run.from)}, ${shade(
                                        run.to
                                    )})`,
                                } as CSSProperties
                            }
                        />
                    );
                })}

                {row.cells
                    .filter((cell) => cell.state === 'done')
                    .map((cell) => (
                        <span
                            key={cell.date}
                            className="zenith-hmon__blob"
                            data-at={cell.day - 1}
                            data-row={index}
                            data-marked="1"
                            style={
                                {
                                    left: `${centre(cell.day)}%`,
                                    background: shade(cell.day - 1),
                                } as CSSProperties
                            }
                        />
                    ))}
            </span>

            {row.cells.map((cell) => {
                const label = `${cell.date} · ${row.tracker.label} — ${valueLabel(row, cell, t)}`;
                const marked = pulse?.date === cell.date;
                const common = {
                    className: `zenith-hmon__cell is-${cell.state} ${marked ? 'is-pulsing' : ''}`,
                    'data-at': cell.day - 1,
                    'data-row': index,
                    // A day that recorded something is what the eye follows,
                    // and it gets the entrance to match. Stated as an
                    // attribute so the sequence needs no knowledge of which
                    // class names mean "there is something here".
                    'data-marked':
                        cell.state === 'done' || cell.state === 'partial' ? '1' : undefined,
                    style: {
                        left: `${centre(cell.day)}%`,
                        '--hmon-fill': cell.fill,
                        // The mark sits on top of the disc in the chain layer
                        // and has to be the same colour as it, or the crisp
                        // edge would show as a ring of the wrong shade.
                        '--hmon-shade': shade(cell.day - 1),
                    } as CSSProperties,
                    title: label,
                };

                // A grid the user can't write to renders spans, not disabled
                // buttons: a row of dead controls is worse than no controls.
                return onPick ? (
                    <button
                        {...common}
                        key={cell.date}
                        type="button"
                        aria-label={label}
                        aria-pressed={cell.state === 'done'}
                        onClick={(e: MouseEvent<HTMLButtonElement>) =>
                            onPick(row, cell, e.currentTarget)
                        }
                    >
                        <span className="zenith-hmon__mark" />
                    </button>
                ) : (
                    <span {...common} key={cell.date} role="img" aria-label={label}>
                        <span className="zenith-hmon__mark" />
                    </span>
                );
            })}
        </div>
    );
};
