import React, { useLayoutEffect, useRef, useState, type FC } from 'react';
import { Maximize2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { addDays, isoToDate } from '../../../core/calendarDates';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { ROOM_WIDE, useCardRoom } from '../../dashboard/cardRoom';
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

/** What the parts of the card take, for working out how many classes fit. */
const HEAD_PX = 32;
const ROW_PX = 46;
const LIST_TITLE_PX = 24;
const WEEK_PX = 100;
/** The rule and the air between the "now" side and a list under it. */
const STACK_GAP_PX = 24;
/** A card with this much height has room for the shape of the week as well. */
const WEEK_MIN_PX = 400;

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
 * Everything is on the card at once — no pages to swipe through, and nothing
 * that scrolls: the list is as many classes as the card's height holds,
 * starting from the one that is on or next, and says how many it left out. A
 * class that is over fades rather than disappearing, so the list keeps the
 * shape of the day.
 *
 * What is drawn follows the room the card has (cardRoom.ts), not the name of
 * its preset: the "now" side and the list stand side by side in a wide card,
 * and the list goes under it — or goes — in a narrow one.
 */
export const StudyWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const { plugin } = useApp();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const { today, now, preview } = useStudyNow();
    const [dialog, setDialog] = useState<'import' | 'edit' | null>(null);
    const room = useCardRoom();

    // The "now" side is as tall as what it says, which changes with the hour;
    // the list under it gets what is left, so it has to be measured.
    const nowRef = useRef<HTMLDivElement>(null);
    const [nowPx, setNowPx] = useState(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Every render: it reads what only exists after layout, and stops itself when nothing moved.
    useLayoutEffect(() => {
        const h = nowRef.current?.offsetHeight ?? 0;
        setNowPx((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    });

    // Every hook runs before the early return below: today's lessons are
    // simply none while there is no timetable.
    const lessons = lessonsOn(schedule, today, opts);
    const state = dayState(lessons, now);
    // Once today has nothing left — over, or never begun — the list is the
    // next day with classes: a column of finished classes answers nothing.
    const dayOver = state.kind === 'after' || state.kind === 'free';
    const upcoming = dayOver ? nextStudyDay(schedule, today, opts) : null;
    const listed = dayOver ? (upcoming?.lessons ?? []) : lessons;

    const dialogs = (
        <>
            {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
            {dialog === 'edit' && <EditorDialog onClose={() => setDialog(null)} />}
        </>
    );

    if (!schedule.lessons.length) {
        return (
            <div className="zenith-study zenith-study--widget">
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
    const split = room.width >= ROOM_WIDE;
    const term = termState(today, opts);
    const showWeek = room.height >= WEEK_MIN_PX && term !== 'before' && term !== 'after';

    const upcomingTitle =
        upcoming &&
        (upcoming.date === addDays(today, 1)
            ? t('study.list.tomorrow')
            : `${dayName(isoDay(upcoming.date), t.locale, 'long')}, ${isoToDate(
                  upcoming.date
              ).toLocaleDateString(t.locale, { day: 'numeric', month: 'long' })}`);

    // How many classes the list has the height for. Beside the "now" side it
    // has the card's; under it, what that side leaves — and there a list of
    // one class is not a list, so it waits for room for two.
    const listRoom =
        room.height -
        HEAD_PX -
        (showWeek ? WEEK_PX : 0) -
        (split ? 0 : nowPx + STACK_GAP_PX) -
        (upcomingTitle ? LIST_TITLE_PX : 0);
    const fits = room.height > 0 ? Math.max(0, Math.floor(listRoom / ROW_PX)) : 0;
    const showList = listed.length > 0 && fits >= (split ? 1 : 2);
    // From the class that is on, or next: the finished first class is not what
    // anyone opens the dashboard to see. One row gives way to the count of
    // what did not fit.
    const focusAt = dayOver ? 0 : Math.max(0, lessons.findIndex((l) => l.end > now));
    const room4 = listed.length > fits ? Math.max(1, fits - 1) : fits;
    const from = Math.max(0, Math.min(focusAt, listed.length - room4));
    const rows = listed.slice(from, from + room4);
    const left = listed.length - from - rows.length;

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
        <div className="zenith-study__now-side" ref={nowRef}>
            <NowCard schedule={schedule} opts={opts} today={today} now={now} roomy={split} />
            {!dayOver && <DayBand lessons={lessons} now={now} />}
        </div>
    );

    const list = showList && (
        <div className="zenith-study__list">
            {upcomingTitle && <span className="zenith-study__list-title">{upcomingTitle}</span>}
            {rows.map((item) => (
                <LessonRow
                    key={item.lesson.id}
                    item={item}
                    state={dayOver ? 'later' : rowState(item, now, nextStart)}
                    showTeacher={split}
                />
            ))}
            {left > 0 && (
                <span className="zenith-wcap zenith-wcap--faint zenith-study__more">
                    {t('common.more', { count: left })}
                </span>
            )}
        </div>
    );

    return (
        <div
            className={`zenith-study zenith-study--widget${split ? ' is-split' : ' is-stacked'}`}
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
