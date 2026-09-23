import React, { useMemo, type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import { isoToDate } from '../../../core/calendarDates';
import {
    layoutSpans,
    type Calendar,
    type CalendarEntry,
    type EntryKind,
    type SpanSegment,
} from '../services/calendarTasks';
import { splitTimed } from '../services/calendarTime';
import { TaskChip } from './TaskChip';
import { SpanRibbon } from './SpanRibbon';
import { TimeGrid } from './TimeGrid';
import { useSpotlight } from './useSpotlight';

/** The hour gutter occupies column 1, so the first day starts at column 2. */
const DAY_COLUMN_OFFSET = 2;

interface WeekGridProps {
    t: Translator;
    today: string;
    /**
     * The dates this grid shows: the week's seven, already rotated to the
     * user's week start — or a single date, which is the day view. The two
     * differ in nothing else, so they are one component.
     */
    days: string[];
    calendar: Calendar;
    focus: EntryKind | null;
    /** How long a `⏰` with no stated end is drawn as, in minutes. */
    defaultSlot: number;
    /** Draw all 24 hours rather than the waking-hours window. */
    allHours: boolean;
    onOpenDay?: (date: string) => void;
    onOpenEntry: (entry: CalendarEntry) => void;
    onOpenSpan: (segment: SpanSegment) => void;
}

/**
 * A week (or a day), in three bands: day headers, everything all-day, then the
 * hours.
 *
 * The split is the point of this view. A task that states an hour goes on the
 * grid at that hour, where its distance from the task above it means something;
 * everything else — the 🛫→📅 bars, tasks due "on Thursday", the ones captured
 * in a daily note — goes in the band above, because pinning them to a row would
 * invent a time nobody chose. The band scrolls on its own and is capped, so a
 * day with twelve undated tasks can't push the hours off the screen.
 *
 * All three bands are separate grids over the same columns rather than seven
 * self-contained columns, because a ribbon has to cross them and the hours have
 * to line up across all of them.
 */
export const WeekGrid: FC<WeekGridProps> = ({
    t,
    today,
    days,
    calendar,
    focus,
    defaultSlot,
    allHours,
    onOpenDay,
    onOpenEntry,
    onOpenSpan,
}) => {
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const { segments, lanes } = layoutSpans(calendar.spans, days);
    // Over all three bands: a task's all-day chip and its block on the hours
    // are the same task, and light together.
    const spotlight = useSpotlight<HTMLDivElement>();

    const split = useMemo(() => {
        const timed = new Map<string, CalendarEntry[]>();
        const allDay = new Map<string, CalendarEntry[]>();
        for (const date of days) {
            const parts = splitTimed(calendar.byDate.get(date) ?? []);
            timed.set(date, parts.timed);
            allDay.set(date, parts.allDay);
        }
        return { timed, allDay };
    }, [days, calendar]);

    const columns = {
        ['--tcal-days' as string]: days.length,
    } as React.CSSProperties;

    return (
        <div className="zenith-tcal__week" {...spotlight}>
            <div className="zenith-tcal__week-heads" style={columns}>
                <span className="zenith-tcal__gutter-head" aria-hidden="true" />
                {days.map((date) => (
                    <div
                        className={`zenith-tcal__week-head ${date === today ? 'is-today' : ''}`}
                        key={date}
                    >
                        <span className="zenith-tcal__col-weekday">
                            {weekday.format(isoToDate(date))}
                        </span>
                        {onOpenDay ? (
                            <button
                                className="zenith-tcal__daynum"
                                onClick={() => onOpenDay(date)}
                                title={t('calendar.openDailyNote')}
                            >
                                {Number(date.slice(8, 10))}
                            </button>
                        ) : (
                            <span className="zenith-tcal__daynum">{Number(date.slice(8, 10))}</span>
                        )}
                    </div>
                ))}
            </div>

            <div
                className="zenith-tcal__band"
                style={{
                    ...columns,
                    // A lane per ribbon, then one row for the chip stacks.
                    // `repeat()` rejects a count of zero, so a week with no bars
                    // states the chip row alone.
                    gridTemplateRows:
                        lanes > 0 ? `repeat(${lanes}, var(--tcal-lane-h)) auto` : 'auto',
                }}
            >
                <span className="zenith-tcal__band-label">{t('calendar.allDay')}</span>

                {segments.map((segment) => (
                    <SpanRibbon
                        key={segment.span.key}
                        segment={segment}
                        t={t}
                        dim={focus !== null && focus !== 'process'}
                        columnOffset={DAY_COLUMN_OFFSET}
                        rowOffset={1}
                        onOpen={onOpenSpan}
                    />
                ))}

                {days.map((date, i) => (
                    <div
                        className={`zenith-tcal__band-stack ${date === today ? 'is-today' : ''}`}
                        key={`band-${date}`}
                        style={{ gridColumn: DAY_COLUMN_OFFSET + i, gridRow: lanes + 1 }}
                    >
                        {(split.allDay.get(date) ?? []).map((entry) => (
                            <TaskChip
                                key={entry.key}
                                entry={entry}
                                t={t}
                                compact={days.length > 1}
                                dim={focus !== null && entry.kind !== focus}
                                onOpen={onOpenEntry}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <TimeGrid
                t={t}
                days={days}
                today={today}
                timedByDate={split.timed}
                focus={focus}
                defaultSlot={defaultSlot}
                allHours={allHours}
                onOpenEntry={onOpenEntry}
            />
        </div>
    );
};
