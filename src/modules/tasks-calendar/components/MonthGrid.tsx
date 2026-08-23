import React, { type FC } from 'react';
import type { Translator } from '../../../core/i18n';
import { isoWeek, sameMonth, weekdayLabels, type WeekStart } from '../../../core/calendarDates';
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
 * Six weeks have to fit the view without it scrolling as a whole, so a busy
 * Tuesday can't be allowed to set the height of its entire row.
 */
const CELL_BUDGET = 3;

/** The week-number gutter occupies column 1, so day 0 starts at column 2. */
const DAY_COLUMN_OFFSET = 2;

interface MonthGridProps {
    t: Translator;
    /** Any date inside the month being shown. */
    anchor: string;
    today: string;
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
}

/**
 * The month.
 *
 * Each week is one CSS grid: a row of day numbers, then a lane per multi-day
 * ribbon, then the single-day chips. Laying the whole week out in one grid is
 * what lets a ribbon cross columns — a grid of independent day boxes can't
 * express "Monday through Thursday" at all, and the first version of this
 * calendar had to repeat the task in every cell instead.
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
}) => {
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const weekdays = weekdayLabels(locale, weekStart);
    const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));

    return (
        <div className="zenith-tcal__month">
            <div className="zenith-tcal__weekdays">
                <span className="zenith-tcal__wk" aria-hidden="true" />
                {weekdays.map((label) => (
                    <span key={label} className="zenith-tcal__weekday">
                        {label}
                    </span>
                ))}
            </div>

            {weeks.map((week) => {
                const { segments, lanes } = layoutSpans(calendar.spans, week);

                return (
                    <div
                        className="zenith-tcal__row"
                        key={week[0]}
                        style={{
                            // Day numbers, a track per ribbon lane, then the
                            // chips taking whatever height is left.
                            gridTemplateRows: `auto ${'var(--tcal-lane-h) '.repeat(lanes)}1fr`,
                        }}
                    >
                        <button
                            className="zenith-tcal__wk"
                            onClick={() => onOpenWeek(week[0])}
                            title={t('calendar.openWeek')}
                        >
                            {isoWeek(week[0]).week}
                        </button>

                        {week.map((date, i) => (
                            <div
                                className={[
                                    'zenith-tcal__daynum-cell',
                                    !sameMonth(date, anchor) ? 'is-outside' : '',
                                    date === today ? 'is-today' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                key={`num-${date}`}
                                style={{ gridColumn: DAY_COLUMN_OFFSET + i, gridRow: 1 }}
                            >
                                {onOpenDay ? (
                                    <button
                                        className="zenith-tcal__daynum"
                                        onClick={() => onOpenDay(date)}
                                        title={t('calendar.openDailyNote')}
                                    >
                                        {Number(date.slice(8, 10))}
                                    </button>
                                ) : (
                                    <span className="zenith-tcal__daynum">
                                        {Number(date.slice(8, 10))}
                                    </span>
                                )}
                            </div>
                        ))}

                        {segments.map((segment) => (
                            <SpanRibbon
                                key={segment.span.key}
                                segment={segment}
                                t={t}
                                dim={focus !== null && focus !== 'process'}
                                columnOffset={DAY_COLUMN_OFFSET}
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
                                    style={{ gridColumn: DAY_COLUMN_OFFSET + i, gridRow: lanes + 2 }}
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
    );
};
