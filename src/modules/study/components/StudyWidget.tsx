import React, { useEffect, useRef, useState, type FC } from 'react';
import { Maximize2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { addDays, isoToDate } from '../../../core/calendarDates';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import {
    dayState,
    isoDay,
    lessonsOn,
    nextStudyDay,
    shownDays,
    slotsOf,
    termState,
    weekLessons,
    weekOfCycle,
} from '../studyTime';
import { dayName, useStudyNow, useStudyOptions, useStudySchedule, weekName } from '../useStudy';
import { DayBand, LessonRow, PreviewBadge, StudySetup, rowState } from './parts';
import { NowCard } from './NowCard';
import { ImportDialog } from './ImportDialog';
import { EditorDialog } from './EditorDialog';

/**
 * Where the widget's layout changes, measured rather than taken from the
 * preset: a `md` card in a sidebar is narrower than a `sm` one on a wide
 * board. Below SPLIT the card is one column; at or above it, the "now" side
 * and today's list sit next to each other.
 */
const SPLIT = 560;

/**
 * Classes on the dashboard.
 *
 * Built around the three questions a student has between two doors: what is
 * on now (or next), where, and how long until it ends (or starts). The card
 * answers those in its first lines, in that order, at every size. What the
 * extra room of a bigger card buys is context, never a second way to say the
 * same thing: the whole day as a strip with a needle at now, the day's list,
 * and at the largest size the week.
 *
 * Everything is on the card at once — no pages to swipe through. A class
 * that is over fades rather than disappearing, so the list keeps the shape
 * of the day.
 */
export const StudyWidget: FC<DashboardWidgetProps> = ({ size = 'md' }) => {
    const t = useTranslation();
    const { plugin } = useApp();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const { today, now, preview } = useStudyNow();
    const [dialog, setDialog] = useState<'import' | 'edit' | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const rootRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Every hook runs before the early return below: today's lessons are
    // simply none while there is no timetable.
    const lessons = lessonsOn(schedule, today, opts);
    const state = dayState(lessons, now);
    // Once today has nothing left — over, or never begun — the list is the
    // next day with classes: a column of finished classes answers nothing.
    const dayOver = state.kind === 'after' || state.kind === 'free';
    const upcoming = dayOver ? nextStudyDay(schedule, today, opts) : null;
    const listed = dayOver ? (upcoming?.lessons ?? []) : lessons;

    // A short card scrolls its list to what is on now, or next: the finished
    // first class is not what anyone opens the dashboard to see.
    const focusRow = dayOver ? undefined : lessons.find((l) => l.end > now)?.lesson.id;
    useEffect(() => {
        const box = listRef.current;
        const row = focusRow
            ? box?.querySelector<HTMLElement>(`[data-lesson="${focusRow}"]`)
            : null;
        if (!box) return;
        box.scrollTop = row ? Math.max(0, row.offsetTop - box.offsetTop - 4) : 0;
    }, [focusRow, width]);

    const dialogs = (
        <>
            {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
            {dialog === 'edit' && <EditorDialog onClose={() => setDialog(null)} />}
        </>
    );

    if (!schedule.lessons.length) {
        return (
            <div className="zenith-study zenith-study--widget" ref={rootRef}>
                <StudySetup
                    compact
                    onImport={() => setDialog('import')}
                    onEdit={() => setDialog('edit')}
                />
                {dialogs}
            </div>
        );
    }

    const week = weekOfCycle(today, opts);
    const nextStart =
        state.kind === 'before' || state.kind === 'break'
            ? state.next.start
            : state.kind === 'during'
              ? (state.next?.start ?? null)
              : null;
    const split = width >= SPLIT;
    const showList = size !== 'sm' && listed.length > 0;
    const showWeek =
        size === 'lg' && termState(today, opts) !== 'before' && termState(today, opts) !== 'after';

    const openFull = () => void plugin.moduleManager.get('study')?.activateView();

    const header = (
        <div className="zenith-study__top">
            <span className="zenith-study__day">
                {dayName(isoDay(today), t.locale, 'long')}
                {lessons.length > 0 && ` · ${t.plural('study.dayCount', slotsOf(lessons).length)}`}
            </span>
            {opts.twoWeeks && (
                <span className="zenith-study__week">{weekName(t, week, weekStyle)}</span>
            )}
            {preview && <PreviewBadge now={now} />}
            <button
                type="button"
                className="zenith-study__open"
                onClick={openFull}
                title={t('study.openFull')}
                aria-label={t('study.openFull')}
            >
                <Maximize2 size={12} />
            </button>
        </div>
    );

    const nowSide = (
        <div className="zenith-study__now-side">
            <NowCard
                schedule={schedule}
                opts={opts}
                today={today}
                now={now}
                roomy={split || size !== 'sm'}
            />
            {!dayOver && <DayBand lessons={lessons} now={now} />}
        </div>
    );

    const upcomingTitle =
        upcoming &&
        (upcoming.date === addDays(today, 1)
            ? t('study.list.tomorrow')
            : `${dayName(isoDay(upcoming.date), t.locale, 'long')}, ${isoToDate(
                  upcoming.date
              ).toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })}`);

    const list = showList && (
        <div className="zenith-study__list" ref={listRef}>
            {upcomingTitle && <span className="zenith-study__list-title">{upcomingTitle}</span>}
            {listed.map((item) => (
                <LessonRow
                    key={item.lesson.id}
                    item={item}
                    state={dayOver ? 'later' : rowState(item, now, nextStart)}
                    showTeacher={split}
                />
            ))}
        </div>
    );

    return (
        <div
            className={`zenith-study zenith-study--widget is-${size}${split ? ' is-split' : ' is-stacked'}`}
            ref={rootRef}
        >
            {header}
            {split ? (
                <div className="zenith-study__split">
                    {nowSide}
                    {list && <div className="zenith-study__divider" />}
                    {list}
                </div>
            ) : (
                <>
                    {nowSide}
                    {list}
                </>
            )}
            {showWeek && <WeekStrip today={today} week={week} />}
            {dialogs}
        </div>
    );
};

/**
 * The week in one line of small columns: a block per class in its kind's
 * colour, today's column marked. Not a second timetable — the shape of the
 * week, so "is Thursday the long day?" needs no opening of anything.
 */
const WeekStrip: FC<{ today: string; week: 1 | 2 }> = ({ today, week }) => {
    const t = useTranslation();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const byDay = weekLessons(schedule, week, opts);
    const todayIso = isoDay(today);
    return (
        <div className="zenith-study-week">
            {shownDays(schedule).map((day) => {
                const items = byDay.get(day) ?? [];
                const slots = slotsOf(items);
                return (
                    <div
                        key={day}
                        className={`zenith-study-week__day${day === todayIso ? ' is-today' : ''}`}
                        title={
                            items.map((i) => i.lesson.subject).join(', ') || t('study.noClasses')
                        }
                    >
                        <span className="zenith-study-week__name">
                            {dayName(day, t.locale, 'short')}
                        </span>
                        <span className="zenith-study-week__blocks">
                            {slots.map((slot) => (
                                <span
                                    key={slot[0].lesson.id}
                                    className={`zenith-study-week__block is-kind-${slot[0].lesson.kind}`}
                                />
                            ))}
                        </span>
                        <span className="zenith-study-week__count">{slots.length || '—'}</span>
                    </div>
                );
            })}
        </div>
    );
};
