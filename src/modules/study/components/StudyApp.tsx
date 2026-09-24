import React, { useEffect, useRef, useState, type FC } from 'react';
import { ClipboardPaste, GraduationCap, Pencil, Sparkles } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { addDays, isoToDate, startOfWeek } from '../../../core/calendarDates';
import { ViewHeader } from '../../../components/shared/ViewHeader';
import { IconButton } from '../../../components/shared/IconButton';
import { useZenithStore } from '../../../store';
import { slotOf, timeOf } from '../studyModel';
import {
    anchorFor,
    dayState,
    lessonsOn,
    shownDays,
    slotsOf,
    weekLessons,
    weekOfCycle,
    type DayLesson,
} from '../studyTime';
import { dayName, useStudyNow, useStudyOptions, useStudySchedule, weekName } from '../useStudy';
import {
    DayBand,
    LessonRow,
    RoomPill,
    StudySetup,
    copyPrompt,
    lessonMeta,
    rowState,
} from './parts';
import { NowCard } from './NowCard';
import { Segmented } from './LessonForm';
import { ImportDialog } from './ImportDialog';
import { EditorDialog } from './EditorDialog';
import { LessonDialog } from './LessonDialog';

/** Below this the week grid's columns get too narrow to read; the days stack instead. */
const GRID_MIN = 760;

type Dialog =
    | { kind: 'import' }
    | { kind: 'edit'; lessonId?: string }
    | { kind: 'lesson'; id: string; date: string }
    | null;

/**
 * The timetable, whole: today at the top, then the week — as the paper grid
 * it was copied from on a wide pane, as a list of days on a phone, where a
 * grid of seven narrow columns is unreadable.
 *
 * With a two-week cycle the week shown can be switched, and the week that is
 * current says so; if Zenith has the cycle the wrong way round, one click
 * swaps it.
 */
export const StudyApp: FC = () => {
    const t = useTranslation();
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const weekStyle = useZenithStore((s) => s.settings.studyWeekNames);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const { today, now } = useStudyNow();
    const current = weekOfCycle(today, opts);
    const [shown, setShown] = useState<1 | 2>(current);
    const [dialog, setDialog] = useState<Dialog>(null);

    const rootRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => setShown(current), [current]);

    const week = opts.twoWeeks ? shown : 1;
    // The other week of a cycle is next week — that is when its dates fall.
    const monday = addDays(startOfWeek(today, 'mon'), opts.twoWeeks && week !== current ? 7 : 0);
    const byDay = weekLessons(schedule, week, opts);
    const days = shownDays(schedule);
    const total = [...byDay.values()].reduce((sum, list) => sum + slotsOf(list).length, 0);
    const todayLessons = lessonsOn(schedule, today, opts);
    const grid = width >= GRID_MIN && schedule.bells.length > 0;

    const open = (item: DayLesson, date: string) =>
        setDialog({ kind: 'lesson', id: item.lesson.id, date });

    // Two figures, each its own span: the caption wraps between facts, never inside one.
    const caption = schedule.lessons.length ? (
        <>
            {opts.twoWeeks && <span>{weekName(t, current, weekStyle)}</span>}
            <span>{t.plural('study.weekLessons', total)}</span>
        </>
    ) : undefined;

    return (
        <div className="zenith-study zenith-study-view" ref={rootRef}>
            <ViewHeader icon={GraduationCap} title={t('study.title')} caption={caption}>
                <IconButton
                    icon={Sparkles}
                    tooltip={t('study.copyPrompt')}
                    onClick={() => void copyPrompt(t)}
                    variant="ghost"
                    size="md"
                />
                <IconButton
                    icon={ClipboardPaste}
                    tooltip={t('study.import')}
                    onClick={() => setDialog({ kind: 'import' })}
                    variant="ghost"
                    size="md"
                />
                <IconButton
                    icon={Pencil}
                    tooltip={t('study.edit')}
                    onClick={() => setDialog({ kind: 'edit' })}
                    variant="default"
                    size="md"
                />
            </ViewHeader>

            {!schedule.lessons.length ? (
                <StudySetup
                    onImport={() => setDialog({ kind: 'import' })}
                    onEdit={() => setDialog({ kind: 'edit' })}
                />
            ) : (
                <>
                    <section className="zenith-study-view__today">
                        <NowCard schedule={schedule} opts={opts} today={today} now={now} roomy />
                        <DayBand lessons={todayLessons} now={now} />
                    </section>

                    {opts.twoWeeks && (
                        <div className="zenith-study-view__weekbar">
                            <Segmented
                                value={String(shown)}
                                label={t('study.field.week')}
                                options={[1, 2].map((w) => ({
                                    value: String(w),
                                    label: `${weekName(t, w as 1 | 2, weekStyle)}${w === current ? ` · ${t('study.week.current')}` : ''}`,
                                }))}
                                onChange={(v) => setShown(v === '2' ? 2 : 1)}
                            />
                            <button
                                type="button"
                                className="zenith-study-view__swap"
                                onClick={() =>
                                    updateSettings({
                                        studyWeekAnchor: anchorFor(today, current === 1 ? 2 : 1),
                                    })
                                }
                            >
                                {t('study.week.swap')}
                            </button>
                        </div>
                    )}

                    {grid ? (
                        <WeekGrid
                            days={days}
                            monday={monday}
                            today={today}
                            now={week === current ? now : null}
                            byDay={byDay}
                            onOpen={open}
                        />
                    ) : (
                        <div className="zenith-study-view__days">
                            {days.map((day) => {
                                const date = addDays(monday, day - 1);
                                const items = byDay.get(day) ?? [];
                                const isToday = date === today;
                                const state = isToday ? dayState(items, now) : null;
                                const nextStart =
                                    state && (state.kind === 'before' || state.kind === 'break')
                                        ? state.next.start
                                        : state?.kind === 'during'
                                          ? (state.next?.start ?? null)
                                          : null;
                                return (
                                    <section
                                        key={day}
                                        className={`zenith-study-view__day${isToday ? ' is-today' : ''}`}
                                    >
                                        <h3>
                                            {dayName(day, t.locale)}
                                            <span>
                                                {isoToDate(date).toLocaleDateString(t.locale, {
                                                    day: 'numeric',
                                                    month: 'long',
                                                })}
                                            </span>
                                            {isToday && <em>{t('study.today')}</em>}
                                        </h3>
                                        {items.length ? (
                                            items.map((item) => (
                                                <LessonRow
                                                    key={item.lesson.id}
                                                    item={item}
                                                    state={
                                                        isToday
                                                            ? rowState(item, now, nextStart)
                                                            : 'later'
                                                    }
                                                    showTeacher
                                                    onClick={() => open(item, date)}
                                                />
                                            ))
                                        ) : (
                                            <p className="zenith-study-view__none">
                                                {t('study.noClasses')}
                                            </p>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    )}

                    {schedule.bells.length > 0 && (
                        <p className="zenith-study-view__bells">
                            <b>{t('study.bells')}</b>
                            {schedule.bells.map((b) => (
                                <span key={b.n}>
                                    {b.n} · {b.start}–{b.end}
                                </span>
                            ))}
                        </p>
                    )}
                </>
            )}

            {dialog?.kind === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
            {dialog?.kind === 'edit' && (
                <EditorDialog focusLessonId={dialog.lessonId} onClose={() => setDialog(null)} />
            )}
            {dialog?.kind === 'lesson' && (
                <LessonDialog
                    lessonId={dialog.id}
                    date={dialog.date}
                    onClose={() => setDialog(null)}
                    onEdit={(lessonId) => setDialog({ kind: 'edit', lessonId })}
                />
            )}
        </div>
    );
};

/**
 * The paper timetable: a row per bell, a column per day. A class whose own
 * time falls in no bell goes in a last row of its own rather than being
 * squeezed into the nearest one.
 */
const WeekGrid: FC<{
    days: number[];
    monday: string;
    today: string;
    now: number | null;
    byDay: Map<number, DayLesson[]>;
    onOpen: (item: DayLesson, date: string) => void;
}> = ({ days, monday, today, now, byDay, onOpen }) => {
    const t = useTranslation();
    const schedule = useStudySchedule();
    const { bells } = schedule;
    const offGrid = days.some((d) =>
        (byDay.get(d) ?? []).some((i) => slotOf(i.lesson, bells) === undefined)
    );
    const rows: Array<{ key: string; label: React.ReactNode; slot?: number }> = [
        ...bells.map((b) => ({
            key: `b${b.n}`,
            slot: b.n,
            label: (
                <>
                    <b>{b.n}</b>
                    <span>{b.start}</span>
                    <span>{b.end}</span>
                </>
            ),
        })),
        ...(offGrid ? [{ key: 'other', label: <span>{t('study.otherTime')}</span> }] : []),
    ];

    return (
        <div className="zenith-study-grid" style={{ ['--study-days' as string]: days.length }}>
            <span className="zenith-study-grid__corner" />
            {days.map((day) => {
                const date = addDays(monday, day - 1);
                return (
                    <span
                        key={day}
                        className={`zenith-study-grid__head${date === today ? ' is-today' : ''}`}
                    >
                        {dayName(day, t.locale, 'short')}
                        <b>{isoToDate(date).getDate()}</b>
                    </span>
                );
            })}
            {rows.map((row) => (
                <React.Fragment key={row.key}>
                    <span className="zenith-study-grid__slot">{row.label}</span>
                    {days.map((day) => {
                        const date = addDays(monday, day - 1);
                        const isToday = date === today;
                        const items = (byDay.get(day) ?? []).filter(
                            (i) => slotOf(i.lesson, bells) === row.slot
                        );
                        return (
                            <div
                                key={day}
                                className={`zenith-study-grid__cell${isToday ? ' is-today' : ''}`}
                            >
                                {items.map((item) => {
                                    const live =
                                        isToday &&
                                        now !== null &&
                                        item.start <= now &&
                                        now < item.end;
                                    const past = isToday && now !== null && item.end <= now;
                                    return (
                                        <button
                                            key={item.lesson.id}
                                            type="button"
                                            className={`zenith-study-cell is-kind-${item.lesson.kind}${live ? ' is-now' : ''}${past ? ' is-past' : ''}`}
                                            onClick={() => onOpen(item, date)}
                                            title={item.lesson.teacher ?? ''}
                                        >
                                            <span className="zenith-study-cell__subject">
                                                {item.lesson.subject}
                                            </span>
                                            <span className="zenith-study-cell__meta">
                                                {lessonMeta(item.lesson, t)}
                                            </span>
                                            {row.slot === undefined && (
                                                <span className="zenith-study-cell__meta">
                                                    {timeOf(item.start)}–{timeOf(item.end)}
                                                </span>
                                            )}
                                            <RoomPill room={item.lesson.room} />
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
        </div>
    );
};
