import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Notice, Platform } from 'obsidian';
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
import { useCalendarClasses } from '../../study/calendarClasses';
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
import { useFeature } from '../../../core/useFeature';

const MODES: CalendarViewMode[] = ['month', 'week', 'day', 'list'];

/**
 * How far the scrolling month run reaches, in months either side of the
 * anchor, and how much more it takes on each time the scroll nears an end.
 *
 * Both ends grow now. One month back was the old starting reach and the whole
 * of it: scrolling up stopped dead at the start of last month, which in a view
 * whose entire point is that the weeks run on reads as a bug rather than a
 * boundary. Forward still starts wider, because forward is where a calendar is
 * usually read.
 */
const RUN_BEHIND = 1;
const RUN_AHEAD = 4;
const RUN_STEP = 4;
/** Far enough that nobody scrolls to it; a guard against an unbounded run. */
const RUN_MAX = 60;

/**
 * The views that are switched on. The month is always there: it is the
 * calendar, not a feature of it.
 */
export function calendarModes(timeViews: boolean, agenda: boolean): CalendarViewMode[] {
    return MODES.filter((m) => (m !== 'week' && m !== 'day') || timeViews).filter(
        (m) => m !== 'list' || agenda
    );
}

/**
 * Validate the persisted view mode — it comes back from `data.json`, and may
 * name a view that has been switched off since.
 */
function toMode(raw: string, allowed: readonly CalendarViewMode[]): CalendarViewMode {
    return (allowed as string[]).includes(raw) ? (raw as CalendarViewMode) : 'month';
}

/**
 * Days across the month grid, and what decides it before anyone chooses.
 *
 * Seven columns need about ninety pixels each before a task chip says more
 * than its first letter. So the question is how wide the grid actually is, not
 * what kind of machine it is on: a phone is narrow, and so is this view docked
 * in a desktop sidebar, and both are unreadable at seven. `isMobile` only
 * decides the first frame, before there is an element to measure.
 */
const WIDE = 7;
const NARROW = 3;
const WIDE_ENOUGH = 620;

function toColumns(raw: number | undefined, roomy: boolean): number {
    // A number that was written down was written down by the user, and outranks
    // whatever the width would have said.
    if (raw === WIDE || raw === NARROW) return raw;
    return roomy ? WIDE : NARROW;
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

    const timeViewsOn = useFeature('calendar.timeViews');
    const agendaOn = useFeature('calendar.agenda');
    const spansOn = useFeature('calendar.spans');
    const dailyNotesOn = useFeature('calendar.dailyNotes');
    const allHoursOn = useFeature('calendar.allHours');
    const dragScheduleOn = useFeature('calendar.dragSchedule');
    const classesOn = useFeature('calendar.classes');
    const modes = useMemo(() => calendarModes(timeViewsOn, agendaOn), [timeViewsOn, agendaOn]);

    // What the toolbar's switches are stored as, and what is drawn: a switch
    // whose feature is off counts as off, and keeps its stored value for when
    // the feature comes back.
    const saved = settings.calendarView;
    const view = {
        ...saved,
        spanDays: spansOn && saved.spanDays,
        showDailyNotes: dailyNotesOn && saved.showDailyNotes,
        allHours: allHoursOn && saved.allHours,
    };
    const mode = toMode(saved.view, modes);
    const weekStart = settings.journalWeekStart;

    /**
     * Is there room for a week across? Only the answer is state, not the width
     * — dragging a window edge fires this continuously, and a re-render per
     * pixel of a grid this size is felt.
     */
    const rootRef = useRef<HTMLDivElement>(null);
    const [roomy, setRoomy] = useState(!Platform.isMobile);
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) =>
            setRoomy(entries[0].contentRect.width >= WIDE_ENOUGH)
        );
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const columns = toColumns(view.columns, roomy);
    const today = getTodayString();
    const currentMonth = today.slice(0, 7);

    const [anchor, setAnchor] = useState(today);
    const [focus, setFocus] = useState<EntryKind | null>(null);
    const [reach, setReach] = useState({ behind: RUN_BEHIND, ahead: RUN_AHEAD });
    /**
     * The month the month view has been scrolled to, reported by the grid.
     * Null until it has something to say — on mount, and in the views that
     * have no run to scroll.
     */
    const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
    /** Bumped to send the run back to the anchor even when the anchor stands. */
    const [jump, setJump] = useState(0);
    const anchorMonth = anchor.slice(0, 7);

    // Moving the anchor starts the run over from there, so the window does not
    // creep wider every time a different month is asked for.
    useEffect(() => setReach({ behind: RUN_BEHIND, ahead: RUN_AHEAD }), [anchorMonth]);

    const growAhead = useCallback(
        () =>
            setReach((r) =>
                r.ahead >= RUN_MAX ? r : { ...r, ahead: Math.min(RUN_MAX, r.ahead + RUN_STEP) }
            ),
        []
    );

    const growBehind = useCallback(
        () =>
            setReach((r) =>
                r.behind >= RUN_MAX ? r : { ...r, behind: Math.min(RUN_MAX, r.behind + RUN_STEP) }
            ),
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

    /**
     * The month the toolbar is speaking for. In the month view that's wherever
     * the run has been scrolled to, not the anchor it was built around — the
     * two part company the moment the reader scrolls, and a title that stayed
     * on the anchor would name a month that had left the screen.
     */
    const shownMonth = mode === 'month' ? (visibleMonth ?? anchorMonth) : anchorMonth;

    // Which dates the current view counts. The month and the agenda both count
    // the month the toolbar names and nothing else: the run's padding weeks
    // belong to the neighbouring months, and counting them under a heading
    // that says September would be a different, wrong number.
    const days = useMemo(() => {
        if (mode === 'day') return [anchor];
        if (mode === 'week') return weekGrid(anchor, weekStart);
        const base = mode === 'month' ? `${shownMonth}-01` : anchor;
        return monthGrid(base, weekStart).filter((date) => sameMonth(date, base));
    }, [mode, anchor, weekStart, shownMonth]);

    // Only the hour grid has a place for them: a class is a stretch of hours.
    const classes = useCalendarClasses(days, classesOn && (mode === 'week' || mode === 'day'));

    /** What the month view actually draws: several months of whole weeks. */
    const run = useMemo(
        () => (mode === 'month' ? monthRun(anchor, weekStart, reach.behind, reach.ahead) : []),
        [mode, anchor, weekStart, reach]
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
              : monthLabel(`${shownMonth}-01`, locale);

    /** Whether the title is naming the day, week or month we are living in. */
    const atCurrent =
        mode === 'day'
            ? anchor === today
            : mode === 'week'
              ? startOfWeek(anchor, weekStart) === startOfWeek(today, weekStart)
              : shownMonth === currentMonth;

    // The arrows move by whatever the view is a view *of*. The month view has
    // none: its months are a scroll, and a pager beside a scroll of the same
    // thing only ever disagrees with it.
    const step = (delta: number) =>
        setAnchor((current) => {
            if (mode === 'day') return addDays(current, delta);
            if (mode === 'week') return addDays(current, delta * 7);
            return addMonths(current, delta);
        });

    /**
     * Back to today. In the month view the anchor is usually already today —
     * the reader has scrolled away from it, not navigated — so `setAnchor`
     * alone would be a no-op and nothing would move. The token is what makes
     * the grid scroll home regardless.
     */
    const goToday = useCallback(() => {
        setAnchor(today);
        setVisibleMonth(currentMonth);
        setJump((n) => n + 1);
    }, [today, currentMonth]);

    const changeMode = (next: CalendarViewMode) => {
        updateSettings({ calendarView: { ...saved, view: next } });
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
        updateSettings({ calendarView: { ...saved, [key]: !view[key] } });

    /**
     * Widen or narrow the grid. Writing the number down is also what stops the
     * device deciding for this view again — which is the point of the button.
     */
    const changeColumns = () =>
        updateSettings({
            calendarView: { ...saved, columns: columns === WIDE ? NARROW : WIDE },
        });

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
        (segment: SpanSegment) =>
            openTask(segment.span.task.filePath, segment.span.task.lineNumber),
        [openTask]
    );

    // "+N more" opens the week; without the time views, the agenda of that
    // month; without either, it stays a count.
    const openWeek = timeViewsOn
        ? (date: string) => {
              setAnchor(startOfWeek(date, weekStart));
              updateSettings({ calendarView: { ...saved, view: 'week' } });
          }
        : agendaOn
          ? (date: string) => {
                setAnchor(date);
                updateSettings({ calendarView: { ...saved, view: 'list' } });
            }
          : undefined;

    const openDay = journalOn
        ? (date: string) => void openDailyNote(app, settings, date)
        : undefined;

    /** Optimistic status change, rolled back if the write fails. */
    const changeStatus = async (entry: CalendarEntry, status: TaskStatus) => {
        const { task } = entry;
        const previous = task.status;
        setTaskStatus(task.id, status);
        try {
            const ok = await new TaskWriter(app).setStatusInFile(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
            if (!ok) {
                setTaskStatus(task.id, previous);
                new Notice(t('calendar.error.status'));
            } else if (status === 'done' && task.recurrence) {
                // A recurring task rewrites itself on completion — re-read it so
                // the next occurrence lands on the calendar straight away.
                void plugin.dataService.reloadTasks();
            }
        } catch (err) {
            // Said out loud, like the `!ok` branch above.
            console.error('Zenith: failed to update the task:', err);
            setTaskStatus(task.id, previous);
            new Notice(t('calendar.error.status'));
        }
    };

    return (
        <div className={`zenith-tcal ${columns === NARROW ? 'is-narrow' : ''}`} ref={rootRef}>
            <CalendarToolbar
                t={t}
                mode={mode}
                title={title}
                atCurrent={atCurrent}
                counts={counts}
                columns={columns}
                onColumns={changeColumns}
                hideDone={view.hideDone}
                spanDays={view.spanDays}
                showDailyNotes={view.showDailyNotes}
                allHours={view.allHours}
                modes={modes}
                toggles={{
                    hideDone: true,
                    spanDays: spansOn,
                    showDailyNotes: dailyNotesOn,
                    allHours: allHoursOn,
                }}
                focus={focus}
                onMode={changeMode}
                onStep={step}
                onToday={goToday}
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
                    columns={columns}
                    calendar={calendar}
                    focus={focus}
                    onOpenDay={openDay}
                    onOpenEntry={openEntry}
                    onOpenSpan={openSpan}
                    onOpenWeek={openWeek}
                    onReachEnd={growAhead}
                    onReachStart={growBehind}
                    onVisibleMonth={setVisibleMonth}
                    jumpTo={jump}
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
                    dragSchedule={dragScheduleOn}
                    onOpenDay={openDay}
                    onOpenEntry={openEntry}
                    onOpenSpan={openSpan}
                    classes={classes}
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
                    onStatus={(entry, status) => void changeStatus(entry, status)}
                />
            )}
        </div>
    );
};
