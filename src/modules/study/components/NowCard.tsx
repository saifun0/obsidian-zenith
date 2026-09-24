import React, { type FC } from 'react';
import { Coffee, Moon, Palmtree } from 'lucide-react';
import { useTranslation, type Translator } from '../../../core/i18n';
import { addDays, isoToDate } from '../../../core/calendarDates';
import { timeOf, type StudySchedule } from '../studyModel';
import {
    dayState,
    lessonsOn,
    nextStudyDay,
    slotsOf,
    termState,
    type DayLesson,
    type StudyOptions,
} from '../studyTime';
import { duration } from '../useStudy';
import { RoomPill, kindLabel, lessonMeta } from './parts';

/** "Tomorrow from 08:30 · 3 classes", "Monday from 10:10 · 2 classes". */
export function nextDayLine(
    next: { date: string; lessons: DayLesson[] } | null,
    today: string,
    t: Translator
): string {
    if (!next) return t('study.noneAhead');
    const time = timeOf(next.lessons[0].start);
    const when =
        next.date === addDays(today, 1)
            ? t('study.tomorrow', { time })
            : t('study.nextDay', {
                  day: capital(
                      isoToDate(next.date).toLocaleDateString(t.locale, { weekday: 'long' })
                  ),
                  time,
              });
    return `${when} · ${t.plural('study.dayCount', slotsOf(next.lessons).length)}`;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const sameSlot = (item: DayLesson, lessons: readonly DayLesson[]) =>
    lessons.filter((l) => l.start === item.start && l.end === item.end);

/** Subjects sharing the slot — both subgroups' labs at once — as one title. */
function slotTitle(item: DayLesson, lessons: readonly DayLesson[]): string {
    return [...new Set(sameSlot(item, lessons).map((l) => l.lesson.subject))].join(' / ');
}

/**
 * Where to go, and what it is. One class: its room, loud, then kind and
 * teacher. A slot two subgroups share: each subgroup's room, so neither has to
 * work out which of the two numbers is theirs.
 */
const Places: FC<{ item: DayLesson; lessons: readonly DayLesson[]; roomy: boolean }> = ({
    item,
    lessons,
    roomy,
}) => {
    const t = useTranslation();
    const slot = sameSlot(item, lessons);
    if (slot.length === 1) {
        return (
            <span className="zenith-study-now__meta">
                <RoomPill room={item.lesson.room} strong />
                <span>{lessonMeta(item.lesson, t, { teacher: roomy })}</span>
            </span>
        );
    }
    const kinds = [...new Set(slot.map((l) => l.lesson.kind))];
    return (
        <span className="zenith-study-now__meta">
            {slot.map((l) => (
                <span key={l.lesson.id} className="zenith-study-now__place">
                    <span>
                        {l.lesson.subgroup
                            ? t('study.subgroup', { n: l.lesson.subgroup })
                            : l.lesson.subject}
                    </span>
                    <RoomPill room={l.lesson.room ?? '—'} strong />
                </span>
            ))}
            {kinds.length === 1 && <span>{kindLabel(t, kinds[0])}</span>}
        </span>
    );
};

function slotLabel(item: DayLesson, t: Translator): string {
    return item.lesson.n !== undefined
        ? t('study.pair', { n: item.lesson.n })
        : `${timeOf(item.start)}–${timeOf(item.end)}`;
}

/**
 * What the day is doing, said the way a student asks it: what is on now
 * and where, how long is left; or what is next, where, and in how long;
 * or when classes start again.
 *
 * The room is the loudest thing after the subject. Between classes it is
 * the only thing that matters — which building, which floor — and a
 * timetable that hides it in the fine print makes you open it twice.
 */
export const NowCard: FC<{
    schedule: StudySchedule;
    opts: StudyOptions;
    today: string;
    now: number;
    /** Teacher and the "then" line — where there is room for them. */
    roomy?: boolean;
}> = ({ schedule, opts, today, now, roomy = false }) => {
    const t = useTranslation();
    const term = termState(today, opts);
    const lessons = lessonsOn(schedule, today, opts);
    const state = dayState(lessons, now);

    if (term === 'before' || term === 'after') {
        return (
            <div className="zenith-study-now is-quiet">
                <span className="zenith-study-now__kicker">{t('study.holiday')}</span>
                <span className="zenith-study-now__title">
                    <Palmtree size={18} />
                    {term === 'before'
                        ? t('study.termBefore', {
                              date: isoToDate(opts.termStart).toLocaleDateString(t.locale, {
                                  day: 'numeric',
                                  month: 'long',
                              }),
                          })
                        : t('study.termAfter')}
                </span>
            </div>
        );
    }

    if (state.kind === 'free' || state.kind === 'after') {
        const upcoming = nextStudyDay(schedule, today, opts);
        return (
            <div className="zenith-study-now is-quiet">
                <span className="zenith-study-now__kicker">{t('study.today')}</span>
                <span className="zenith-study-now__title">
                    {state.kind === 'free' ? <Coffee size={18} /> : <Moon size={18} />}
                    {t(state.kind === 'free' ? 'study.free' : 'study.dayDone')}
                </span>
                <span className="zenith-study-now__sub">{nextDayLine(upcoming, today, t)}</span>
            </div>
        );
    }

    if (state.kind === 'during') {
        const { current, next } = state;
        return (
            <div className={`zenith-study-now is-during is-kind-${current.lesson.kind}`}>
                <span className="zenith-study-now__kicker">
                    {t('study.now')} · {slotLabel(current, t)}
                </span>
                <span className="zenith-study-now__title">{slotTitle(current, lessons)}</span>
                <Places item={current} lessons={lessons} roomy={roomy} />
                <div className="zenith-study-now__progress">
                    <span className="zenith-study-now__bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(state.fraction * 100)}%` }} />
                    </span>
                    <span className="zenith-study-now__left">
                        <b>{t('study.left', { time: duration(state.minutesLeft, t) })}</b>
                        <span>{t('study.until', { time: timeOf(current.end) })}</span>
                    </span>
                </div>
                {roomy && next && (
                    <span className="zenith-study-now__then">
                        <span>{t('study.then')}</span>
                        <b>{timeOf(next.start)}</b>
                        <span className="zenith-study-now__then-subject">
                            {next.lesson.subject}
                        </span>
                        <RoomPill room={next.lesson.room} />
                    </span>
                )}
            </div>
        );
    }

    // Before the first class, or between two.
    const { next, minutesUntil } = state;
    return (
        <div className={`zenith-study-now is-waiting is-kind-${next.lesson.kind}`}>
            <span className="zenith-study-now__kicker">
                {state.kind === 'break'
                    ? `${t('study.break', { time: duration(minutesUntil, t) })} · ${slotLabel(next, t)}`
                    : // "First class · class 1" says one thing twice; the number
                      // is news only when the day starts later.
                      next.lesson.n !== undefined && next.lesson.n > 1
                      ? `${t('study.first')} · ${slotLabel(next, t)}`
                      : t('study.first')}
            </span>
            <span className="zenith-study-now__title">{slotTitle(next, lessons)}</span>
            <Places item={next} lessons={lessons} roomy={roomy} />
            <span className="zenith-study-now__countdown">
                <b>{t('study.in', { time: duration(minutesUntil, t) })}</b>
                <span>{timeOf(next.start)}</span>
            </span>
        </div>
    );
};
