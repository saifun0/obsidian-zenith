import React, { useEffect, useLayoutEffect, useRef, type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import { monthHeading, shortDayLabel, weekdayLabels, type WeekStart } from '../../../core/calendarDates';
import {
    layoutSpans,
    type Calendar,
    type CalendarEntry,
    type EntryKind,
    type SpanSegment,
} from '../services/calendarTasks';
import { TaskChip } from './TaskChip';
import { SpanRibbon } from './SpanRibbon';

/**
 * How many chips a day shows under its ribbons before collapsing into "+N".
 *
 * Four rather than three now that the rows scroll: the old grid had to fit six
 * weeks in the panel's height, so a busy Tuesday setting its row's height was a
 * real problem. A scrolling run has no such budget, and the only reason left to
 * cap a day at all is that one day with forty tasks should not push a fortnight
 * off the screen.
 */
const CELL_BUDGET = 4;

interface MonthGridProps {
    t: Translator;
    /** The month whose heading the view scrolls to. */
    anchor: string;
    today: string;
    /** Whole weeks, possibly several months of them. */
    days: string[];
    weekStart: WeekStart;
    calendar: Calendar;
    focus: EntryKind | null;
    /** Set when the journal module is on: clicking a date opens its daily note. */
    onOpenDay?: (date: string) => void;
    onOpenEntry: (entry: CalendarEntry) => void;
    onOpenSpan: (segment: SpanSegment) => void;
    /** Jump into the week view at this date. */
    onOpenWeek: (date: string) => void;
    /** The run has been scrolled near its end and wants more months. */
    onReachEnd: () => void;
}

/**
 * The months, as one scroll.
 *
 * It used to be one month at a time, six weeks tall, with arrows to page
 * between them — which is the shape a paper calendar has because paper has
 * pages. The last week of August and the first of September are adjacent in
 * life, and a page turn between them is why "what is happening at the end of
 * next month" used to cost two clicks and a loss of place.
 *
 * So the weeks run on, and a month announces itself where it begins: its name
 * is set large in the first column of the week its 1st falls in, taking the
 * place of that cell's day number. That is the one spot on the grid where a
 * heading costs nothing — the day it displaces belongs to the month that is
 * ending, whose own name is already somewhere above.
 *
 * Each week is still a single CSS grid, because that is what lets a multi-day
 * ribbon cross columns; a grid of independent day boxes cannot express "Monday
 * through Thursday" at all.
 */
export const MonthGrid: FC<MonthGridProps> = ({
    t,
    anchor,
    today,
    days,
    weekStart,
    calendar,
    focus,
    onOpenDay,
    onOpenEntry,
    onOpenSpan,
    onOpenWeek,
    onReachEnd,
}) => {
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const weekdays = weekdayLabels(locale, weekStart);
    const weeks = Array.from({ length: Math.floor(days.length / 7) }, (_, i) =>
        days.slice(i * 7, i * 7 + 7)
    );

    const scrollRef = useRef<HTMLDivElement>(null);
    const monthRefs = useRef(new Map<string, HTMLElement>());

    /**
     * Bring the anchor month's heading to the top, and only when the anchor
     * month is what changed.
     *
     * The run also grows as it is scrolled, and `weeks.length` changing was
     * enough to re-run this in the first draft — so reaching the bottom
     * appended four months and then threw the reader back to the heading they
     * had started from. `useLayoutEffect` because the jump belongs in the same
     * frame the run is rebuilt in: paging a month and then watching the view
     * slide to it is a different, worse gesture.
     */
    const month = anchor.slice(0, 7);
    useLayoutEffect(() => {
        const head = monthRefs.current.get(month);
        const box = scrollRef.current;
        if (!head || !box) return;
        box.scrollTop = head.offsetTop - box.offsetTop;
    }, [month]);

    /**
     * Ask for more months before the scroll actually runs out, so the run never
     * visibly ends under the pointer.
     *
     * Once per run, not once per scroll event: a wheel gesture inside the last
     * screenful fires dozens of these, and an unguarded request would take the
     * run to its cap in a single flick.
     */
    const grownAt = useRef(0);
    useEffect(() => {
        const box = scrollRef.current;
        if (!box) return;
        const onScroll = () => {
            if (box.scrollHeight - box.scrollTop - box.clientHeight >= box.clientHeight) return;
            if (grownAt.current === weeks.length) return;
            grownAt.current = weeks.length;
            onReachEnd();
        };
        box.addEventListener('scroll', onScroll, { passive: true });
        return () => box.removeEventListener('scroll', onScroll);
    }, [onReachEnd, weeks.length]);

    return (
        <div className="zenith-tcal__month">
            <div className="zenith-tcal__weekdays">
                {weekdays.map((label) => (
                    <span key={label} className="zenith-tcal__weekday">
                        {label}
                    </span>
                ))}
            </div>

            <div className="zenith-tcal__run" ref={scrollRef}>
                {weeks.map((week) => {
                    const { segments, lanes } = layoutSpans(calendar.spans, week);
                    // The week a month starts in, and where in it. Any day but
                    // the first column can carry its own "1 Sep" label; when the
                    // 1st IS the first column the heading stands in for it.
                    const startsHere = week.findIndex((date) => date.endsWith('-01'));
                    const newMonth = startsHere >= 0 ? week[startsHere].slice(0, 7) : null;

                    return (
                        <div
                            className="zenith-tcal__row"
                            key={week[0]}
                            ref={
                                newMonth
                                    ? (el) => {
                                          if (el) monthRefs.current.set(newMonth, el);
                                          else monthRefs.current.delete(newMonth);
                                      }
                                    : undefined
                            }
                            style={{
                                // Day numbers, a track per ribbon lane, then the
                                // chips taking whatever height is left.
                                gridTemplateRows: `auto ${'var(--tcal-lane-h) '.repeat(lanes)}1fr`,
                            }}
                        >
                            {week.map((date, i) => {
                                const first = date.endsWith('-01');
                                const heading = newMonth && i === 0;

                                return (
                                    <div
                                        className={`zenith-tcal__daynum-cell ${
                                            date === today ? 'is-today' : ''
                                        }`}
                                        key={`num-${date}`}
                                        style={{ gridColumn: i + 1, gridRow: 1 }}
                                    >
                                        {heading ? (
                                            <span className="zenith-tcal__month-name">
                                                {monthHeading(week[startsHere], locale)}
                                            </span>
                                        ) : onOpenDay ? (
                                            <button
                                                className={`zenith-tcal__daynum ${first ? 'is-first' : ''}`}
                                                onClick={() => onOpenDay(date)}
                                                title={t('calendar.openDailyNote')}
                                            >
                                                {first
                                                    ? shortDayLabel(date, locale)
                                                    : Number(date.slice(8, 10))}
                                            </button>
                                        ) : (
                                            <span
                                                className={`zenith-tcal__daynum ${first ? 'is-first' : ''}`}
                                            >
                                                {first
                                                    ? shortDayLabel(date, locale)
                                                    : Number(date.slice(8, 10))}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}

                            {segments.map((segment) => (
                                <SpanRibbon
                                    key={segment.span.key}
                                    segment={segment}
                                    t={t}
                                    dim={focus !== null && focus !== 'process'}
                                    columnOffset={1}
                                    rowOffset={2}
                                    onOpen={onOpenSpan}
                                />
                            ))}

                            {week.map((date, i) => {
                                const entries = calendar.byDate.get(date) ?? [];
                                const shown = entries.slice(0, CELL_BUDGET);
                                const hidden = entries.length - shown.length;

                                return (
                                    <div
                                        className={`zenith-tcal__stack ${date === today ? 'is-today' : ''}`}
                                        key={`stack-${date}`}
                                        style={{ gridColumn: i + 1, gridRow: lanes + 2 }}
                                    >
                                        {shown.map((entry) => (
                                            <TaskChip
                                                key={entry.key}
                                                entry={entry}
                                                t={t}
                                                compact
                                                dim={focus !== null && entry.kind !== focus}
                                                onOpen={onOpenEntry}
                                            />
                                        ))}
                                        {hidden > 0 && (
                                            <button
                                                className="zenith-tcal__more"
                                                onClick={() => onOpenWeek(date)}
                                                title={t('calendar.openWeek')}
                                            >
                                                {t('calendar.more', { count: hidden })}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
