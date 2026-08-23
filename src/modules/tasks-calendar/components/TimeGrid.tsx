import React, { useEffect, useMemo, useRef, type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import type { CalendarEntry, EntryKind } from '../services/calendarTasks';
import { formatMinutes, hourWindow, layoutDay, type TimedBlock } from '../services/calendarTime';
import { TimeBlock } from './TimeBlock';

/** Height of one hour row, in pixels. The grid's only unit of scale. */
const HOUR_HEIGHT = 46;

interface TimeGridProps {
    t: Translator;
    /** The dates this grid has a column for — seven in week view, one in day. */
    days: string[];
    today: string;
    /** Timed entries per date; the all-day ones stay in the band above. */
    timedByDate: Map<string, CalendarEntry[]>;
    focus: EntryKind | null;
    /** How long a `⏰` with no stated end is drawn as, in minutes. */
    defaultSlot: number;
    /** Draw all 24 rows rather than the waking-hours window. */
    allHours: boolean;
    onOpenEntry: (entry: CalendarEntry) => void;
}

/**
 * The hours of a day, as rows, with tasks placed on them.
 *
 * One scrolling surface shared by the week and the day view — they differ only
 * in how many columns they hand it. The grid is a single CSS grid rather than
 * one scroller per column so every column scrolls together: reading across a
 * week at 15:00 is the question this view exists to answer, and columns that
 * drift apart make it unanswerable.
 *
 * Blocks are positioned absolutely inside their column rather than placed in
 * grid rows, because they have to overlap: two tasks at 15:30 and 15:45 share
 * the same rows and split the width instead of pushing each other down.
 */
export const TimeGrid: FC<TimeGridProps> = ({
    t,
    days,
    today,
    timedByDate,
    focus,
    defaultSlot,
    allHours,
    onOpenEntry,
}) => {
    const now = useNow();
    const scrollRef = useRef<HTMLDivElement>(null);
    const showsToday = days.includes(today);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Laid out per column: overlaps are a property of one day, and packing the
    // week as a whole would make Monday's meeting narrow Friday's.
    const columns = useMemo(
        () =>
            days.map((date) => ({
                date,
                blocks: layoutDay(timedByDate.get(date) ?? [], defaultSlot),
            })),
        [days, timedByDate, defaultSlot]
    );

    const visible = useMemo(
        () => hourWindow(columns.flatMap((column) => column.blocks), allHours),
        [columns, allHours]
    );

    const originMinutes = visible.from * 60;
    const hours = Array.from({ length: visible.to - visible.from }, (_, i) => visible.from + i);
    const pixelsPerMinute = HOUR_HEIGHT / 60;
    const height = hours.length * HOUR_HEIGHT;

    // Open on the hour you're in, or — for a week you're only browsing — on
    // whatever the first thing in it is. Landing at 00:00 every time would mean
    // scrolling past an empty night before the view says anything.
    const firstBlock = columns.reduce<number | null>((min, column) => {
        for (const block of column.blocks) if (min === null || block.start < min) min = block.start;
        return min;
    }, null);

    // Read through a ref so the scroll below re-runs when the view MOVES, not
    // every time the clock ticks — re-anchoring each minute would drag the
    // surface back under a reader who had scrolled somewhere else.
    const anchorRef = useRef(0);
    anchorRef.current = showsToday ? nowMinutes : firstBlock ?? 9 * 60;
    const dayKey = days.join('|');

    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        const target = (anchorRef.current - originMinutes) * pixelsPerMinute - node.clientHeight / 3;
        node.scrollTop = Math.max(0, target);
    }, [dayKey, originMinutes, pixelsPerMinute]);

    const nowTop = (nowMinutes - originMinutes) * pixelsPerMinute;
    const nowInWindow = nowMinutes >= originMinutes && nowMinutes <= visible.to * 60;

    return (
        <div className="zenith-tcal__hours" ref={scrollRef}>
            <div
                className="zenith-tcal__hour-grid"
                style={{
                    height: `${height}px`,
                    ['--tcal-days' as string]: days.length,
                    // The row height is stated once, here: the blocks are placed
                    // from it and the columns draw their hour lines from it, so
                    // the two cannot drift apart.
                    ['--tcal-hour-h' as string]: `${HOUR_HEIGHT}px`,
                }}
            >
                <div className="zenith-tcal__gutter">
                    {hours.map((hour, i) => (
                        <span
                            className="zenith-tcal__hour"
                            key={hour}
                            style={{ top: `${i * HOUR_HEIGHT}px` }}
                        >
                            {formatMinutes(hour * 60)}
                        </span>
                    ))}
                </div>

                {columns.map(({ date, blocks }) => (
                    <div
                        className={`zenith-tcal__daycol ${date === today ? 'is-today' : ''}`}
                        key={date}
                    >
                        {blocks.map((block: TimedBlock<CalendarEntry>) => (
                            <TimeBlock
                                key={block.item.key}
                                block={block}
                                t={t}
                                dim={focus !== null && block.item.kind !== focus}
                                roomy={days.length === 1}
                                originMinutes={originMinutes}
                                pixelsPerMinute={pixelsPerMinute}
                                onOpen={onOpenEntry}
                            />
                        ))}

                        {nowInWindow && (
                            <div
                                className={`zenith-tcal__now ${date === today ? 'is-today' : ''}`}
                                style={{ top: `${nowTop}px` }}
                                aria-hidden="true"
                            />
                        )}
                    </div>
                ))}

                {/* The clock reading, printed once in the gutter rather than on
                    every column — seven copies of "14:20" is noise. */}
                {nowInWindow && showsToday && (
                    <span
                        className="zenith-tcal__now-label"
                        style={{ top: `${nowTop}px` }}
                        title={t('calendar.now')}
                    >
                        {formatMinutes(nowMinutes)}
                    </span>
                )}
            </div>
        </div>
    );
};
