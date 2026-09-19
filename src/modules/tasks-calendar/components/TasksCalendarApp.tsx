import React, { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { openFileAtLine } from '../../../core/openInVault';
import type { TaskStatus } from '../../../core/constants';
import {
    addDays,
    addMonths,
    dayLabel,
    isoWeek,
    monthGrid,
    monthLabel,
    monthRun,
    sameMonth,
    startOfWeek,
    weekGrid,
} from '../../../core/calendarDates';
import { buildDateMatcher, relativeNotePath } from '../../journal/services/journalDates';
import { openDailyNote } from '../../journal/services/journalActions';
import { TaskWriter } from '../../tasks/services/taskWriter';
import {
    buildCalendar,
    countEntries,
    type CalendarEntry,
    type EntryKind,
    type SpanSegment,
} from '../services/calendarTasks';
import { CalendarToolbar, type CalendarToggle, type CalendarViewMode } from './CalendarToolbar';
import { MonthGrid } from './MonthGrid';
import { WeekGrid } from './WeekGrid';
import { AgendaList } from './AgendaList';

const MODES: CalendarViewMode[] = ['month', 'week', 'day', 'list'];

/**
 * How far the scrolling month run reaches, in months either side of the
 * anchor, and how much more it takes on each time the scroll nears its end.
 *
 * One month back rather than none, because the week a month starts in usually
 * belongs to the one before it, and arriving at a heading with nothing above it
 * reads as a rendering fault. Forward is where a calendar is read, so that is
 * the side that grows.
 */
const RUN_BEHIND = 1;
const RUN_AHEAD = 4;
const RUN_STEP = 4;
/** Far enough that nobody scrolls to it; a guard against an unbounded run. */
const RUN_MAX = 60;

/** Validate the persisted view mode — it comes back from `data.json`. */
function toMode(raw: string): CalendarViewMode {
    return (MODES as string[]).includes(raw) ? (raw as CalendarViewMode) : 'month';
}

/**
 * The Tasks Calendar.
 *
 * Tasks are read from the same store the Tasks module uses, so anything Zenith
 * already parses — the tasks folder plus, with the journal on, your daily notes
 * — shows up here without a second source of truth. What the calendar adds is
 * *placement*: the same task appears on the day it starts, the days it runs,
 * and the day it's due, because that's the question a calendar answers.
 */
export const TasksCalendarApp: FC = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const locale = t.locale === 'ru' ? 'ru-RU' : 'en-US';

    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);
    const journalOn = useZenithStore((s) => s.loadedModuleIds).includes('journal');

    const view = settings.calendarView;
    const mode = toMode(view.view);
    const weekStart = settings.journalWeekStart;
    const today = getTodayString();

    const [anchor, setAnchor] = useState(today);
    const [focus, setFocus] = useState<EntryKind | null>(null);
    const [ahead, setAhead] = useState(RUN_AHEAD);
    const anchorMonth = anchor.slice(0, 7);

    // Paging to a different month starts the run over from there, so the
    // window does not creep wider every time the arrows are used.
    useEffect(() => setAhead(RUN_AHEAD), [anchorMonth]);

    const growRun = useCallback(
        () => setAhead((n) => (n >= RUN_MAX ? n : Math.min(RUN_MAX, n + RUN_STEP))),
        []
    );

    /**
     * Recover a daily note's date from its path. Only wired up while the journal
     * module is active: without it there's no daily-note folder to speak of, and
     * every note in the vault would be a candidate.
     */
    const dailyNoteDate = useMemo(() => {
        if (!journalOn) return undefined;
        const match = buildDateMatcher(settings.journalDateFormat);
        return (path: string): string | null => {
            const relative = relativeNotePath(path, settings.journalFolderPath);
            return relative ? match(relative) : null;
        };
    }, [journalOn, settings.journalDateFormat, settings.journalFolderPath]);

    const calendar = useMemo(
        () =>
            buildCalendar(tasks, {
                today,
                spanDays: view.spanDays,
                showDailyNotes: view.showDailyNotes,
                hideDone: view.hideDone,
                dailyNoteDate,
            }),
        [tasks, today, view.spanDays, view.showDailyNotes, view.hideDone, dailyNoteDate]
    );

    // Which dates the current view covers — the grid, the counts and the agenda
    // all derive from this one list, so they can never disagree. The month grid
    // includes the neighbouring days that pad it out to whole weeks; the agenda
    // has no grid to pad, so it stops at the month it names in the title.
    const days = useMemo(() => {
        if (mode === 'day') return [anchor];
        if (mode === 'week') return weekGrid(anchor, weekStart);
        const grid = monthGrid(anchor, weekStart);
        return mode === 'list' ? grid.filter((date) => sameMonth(date, anchor)) : grid;
    }, [mode, anchor, weekStart]);

    /**
     * What the month view actually draws: several months of whole weeks, run
     * together. `days` stays the anchor month alone, because the figures in the
     * toolbar are about the month it names — counting six months of tasks under
     * a heading that says September would be a different, wrong number.
     */
    const run = useMemo(
        () => (mode === 'month' ? monthRun(anchor, weekStart, RUN_BEHIND, ahead) : []),
        [mode, anchor, weekStart, ahead]
    );

    const counts = useMemo(() => countEntries(calendar, days), [calendar, days]);

    const title =
        mode === 'day'
            ? dayLabel(anchor, locale)
            : mode === 'week'
              ? t('calendar.weekTitle', {
                    week: isoWeek(anchor).week,
                    month: monthLabel(anchor, locale),
                })
              : monthLabel(anchor, locale);

    // The arrows move by whatever the view is a view *of*.
    const step = (delta: number) =>
        setAnchor((current) => {
            if (mode === 'day') return addDays(current, delta);
            if (mode === 'week') return addDays(current, delta * 7);
            return addMonths(current, delta);
        });

    const changeMode = (next: CalendarViewMode) => {
        updateSettings({ calendarView: { ...view, view: next } });
        // Switching into a narrower view from a month you're browsing should
        // land in that month, not snap back to today — but if the month *is*
        // this one, the week or day you want is the current one.
        setAnchor((current) =>
            (next === 'week' || next === 'day') && current.slice(0, 7) === today.slice(0, 7)
                ? today
                : current
        );
    };

    const toggle = (key: CalendarToggle) =>
        updateSettings({ calendarView: { ...view, [key]: !view[key] } });

    const openTask = useCallback(
        (filePath: string, lineNumber: number) => {
            void openFileAtLine(app, filePath, lineNumber - 1);
        },
        [app]
    );

    const openEntry = useCallback(
        (entry: CalendarEntry) => openTask(entry.task.filePath, entry.task.lineNumber),
        [openTask]
    );

    const openSpan = useCallback(
        (segment: SpanSegment) => openTask(segment.span.task.filePath, segment.span.task.lineNumber),
        [openTask]
    );

    const openWeek = (date: string) => {
        setAnchor(startOfWeek(date, weekStart));
        updateSettings({ calendarView: { ...view, view: 'week' } });
    };

    const openDay = journalOn ? (date: string) => void openDailyNote(app, settings, date) : undefined;

    /** Optimistic status change, rolled back if the write fails. */
    const changeStatus = async (entry: CalendarEntry, status: TaskStatus) => {
        const { task } = entry;
        const previous = task.status;
        setTaskStatus(task.id, status);
        try {
            const ok = await new TaskWriter(app).setStatusInFile(task.filePath, task.lineNumber, status);
            if (!ok) {
                setTaskStatus(task.id, previous);
                new Notice(t('calendar.error.status'));
            } else if (status === 'done' && task.recurrence) {
                // A recurring task rewrites itself on completion — re-read it so
                // the next occurrence lands on the calendar straight away.
                void plugin.dataService.reloadTasks();
            }
        } catch {
            setTaskStatus(task.id, previous);
        }
    };

    return (
        <div className="zenith-tcal">
            <CalendarToolbar
                t={t}
                mode={mode}
                title={title}
                counts={counts}
                hideDone={view.hideDone}
                spanDays={view.spanDays}
                showDailyNotes={view.showDailyNotes}
                allHours={view.allHours}
                focus={focus}
                onMode={changeMode}
                onStep={step}
                onToday={() => setAnchor(today)}
                onToggle={toggle}
                onFocus={setFocus}
            />

            {mode === 'month' && (
                <MonthGrid
                    t={t}
                    anchor={anchor}
                    today={today}
                    days={run}
                    weekStart={weekStart}
                    calendar={calendar}
                    focus={focus}
                    onOpenDay={openDay}
                    onOpenEntry={openEntry}
                    onOpenSpan={openSpan}
                    onOpenWeek={openWeek}
                    onReachEnd={growRun}
                />
            )}

            {(mode === 'week' || mode === 'day') && (
                <WeekGrid
                    t={t}
                    today={today}
                    days={days}
                    calendar={calendar}
                    focus={focus}
                    defaultSlot={settings.calendarSlotMinutes}
                    allHours={view.allHours}
                    onOpenDay={openDay}
                    onOpenEntry={openEntry}
                    onOpenSpan={openSpan}
                />
            )}

            {mode === 'list' && (
                <AgendaList
                    t={t}
                    today={today}
                    days={days}
                    calendar={calendar}
                    focus={focus}
                    onOpenEntry={openEntry}
                    onStatus={changeStatus}
                />
            )}
        </div>
    );
};
