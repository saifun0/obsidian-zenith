import React, { type FC } from 'react';
import { CalendarX } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { dayLabel } from '../../../core/calendarDates';
import type { TaskStatus } from '../../../core/constants';
import { TaskStatusControl } from '../../tasks/components/taskStatusUi';
import type { Calendar, CalendarEntry, EntryKind } from '../services/calendarTasks';
import { agenda } from '../services/calendarTasks';
import { formatMinutes } from '../services/calendarTime';
import { KindIcon, kindKey } from './kindUi';
import { noteName } from './TaskChip';

interface AgendaListProps {
    t: Translator;
    today: string;
    /** Every date in the range, in order. Empty days are dropped by `agenda`. */
    days: string[];
    calendar: Calendar;
    focus: EntryKind | null;
    onOpenEntry: (entry: CalendarEntry) => void;
    onStatus: (entry: CalendarEntry, status: TaskStatus) => void;
}

/**
 * The month as a flat, chronological list.
 *
 * Rows here are wide enough for a status control, so this is the one view where
 * you can close a task without leaving the calendar — in a month cell the same
 * control would be a four-pixel target sitting next to the chip's own click
 * area, and every second hit would be the wrong one.
 */
export const AgendaList: FC<AgendaListProps> = ({
    t,
    today,
    days,
    calendar,
    focus,
    onOpenEntry,
    onStatus,
}) => {
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';
    const groups = agenda(calendar, days);

    if (groups.length === 0) {
        return (
            <div className="zenith-tcal__empty">
                <CalendarX size={28} strokeWidth={1.5} />
                <span>{t('calendar.empty')}</span>
            </div>
        );
    }

    return (
        <div className="zenith-tcal__agenda">
            {groups.map(({ date, entries }) => (
                <section className="zenith-tcal__day" key={date}>
                    <header className={`zenith-tcal__day-head ${date === today ? 'is-today' : ''}`}>
                        <span className="zenith-tcal__day-label">{dayLabel(date, locale)}</span>
                        <span className="zenith-tcal__day-count">{entries.length}</span>
                    </header>

                    <ul className="zenith-tcal__rows">
                        {entries.map((entry) => (
                            <li
                                className={[
                                    'zenith-tcal__row-item',
                                    `is-${entry.kind}`,
                                    focus !== null && entry.kind !== focus ? 'is-dim' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                key={entry.key}
                            >
                                <TaskStatusControl
                                    status={entry.task.status}
                                    onChange={(s) => onStatus(entry, s)}
                                    size={16}
                                />
                                <span
                                    className="zenith-tcal__row-kind"
                                    title={t(kindKey(entry.kind))}
                                >
                                    <KindIcon kind={entry.kind} size={13} />
                                </span>
                                {/* The agenda is the day in order, so the hour
                                    belongs in front of the title, not hidden in
                                    a tooltip. Fixed width keeps the titles of
                                    timed and untimed rows on one left edge. */}
                                <span className="zenith-tcal__row-time">
                                    {entry.startMinutes !== undefined
                                        ? formatMinutes(entry.startMinutes)
                                        : ''}
                                </span>
                                <button
                                    className="zenith-tcal__row-title"
                                    onClick={() => onOpenEntry(entry)}
                                    title={entry.task.title}
                                >
                                    {entry.task.title}
                                </button>
                                {entry.overdueBy != null && entry.overdueBy > 0 && (
                                    <span className="zenith-tcal__chip-flag">
                                        {t('calendar.overdueBy', { days: entry.overdueBy })}
                                    </span>
                                )}
                                <span className="zenith-tcal__row-note">
                                    {noteName(entry.task.filePath)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};
