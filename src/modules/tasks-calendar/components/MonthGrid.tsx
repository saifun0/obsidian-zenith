import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import {
    addDays,
    monthHeading,
    monthRows,
    weekdayLabel,
    weekdayLabels,
    type WeekStart,
} from '../../../core/calendarDates';
import {
    layoutSpans,
    type Calendar,
    type CalendarEntry,
    type EntryKind,
    type SpanSegment,
} from '../services/calendarTasks';
import { TaskChip } from './TaskChip';
import { SpanRibbon } from './SpanRibbon';
import { useSpotlight } from './useSpotlight';

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
    /** Days across a row: 7, or 3 where a week is too narrow to read. */
    columns: number;
    calendar: Calendar;
    focus: EntryKind | null;
    /** Set when the journal module is on: clicking a date opens its daily note. */
    onOpenDay?: (date: string) => void;
    onOpenEntry: (entry: CalendarEntry) => void;
    onOpenSpan: (segment: SpanSegment) => void;
    /** Jump into the week view at this date. */
    /** Where "+N more" goes. Without it the count is only a count. */
    onOpenWeek?: (date: string) => void;
    /** The run has been scrolled near its end and wants later months. */
    onReachEnd: () => void;
    /** The run has been scrolled near its start and wants earlier months. */
    onReachStart: () => void;
    /** The `YYYY-MM` now at the top of the scroll — what the toolbar names. */
    onVisibleMonth: (month: string) => void;
    /**
     * Bumped to send the view back to the anchor month even when the anchor
     * itself did not change — "back to today" from six months down the scroll
     * is not a change of anchor, and without this it would do nothing.
     */
    jumpTo: number;
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
 * So the weeks run on — in both directions, because last month is as real as
 * next one — and a month announces itself on its own first day: the name set
 * quietly above the "1", centred on that cell. It was a full-width band
 * between the rows for a while, which reads as a heading over everything
 * below it — a claim a whole week cannot honour, since the week a month starts
 * in begins in the month before. Sitting on the 1st it claims only the day it
 * is standing on, which is the only claim that is true.
 *
 * Those first days of the week that belong to the month before are not marked
 * at all. A wash behind them, a rule down the boundary and a quieter day number
 * were each tried, and each read as a mark dropped into the grid at random —
 * louder than the thing it marked. The week is drawn once, not cut, so those
 * days are as real and as readable as any other.
 *
 * The current month is marked by a wash behind its days, drawn per row over
 * exactly the columns the month occupies — so it begins and ends on the right
 * day rather than rounding to whole weeks.
 *
 * A row is a single CSS grid, because that is what lets a multi-day ribbon
 * cross columns; a grid of independent day boxes cannot express "Monday
 * through Thursday" at all. The washes are grid items too, spanning every
 * track, laid down before the cells so they read as background.
 */
export const MonthGrid: FC<MonthGridProps> = ({
    t,
    anchor,
    today,
    days,
    weekStart,
    columns,
    calendar,
    focus,
    onOpenDay,
    onOpenEntry,
    onOpenSpan,
    onOpenWeek,
    onReachEnd,
    onReachStart,
    onVisibleMonth,
    jumpTo,
}) => {
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const weekdays = weekdayLabels(locale, weekStart);
    const rows = useMemo(() => monthRows(days, columns), [days, columns]);
    /**
     * Three days across is not a week, so its rows start on a different weekday
     * every time and the header strip above them would name the wrong columns.
     * Each day carries its own name instead.
     */
    const weekly = columns === 7;
    /** The month we are actually living in — the one the grid tints. */
    const currentMonth = today.slice(0, 7);

    const scrollRef = useRef<HTMLDivElement>(null);
    const monthRefs = useRef(new Map<string, HTMLElement>());
    // On the run rather than on a row: a bar crossing three weeks is three
    // rows, and all three have to light together.
    const spotlight = useSpotlight<HTMLDivElement>();

    /**
     * Which run is on screen. Both ends ask for more months exactly once per
     * run: a wheel gesture inside the last screenful fires dozens of scroll
     * events, and an unguarded request would take the run to its cap in a
     * single flick. The week count alone can no longer tell two runs apart now
     * that the run grows upwards as well — prepending four months and
     * appending four change it identically.
     */
    const runKey = `${days[0] ?? ''}+${days.length}`;
    const grown = useRef({ top: '', bottom: '' });

    /**
     * Where the scroll stood just before months were prepended, so the same
     * week can be put back under the pointer afterwards. Growing upwards
     * inserts height *above* the reader; left alone the browser keeps
     * `scrollTop` unchanged and the weeks appear to leap forwards by however
     * much was added.
     */
    const keep = useRef<{ height: number; top: number } | null>(null);

    /**
     * The month at the top of the scroll, reported only when it changes.
     *
     * This is what the toolbar names. With the weeks running on there is no
     * "current page" to take a title from, and a heading that says September
     * while the reader is looking at October is the whole reason the month
     * pager above the grid had nothing useful left to do.
     */
    const reported = useRef('');
    const readMonth = useCallback(() => {
        const box = scrollRef.current;
        if (!box) return;
        // `offsetTop` is measured against a shared offset parent, not the box.
        const top = box.scrollTop + box.offsetTop + 1;
        for (const row of Array.from(box.children) as HTMLElement[]) {
            if (row.offsetTop + row.offsetHeight <= top) continue;
            const month = row.dataset.month;
            if (month && month !== reported.current) {
                reported.current = month;
                onVisibleMonth(month);
            }
            return;
        }
    }, [onVisibleMonth]);

    /**
     * Bring the anchor month's heading to the top, and only when the anchor
     * month — or the jump token — is what changed.
     *
     * The run also grows as it is scrolled, and `weeks.length` changing was
     * enough to re-run this in the first draft — so reaching the bottom
     * appended four months and then threw the reader back to the heading they
     * had started from. `useLayoutEffect` because the jump belongs in the same
     * frame the run is rebuilt in: asking for a month and then watching the
     * view slide to it is a different, worse gesture.
     */
    const month = anchor.slice(0, 7);
    useLayoutEffect(() => {
        const head = monthRefs.current.get(month);
        const box = scrollRef.current;
        // A deliberate jump outranks any scroll restoration still pending.
        keep.current = null;
        if (!head || !box) return;
        box.scrollTop = head.offsetTop - box.offsetTop;
        reported.current = month;
        onVisibleMonth(month);
    }, [month, jumpTo, onVisibleMonth]);

    /**
     * Put the reader back where they were once earlier months have been
     * prepended. In the same frame as the new weeks and before anything is
     * painted, so the leap the insertion would otherwise cause is never seen.
     */
    const firstDay = days[0];
    useLayoutEffect(() => {
        const box = scrollRef.current;
        const held = keep.current;
        keep.current = null;
        if (!box || !held || box.scrollHeight <= held.height) return;
        box.scrollTop = held.top + (box.scrollHeight - held.height);
    }, [firstDay]);

    /**
     * Ask for more months before the scroll actually runs out at either end,
     * so the run never visibly stops under the pointer — a calendar has no
     * first day and no last one, and neither should this.
     */
    useEffect(() => {
        const box = scrollRef.current;
        if (!box) return;
        const onScroll = () => {
            readMonth();
            const screen = box.clientHeight;
            if (
                box.scrollHeight - box.scrollTop - screen < screen &&
                grown.current.bottom !== runKey
            ) {
                grown.current.bottom = runKey;
                onReachEnd();
            }
            if (box.scrollTop < screen && grown.current.top !== runKey) {
                grown.current.top = runKey;
                keep.current = { height: box.scrollHeight, top: box.scrollTop };
                onReachStart();
            }
        };
        box.addEventListener('scroll', onScroll, { passive: true });
        readMonth();
        return () => box.removeEventListener('scroll', onScroll);
    }, [onReachEnd, onReachStart, readMonth, runKey]);

    return (
        <div className="zenith-tcal__month">
            {weekly && (
                <div className="zenith-tcal__weekdays">
                    {weekdays.map((label) => (
                        <span key={label} className="zenith-tcal__weekday">
                            {label}
                        </span>
                    ))}
                </div>
            )}

            <div className="zenith-tcal__run" ref={scrollRef} {...spotlight}>
                {rows.map((row) => {
                    const { segments, lanes } = layoutSpans(calendar.spans, row.dates);

                    // The stretch of this row the current month occupies, as
                    // columns. A month ends on the day it ends on, so the band
                    // stops there rather than at the end of the week.
                    let from = -1;
                    let to = -1;
                    row.dates.forEach((date, i) => {
                        if (date.slice(0, 7) !== currentMonth) return;
                        if (from < 0) from = i;
                        to = i;
                    });
                    // The band's own edges, since nothing else draws them: the
                    // month's name sits inside a cell now, not on a rule above
                    // the row.
                    const opens = from >= 0 && row.dates[from].endsWith('-01');
                    const closes =
                        to >= 0 && addDays(row.dates[to], 1).slice(0, 7) !== currentMonth;

                    return (
                        <div
                            className="zenith-tcal__row"
                            data-month={row.month}
                            key={row.dates[0]}
                            // The row a month starts in is what "go to August"
                            // scrolls to, so the month's name lands at the top.
                            ref={
                                row.opens
                                    ? (el) => {
                                          if (el) monthRefs.current.set(row.month, el);
                                          else monthRefs.current.delete(row.month);
                                      }
                                    : undefined
                            }
                            style={{
                                // Day numbers, a track per ribbon lane, then the
                                // chips taking whatever height is left.
                                gridTemplateRows: `auto ${'var(--tcal-lane-h) '.repeat(lanes)}1fr`,
                            }}
                        >
                            {/* Laid down before the cells so it reads as
                                    background: grid items paint in DOM order. */}
                            {from >= 0 && (
                                <div
                                    className={`zenith-tcal__wash is-current ${
                                        opens ? 'is-open' : ''
                                    } ${closes ? 'is-close' : ''}`}
                                    style={{
                                        gridColumn: `${from + 1} / ${to + 2}`,
                                        gridRow: '1 / -1',
                                    }}
                                    aria-hidden
                                />
                            )}

                            {row.dates.map((date, i) => {
                                // The 1st carries its month's name, centred
                                // over the cell and above the number.
                                const first = date.endsWith('-01');

                                return (
                                    <div
                                        className={`zenith-tcal__daynum-cell ${
                                            date === today ? 'is-today' : ''
                                        } ${first ? 'is-month-start' : ''}`}
                                        key={`num-${date}`}
                                        style={{ gridColumn: i + 1, gridRow: 1 }}
                                    >
                                        {first && (
                                            <span
                                                className={`zenith-tcal__month-name ${
                                                    date.slice(0, 7) === currentMonth
                                                        ? 'is-current'
                                                        : ''
                                                }`}
                                            >
                                                {monthHeading(date, locale)}
                                            </span>
                                        )}
                                        <span className="zenith-tcal__dayline">
                                            {onOpenDay ? (
                                                <button
                                                    className={`zenith-tcal__daynum ${first ? 'is-first' : ''}`}
                                                    onClick={() => onOpenDay(date)}
                                                    title={t('calendar.openDailyNote')}
                                                >
                                                    {Number(date.slice(8, 10))}
                                                </button>
                                            ) : (
                                                <span
                                                    className={`zenith-tcal__daynum ${first ? 'is-first' : ''}`}
                                                >
                                                    {Number(date.slice(8, 10))}
                                                </span>
                                            )}
                                            {!weekly && (
                                                <span className="zenith-tcal__dayname">
                                                    {weekdayLabel(date, locale)}
                                                </span>
                                            )}
                                        </span>
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

                            {row.dates.map((date, i) => {
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
                                        {hidden > 0 &&
                                            (onOpenWeek ? (
                                                <button
                                                    className="zenith-tcal__more"
                                                    onClick={() => onOpenWeek(date)}
                                                    title={t('calendar.openWeek')}
                                                >
                                                    {t('calendar.more', { count: hidden })}
                                                </button>
                                            ) : (
                                                <span className="zenith-tcal__more">
                                                    {t('calendar.more', { count: hidden })}
                                                </span>
                                            ))}
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
