import React, { useCallback, useMemo, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { RotateCw, CalendarDays, CalendarCheck, Info } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { JournalTracker } from '../../../core/journalConfig';
import { usableTrackers } from '../services/usableTrackers';
import type { TrackerValue } from '../../../store/journalSlice';
import { IconButton } from '../../../components/shared/IconButton';
import { ViewHeader } from '../../../components/shared';
import { entriesByDate } from '../services/journalStats';
import { setTrackerValue, openDailyNote, createDailyNote } from '../services/journalActions';
import { addDays } from '../services/journalDates';
import { useFeature } from '../../../core/useFeature';
import { JournalCalendar } from './JournalCalendar';
import { YearPixels } from './YearPixels';
import { DayPanel } from './DayPanel';
import { JournalStats } from './JournalStats';

/**
 * JournalApp — the Journal view: a month at a time, with the selected day's
 * check-in, tasks and note preview beside it.
 */
export const JournalApp: FC = () => {
    const { app, plugin } = useApp();
    const t = useTranslation();

    const entries = useZenithStore((s) => s.journalEntries);
    const journalLoading = useZenithStore((s) => s.journalLoading);
    const tasks = useZenithStore((s) => s.tasks);
    const settings = useZenithStore((s) => s.settings);

    const today = getTodayString();
    const [selected, setSelected] = useState(today);
    const [monthAnchor, setMonthAnchor] = useState(today);

    // Switched-off trackers keep their history but leave every surface.
    const trackers = useMemo(() => usableTrackers(settings), [settings]);
    const byDate = useMemo(() => entriesByDate(entries), [entries]);
    const entry = byDate.get(selected);

    const statsOn = useFeature('journal.stats');
    const wordsOn = useFeature('journal.wordCount');
    const monthOn = useFeature('journal.habitMonth');
    const moodColorsOn = useFeature('journal.moodColors');
    const yearPixelsOn = useFeature('journal.yearPixels');
    const [scale, setScale] = useState<'month' | 'year'>('month');
    const [pixelYear, setPixelYear] = useState(() => Number(today.slice(0, 4)));
    const [pixelTrackerId, setPixelTrackerId] = useState<string | null>(null);
    const pixelTracker =
        trackers.find((tr) => tr.id === pixelTrackerId) ??
        trackers.find((tr) => tr.kind === 'scale') ??
        trackers[0];

    /** The calendar tints days by the first scale tracker — normally the mood. */
    const colorBy = useMemo(
        () => (moodColorsOn ? trackers.find((tr) => tr.kind === 'scale') : undefined),
        [trackers, moodColorsOn]
    );

    /** Days with a task due — a marker dot in the calendar. */
    const taskDays = useMemo(() => {
        const days = new Set<string>();
        for (const task of tasks) {
            if (task.dueDate && task.status !== 'done' && task.status !== 'cancelled') {
                days.add(task.dueDate);
            }
        }
        return days;
    }, [tasks]);

    /**
     * The selected day's tasks: everything due that day, plus whatever lives in
     * that day's note (captured tasks carry no due date of their own, and are
     * still very much that day's work).
     */
    const dayTasks = useMemo(() => {
        const notePath = entry?.filePath;
        const seen = new Set<string>();
        return tasks.filter((task) => {
            if (seen.has(task.id)) return false;
            const match = task.dueDate === selected || (!!notePath && task.filePath === notePath);
            if (match) seen.add(task.id);
            return match;
        });
    }, [tasks, selected, entry?.filePath]);

    /**
     * Bumped by the refresh button. The habit grid watches it and replays its
     * entrance — refreshing is someone asking to see the month again, and it
     * is the one moment you can be sure they are looking at it.
     */
    const [replay, setReplay] = useState(0);

    const refresh = useCallback(async () => {
        setReplay((n) => n + 1);
        await Promise.all([plugin.dataService.reloadJournal(), plugin.dataService.reloadTasks()]);
    }, [plugin]);

    const goToday = () => {
        setSelected(today);
        setMonthAnchor(today);
    };

    const selectDate = (date: string) => {
        setSelected(date);
        // Clicking a trailing/leading cell should follow the month it belongs
        // to, otherwise the next click lands in a grid that just moved.
        if (date.slice(0, 7) !== monthAnchor.slice(0, 7)) setMonthAnchor(date);
    };

    const changeTracker = (tracker: JournalTracker, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, selected, tracker.id, next);

    /**
     * Recording a day straight from the habit grid.
     *
     * Any day of the month, not just the selected one — catching up on
     * yesterday is the thing a month-wide grid exists to make possible, and it
     * writes through exactly the same call the day panel uses, into that day's
     * own note.
     */
    const setHabit = (tracker: JournalTracker, date: string, next: TrackerValue | null) =>
        void setTrackerValue(app, settings, date, tracker.id, next);

    return (
        <div className="zenith-journal">
            <ViewHeader icon={CalendarDays} title={t('journal.title')}>
                <IconButton
                    icon={CalendarCheck}
                    tooltip={t('journal.goToday')}
                    onClick={goToday}
                    variant="ghost"
                    size="md"
                />
                {/* A notice, not a panel: reading it moves nothing on the
                        page, and it goes away by itself once read. A toggle
                        pushed the whole calendar down and had to be turned off
                        again by hand. */}
                <IconButton
                    icon={Info}
                    tooltip={t('habits.explain')}
                    onClick={() => new Notice(t('habits.legend'), 12000)}
                    variant="ghost"
                    size="md"
                />
                <IconButton
                    icon={RotateCw}
                    tooltip={t('common.refresh')}
                    onClick={() => void refresh()}
                    disabled={journalLoading}
                    variant="ghost"
                    size="md"
                />
            </ViewHeader>

            {/* Always on screen. It used to hide behind a toggle, which meant
                the month you are actually keeping was one click further away
                than the month you are only looking at. */}
            {(statsOn || monthOn) && (
                <JournalStats
                    entries={entries}
                    trackers={trackers}
                    today={today}
                    monthAnchor={monthAnchor}
                    animate={settings.uiAnimations}
                    replay={replay}
                    onSetValue={setHabit}
                    showOverview={statsOn}
                    showWords={wordsOn}
                    showMonth={monthOn}
                />
            )}

            <div className="zenith-journal__body">
                {yearPixelsOn && scale === 'year' ? (
                    <YearPixels
                        year={pixelYear}
                        byDate={byDate}
                        trackers={trackers}
                        tracker={pixelTracker}
                        selected={selected}
                        today={today}
                        onSelect={(date) => {
                            setSelected(date);
                            setMonthAnchor(date);
                        }}
                        onYear={setPixelYear}
                        onTracker={setPixelTrackerId}
                        onMonth={() => setScale('month')}
                    />
                ) : (
                    <JournalCalendar
                        monthAnchor={monthAnchor}
                        selected={selected}
                        today={today}
                        byDate={byDate}
                        weekStart={settings.journalWeekStart}
                        colorBy={colorBy}
                        trackers={trackers}
                        taskDays={taskDays}
                        onSelect={selectDate}
                        onOpen={(date) => void openDailyNote(app, settings, date)}
                        onMonthChange={setMonthAnchor}
                        onYear={
                            yearPixelsOn
                                ? () => {
                                      setPixelYear(Number(monthAnchor.slice(0, 4)));
                                      setScale('year');
                                  }
                                : undefined
                        }
                    />
                )}

                <DayPanel
                    date={selected}
                    today={today}
                    entry={entry}
                    trackers={trackers}
                    tasks={dayTasks}
                    onOpen={() => void openDailyNote(app, settings, selected)}
                    onCreate={() => void createDailyNote(app, settings, selected)}
                    onTrackerChange={changeTracker}
                    onShiftDay={(delta) => selectDate(addDays(selected, delta))}
                />
            </div>
        </div>
    );
};
