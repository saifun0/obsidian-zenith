import React, { useEffect, useMemo, useRef, type FC, type MutableRefObject } from 'react';
import type { Translator } from '../../../core/i18n';
import { useNow } from '../../../core/useNow';
import type { CalendarEntry, EntryKind } from '../services/calendarTasks';
import type { CalendarClass } from '../../study/calendarClasses';
import { formatMinutes, hourWindow, layoutDay, type TimedBlock } from '../services/calendarTime';
import { TimeBlock } from './TimeBlock';
import type { ScheduleDrag, SlotAt } from './useScheduleDrag';

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
    /** Moving tasks on the grid; absent while the feature is off. */
    drag?: ScheduleDrag | null;
    /** Filled with how to find the day and minute under a point. */
    slotAtRef?: MutableRefObject<SlotAt | null>;
    /** The Study timetable per date, drawn behind the tasks; absent while off. */
    classes?: Map<string, CalendarClass[]> | null;
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
 *
 * Classes from the Study timetable, when shown, are the one thing drawn
 * behind the tasks rather than among them: faint, full width, and in the way
 * of nothing — a tap or a drag goes through them to the grid, so the hour
 * between two classes, or a class itself, can be planned into.
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
    drag,
    slotAtRef,
    classes,
}) => {
    const now = useNow();
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const showsToday = days.includes(today);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Laid out per column: overlaps are a property of one day, and packing the
    // week as a whole would make Monday's meeting narrow Friday's.
    const columns = useMemo(
        () =>
            days.map((date) => ({
                date,
                blocks: layoutDay(timedByDate.get(date) ?? [], defaultSlot),
                classes: classes?.get(date) ?? [],
            })),
        [days, timedByDate, defaultSlot, classes]
    );

    // Classes count toward the hours drawn: an 08:00 class pulls the window
    // open like an 08:00 task would.
    const visible = useMemo(
        () =>
            hourWindow(
                columns.flatMap((column) => [...column.blocks, ...column.classes]),
                allHours
            ),
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
        for (const block of [...column.blocks, ...column.classes])
            if (min === null || block.start < min) min = block.start;
        return min;
    }, null);

    // Read through a ref so the scroll below re-runs when the view MOVES, not
    // every time the clock ticks — re-anchoring each minute would drag the
    // surface back under a reader who had scrolled somewhere else.
    const anchorRef = useRef(0);
    anchorRef.current = showsToday ? nowMinutes : (firstBlock ?? 9 * 60);
    const dayKey = days.join('|');

    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        const target =
            (anchorRef.current - originMinutes) * pixelsPerMinute - node.clientHeight / 3;
        node.scrollTop = Math.max(0, target);
    }, [dayKey, originMinutes, pixelsPerMinute]);

    // The day and minute under a point, for whoever is dragging across the
    // grid — the columns are measured where they are, so a scrolled or
    // resized grid needs no bookkeeping.
    if (slotAtRef) {
        slotAtRef.current = (x, y) => {
            const cols = gridRef.current?.querySelectorAll<HTMLElement>('.zenith-tcal__daycol');
            if (!cols) return null;
            for (let i = 0; i < cols.length; i++) {
                const r = cols[i].getBoundingClientRect();
                if (x >= r.left && x < r.right) {
                    return {
                        date: days[i],
                        minutes: originMinutes + (y - r.top) / pixelsPerMinute,
                    };
                }
            }
            return null;
        };
    }

    const nowTop = (nowMinutes - originMinutes) * pixelsPerMinute;
    const nowInWindow = nowMinutes >= originMinutes && nowMinutes <= visible.to * 60;

    return (
        <div className="zenith-tcal__hours" ref={scrollRef}>
            <div
                className="zenith-tcal__hour-grid"
                ref={gridRef}
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

                {columns.map(({ date, blocks, classes: taken }) => (
                    <div
                        className={`zenith-tcal__daycol ${date === today ? 'is-today' : ''}`}
                        key={date}
                        onClick={
                            drag
                                ? (e) => {
                                      // The empty grid only: a block's own click
                                      // opens the block.
                                      if (e.target !== e.currentTarget || drag.swallowClick())
                                          return;
                                      const r = e.currentTarget.getBoundingClientRect();
                                      drag.tapSlot(
                                          date,
                                          originMinutes + (e.clientY - r.top) / pixelsPerMinute
                                      );
                                  }
                                : undefined
                        }
                    >
                        {taken.map((c) => (
                            <div
                                key={c.key}
                                className="zenith-tcal__class"
                                style={{
                                    top: `${(c.start - originMinutes) * pixelsPerMinute}px`,
                                    height: `${Math.max((c.end - c.start) * pixelsPerMinute - 2, 14)}px`,
                                }}
                            >
                                <span className="zenith-tcal__class-title">{c.subject}</span>
                                {c.room && (
                                    <span className="zenith-tcal__class-room">{c.room}</span>
                                )}
                            </div>
                        ))}

                        {blocks.map((block: TimedBlock<CalendarEntry>) => (
                            <TimeBlock
                                key={block.item.key}
                                block={block}
                                date={date}
                                t={t}
                                dim={focus !== null && block.item.kind !== focus}
                                roomy={days.length === 1}
                                originMinutes={originMinutes}
                                pixelsPerMinute={pixelsPerMinute}
                                onOpen={onOpenEntry}
                                drag={drag}
                                moving={drag?.ghost?.taskId === block.item.task.id}
                            />
                        ))}

                        {drag?.ghost && drag.ghost.slot.date === date && (
                            <div
                                className="zenith-tcal__ghost"
                                style={{
                                    top: `${(drag.ghost.slot.start - originMinutes) * pixelsPerMinute}px`,
                                    height: `${Math.max(
                                        (drag.ghost.slot.end - drag.ghost.slot.start) *
                                            pixelsPerMinute -
                                            2,
                                        16
                                    )}px`,
                                }}
                                aria-hidden="true"
                            >
                                {formatMinutes(drag.ghost.slot.start)}–
                                {formatMinutes(drag.ghost.slot.end)}
                            </div>
                        )}

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
