import React, { useMemo, type FC } from 'react';
import { AlertTriangle, ChevronRight, CircleCheck } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation, type Translator } from '../../../core/i18n';
import { daysBetweenIso, toLocalIsoDate } from '../../../core/dateUtils';
import { dueCountdown } from '../../../core/dueCountdown';
import { useNow } from '../../../core/useNow';
import { addDays, isoToDate } from '../../../core/calendarDates';
import { buildDateMatcher, relativeNotePath } from '../../journal/services/journalDates';
import type { Task } from '../../../store/taskSlice';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { buildCalendar, type EntryKind } from '../services/calendarTasks';
import { spanColor } from '../services/spanColor';
import { kindKey } from './kindUi';
import { noteName } from './TaskChip';

/** Days the axis can be set to. Anything else falls back to a week. */
const HORIZONS = [7, 14] as const;

/** Rows each size preset has room for. */
const ROW_BUDGET: Record<string, number> = { sm: 4, md: 5, lg: 10 };

/** A day of the axis, as the header and the labels render it. */
interface Day {
    date: string;
    /** Localized short weekday, without the trailing dot some locales add. */
    short: string;
    num: string;
    isToday: boolean;
}

/**
 * A task placed on the axis. `from`/`to` are offsets in days from today, so
 * they can fall outside 0…6 — that's what makes a bar continue past an edge.
 */
interface Row {
    task: Task;
    kind: EntryKind;
    from: number;
    to: number;
    /** Set for multi-day tasks: the colour its ribbon has in the calendar. */
    color?: string;
}

/** The kind's colour — a multi-day task uses its own instead. */
function rowColor(row: Row): string {
    if (row.color) return row.color;
    switch (row.kind) {
        case 'overdue':
            return 'var(--zenith-danger)';
        case 'due':
        case 'process':
            return 'var(--zenith-accent)';
        case 'recurrence':
            return 'var(--zenith-info)';
        case 'start':
            return 'var(--zenith-success)';
        case 'scheduled':
            return 'var(--zenith-text-muted)';
        default:
            return 'var(--zenith-text-faint)';
    }
}

/** Only the two priorities worth a marker get one. */
function priorityColor(task: Task): string | null {
    if (task.priority === 'urgent') return 'var(--zenith-danger)';
    if (task.priority === 'high') return 'var(--zenith-warning)';
    return null;
}

function footerText(t: Translator, rows: Row[], overdue: number, days: Day[]): string {
    const total = rows.length + overdue;
    if (total === 0) return t('calendar.widget.nothing');

    const multiDay = rows.filter((r) => r.to > r.from).length;
    const next = rows
        .filter((r) => r.kind === 'due' || r.kind === 'recurrence')
        .sort((a, b) => a.from - b.from)[0];
    const day = next ? days[Math.max(0, Math.min(days.length - 1, next.from))] : null;

    return [
        t.plural('calendar.widget.taskCount', total),
        t.plural('calendar.widget.multiDayCount', multiDay),
        day
            ? t('calendar.widget.nextDue', { day: `${day.short} ${day.num}` })
            : t('calendar.widget.noDue'),
    ].join(' · ');
}

/**
 * The week ahead, as one axis.
 *
 * Seven day-columns spanning the card, and every task is a block sitting on the
 * days it occupies — a range is a filled ribbon, a single date a marker with
 * its title running off to the right. The title lives inside the block rather
 * than in a column of its own, which is what makes the card read at two tasks
 * as well as at twelve: fewer tasks means bigger blocks, not more empty space.
 *
 * Design: `Week Ahead.dc.html` / `WA_Ribbon` (concept 1b).
 */
export const CalendarWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';

    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);
    const journalOn = useZenithStore((s) => s.loadedModuleIds).includes('journal');

    // Ticks every minute so a deadline landing today counts down for real, and
    // so the axis rolls over at midnight on a card that's been open for days.
    const now = useNow();
    const today = toLocalIsoDate(now);

    // Horizon is configurable, so the geometry is derived rather than constant.
    const horizon = HORIZONS.includes(settings.calendarHorizonDays as (typeof HORIZONS)[number])
        ? settings.calendarHorizonDays
        : 7;
    const column = 100 / horizon;

    const rowLabel = settings.calendarWidgetRowLabel;
    const showCountdown = rowLabel === 'countdown' || rowLabel === 'both';
    const showNote = rowLabel === 'note' || rowLabel === 'both';

    const dailyNoteDate = useMemo(() => {
        if (!journalOn || !settings.calendarView.showDailyNotes) return undefined;
        const match = buildDateMatcher(settings.journalDateFormat);
        return (path: string): string | null => {
            const relative = relativeNotePath(path, settings.journalFolderPath);
            return relative ? match(relative) : null;
        };
    }, [
        journalOn,
        settings.calendarView.showDailyNotes,
        settings.journalDateFormat,
        settings.journalFolderPath,
    ]);

    const { days, rows, overdue } = useMemo(() => {
        // Finished work never appears here — a dashboard is about what's left,
        // and the full calendar is one click away for the rest.
        const calendar = buildCalendar(tasks, {
            today,
            spanDays: settings.calendarView.spanDays,
            showDailyNotes: settings.calendarView.showDailyNotes,
            hideDone: true,
            dailyNoteDate,
        });

        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        const days: Day[] = Array.from({ length: horizon }, (_, i) => {
            const date = addDays(today, i);
            return {
                date,
                short: weekday.format(isoToDate(date)).replace('.', ''),
                num: String(Number(date.slice(8, 10))),
                isToday: i === 0,
            };
        });
        const lastDate = days[days.length - 1].date;

        const overdue = (calendar.byDate.get(today) ?? []).filter((e) => e.kind === 'overdue');

        // A task is placed once. The span wins where a task has both a range and
        // a loose date of its own — the ribbon already says everything the
        // second row would.
        const byTask = new Map<string, Row>();
        for (const span of calendar.spans) {
            if (span.from > lastDate || span.to < today) continue;
            byTask.set(span.task.id, {
                task: span.task,
                kind: 'process',
                from: daysBetweenIso(today, span.from),
                to: daysBetweenIso(today, span.to),
                // Without per-task colours every ribbon takes the kind's accent,
                // which reads as one long task rather than several overlapping.
                color: settings.calendarSpanColors ? spanColor(span.task) : undefined,
            });
        }
        for (const [i, day] of days.entries()) {
            for (const entry of calendar.byDate.get(day.date) ?? []) {
                if (entry.kind === 'overdue' || byTask.has(entry.task.id)) continue;
                byTask.set(entry.task.id, { task: entry.task, kind: entry.kind, from: i, to: i });
            }
        }

        // Longest first, then earliest: the long runs settle at the top and read
        // as the backdrop the short ones sit against.
        const rows = [...byTask.values()].sort(
            (a, b) =>
                b.to - b.from - (a.to - a.from) ||
                a.from - b.from ||
                a.task.title.localeCompare(b.task.title)
        );

        return { days, rows, overdue };
    }, [
        tasks,
        today,
        locale,
        horizon,
        settings.calendarSpanColors,
        settings.calendarView.spanDays,
        settings.calendarView.showDailyNotes,
        dailyNoteDate,
    ]);

    /**
     * Everything in the widget leads to the Tasks view — the card, a bar, the
     * overdue strip, the "+N". A dashboard card is a summary, and the thing you
     * want after reading one is the list it summarises; jumping straight into a
     * note at a line number skipped that step and lost the surrounding tasks.
     */
    const openTasks = () => void plugin.moduleManager.get('tasks')?.activateView();

    const shown = rows.slice(0, ROW_BUDGET[size] ?? 5);
    const hidden = rows.length - shown.length;
    const last = days[days.length - 1];
    const weekRange = `${days[0].short} ${days[0].num} — ${last.short} ${last.num}`;
    const compact = size === 'sm';

    return (
        <div
            className="zenith-tcalw"
            role="button"
            tabIndex={0}
            aria-label={t('tasks.openTasks')}
            title={t('tasks.openTasks')}
            onClick={openTasks}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTasks();
                }
            }}
        >
            <div className="zenith-tcalw__days">
                {days.map((day) => (
                    <span className="zenith-tcalw__day" key={day.date}>
                        <span className={`zenith-tcalw__day-name ${day.isToday ? 'is-today' : ''}`}>
                            {day.short}
                        </span>
                        <span className="zenith-tcalw__day-num">{day.num}</span>
                    </span>
                ))}
            </div>

            {settings.calendarShowOverdue && overdue.length > 0 && (
                <div className="zenith-tcalw__overdue">
                    <AlertTriangle size={12} />
                    <span className="zenith-tcalw__overdue-count">
                        {t('calendar.widget.overdue', { count: overdue.length })}
                    </span>
                    <span className="zenith-tcalw__overdue-names">
                        {overdue
                            .slice(0, 2)
                            .map((e) => e.task.title)
                            .join(', ')}
                        {overdue.length > 2 ? `, +${overdue.length - 2}` : ''}
                    </span>
                </div>
            )}

            <div className="zenith-tcalw__axis">
                {/* The day grid sits behind the bars, so a block reads against
                    the column it starts in rather than floating. */}
                <div className="zenith-tcalw__grid" aria-hidden="true">
                    {days.map((day) => (
                        <span
                            className={`zenith-tcalw__column ${day.isToday ? 'is-today' : ''}`}
                            key={day.date}
                        />
                    ))}
                </div>

                {rows.length === 0 && overdue.length === 0 && (
                    <div className="zenith-tcalw__empty">
                        <CircleCheck size={13} />
                        <span>{t('calendar.widget.clearWeek')}</span>
                    </div>
                )}

                {shown.map((row) => {
                    const range = row.to > row.from;
                    const color = rowColor(row);
                    const openStart = row.from < 0;
                    const openEnd = row.to > horizon - 1;
                    const priority = priorityColor(row.task);
                    const due = dueCountdown(row.task.dueDate, t, now);

                    return (
                        <div className="zenith-tcalw__lane" key={row.task.id}>
                            <div
                                className={[
                                    'zenith-tcalw__bar',
                                    range ? 'is-range' : 'is-point',
                                    openEnd ? 'is-open-end' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                                style={{
                                    left: `${Math.max(row.from, 0) * column}%`,
                                    right: `${range ? (horizon - 1 - Math.min(row.to, horizon - 1)) * column : 0}%`,
                                    borderLeft: `2px ${openStart ? 'dashed' : 'solid'} ${color}`,
                                    background: range
                                        ? `color-mix(in oklab, ${color} 15%, var(--zenith-bg-primary))`
                                        : 'transparent',
                                }}
                                title={`${row.task.title} — ${noteName(row.task.filePath)}`}
                            >
                                {priority && (
                                    <span
                                        className="zenith-tcalw__prio"
                                        style={{ background: priority }}
                                    />
                                )}
                                <span
                                    className="zenith-tcalw__title"
                                    style={{ flex: range ? '1 1 auto' : '0 1 auto' }}
                                >
                                    {row.task.title}
                                </span>
                                {/* Near the right edge of a small card there is
                                    no room left for the label. */}
                                {!(compact && Math.max(row.from, 0) >= 5) && (
                                    <span className="zenith-tcalw__kind" style={{ color }}>
                                        {t(kindKey(row.kind))}
                                    </span>
                                )}
                                {/* Time left, not where the task lives: the note
                                    name was the same for nearly every row, while
                                    the deadline is the thing the card exists to
                                    answer. Short enough to survive the sm card,
                                    so unlike the note name it isn't gated on
                                    size; the note is still on the bar's tooltip. */}
                                {due && showCountdown && (
                                    <span
                                        className={`zenith-tcalw__due is-${due.tone}`}
                                        title={due.title}
                                    >
                                        {due.text}
                                    </span>
                                )}
                                {showNote && !compact && (
                                    <span className="zenith-tcalw__note">
                                        {noteName(row.task.filePath)}
                                    </span>
                                )}
                                {openEnd && (
                                    <span
                                        className="zenith-tcalw__tail"
                                        style={{ borderLeftColor: color }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}

                {hidden > 0 && (
                    <div className="zenith-tcalw__more">
                        {t('calendar.widget.moreOpen', { count: hidden })}
                        <ChevronRight size={11} />
                    </div>
                )}
            </div>

            <div className="zenith-tcalw__foot">
                <span className="zenith-tcalw__foot-stats">
                    {footerText(t, rows, overdue.length, days)}
                </span>
                <span className="zenith-tcalw__foot-range">{weekRange}</span>
            </div>
        </div>
    );
};
