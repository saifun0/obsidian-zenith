import { addDays, isoToDate, isoWeek, startOfWeek } from '../../core/calendarDates';
import { daysBetweenIso } from '../../core/dateUtils';
import { lessonTimes, type StudyLesson, type StudySchedule } from './studyModel';

/**
 * Where "now" falls in the timetable: which week of the cycle, which lessons
 * today, what is on now and what comes next.
 *
 * Pure, with the date and the minute passed in, so the widget, the view, the
 * reminders and the tests all ask the same function the same question.
 */

export interface StudyOptions {
    twoWeeks: boolean;
    /**
     * The Monday of a week that is the cycle's first. Empty: odd ISO weeks
     * are the first — a guess, and the reason "this week is the second one"
     * is one click away.
     */
    anchor: string;
    /** 0: every subgroup's lessons; 1, 2…: that subgroup's and the whole group's. */
    subgroup: number;
    termStart: string;
    termEnd: string;
}

/** Which week of the cycle `date` is in: always 1 without a cycle. */
export function weekOfCycle(date: string, opts: Pick<StudyOptions, 'twoWeeks' | 'anchor'>): 1 | 2 {
    if (!opts.twoWeeks) return 1;
    const monday = startOfWeek(date, 'mon');
    if (!opts.anchor) return isoWeek(monday).week % 2 === 1 ? 1 : 2;
    const weeks = Math.round(daysBetweenIso(startOfWeek(opts.anchor, 'mon'), monday) / 7);
    return ((weeks % 2) + 2) % 2 === 0 ? 1 : 2;
}

/** The anchor that makes the week of `date` the given one. */
export function anchorFor(date: string, week: 1 | 2): string {
    const monday = startOfWeek(date, 'mon');
    return week === 1 ? monday : addDays(monday, -7);
}

export type TermState = 'none' | 'before' | 'in' | 'after';

export function termState(
    date: string,
    opts: Pick<StudyOptions, 'termStart' | 'termEnd'>
): TermState {
    if (!opts.termStart && !opts.termEnd) return 'none';
    if (opts.termStart && date < opts.termStart) return 'before';
    if (opts.termEnd && date > opts.termEnd) return 'after';
    return 'in';
}

/** 1 Monday … 7 Sunday. */
export function isoDay(date: string): number {
    const d = isoToDate(date).getDay();
    return d === 0 ? 7 : d;
}

export interface DayLesson {
    lesson: StudyLesson;
    /** Minutes from midnight. */
    start: number;
    end: number;
}

/** Does this lesson happen in week `week` for this subgroup? */
export function lessonApplies(
    lesson: StudyLesson,
    week: 1 | 2,
    opts: Pick<StudyOptions, 'twoWeeks' | 'subgroup'>
): boolean {
    if (opts.twoWeeks && lesson.week !== 0 && lesson.week !== week) return false;
    if (opts.subgroup && lesson.subgroup && lesson.subgroup !== opts.subgroup) return false;
    return true;
}

/** A weekday's lessons in a given week of the cycle, earliest first. */
export function lessonsForDay(
    schedule: StudySchedule,
    day: number,
    week: 1 | 2,
    opts: Pick<StudyOptions, 'twoWeeks' | 'subgroup'>
): DayLesson[] {
    const out: DayLesson[] = [];
    for (const lesson of schedule.lessons) {
        if (lesson.day !== day || !lessonApplies(lesson, week, opts)) continue;
        const times = lessonTimes(lesson, schedule.bells);
        if (times) out.push({ lesson, ...times });
    }
    return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** The lessons on a date — none outside the term. */
export function lessonsOn(schedule: StudySchedule, date: string, opts: StudyOptions): DayLesson[] {
    const term = termState(date, opts);
    if (term === 'before' || term === 'after') return [];
    return lessonsForDay(schedule, isoDay(date), weekOfCycle(date, opts), opts);
}

export type DayState =
    | { kind: 'free' }
    | { kind: 'before'; next: DayLesson; minutesUntil: number }
    | {
          kind: 'during';
          current: DayLesson;
          next?: DayLesson;
          minutesLeft: number;
          fraction: number;
      }
    | { kind: 'break'; next: DayLesson; minutesUntil: number; previous: DayLesson }
    | { kind: 'after'; last: DayLesson };

/**
 * What the day is doing at `now` (minutes from midnight). Two lessons at
 * once — both subgroups shown — count as one slot: the first of them is
 * "current", and the next is whatever starts after it ends.
 */
export function dayState(lessons: readonly DayLesson[], now: number): DayState {
    if (!lessons.length) return { kind: 'free' };
    const current = lessons.find((l) => l.start <= now && now < l.end);
    if (current) {
        const next = lessons.find((l) => l.start >= current.end);
        return {
            kind: 'during',
            current,
            next,
            minutesLeft: current.end - now,
            fraction: (now - current.start) / (current.end - current.start),
        };
    }
    const next = lessons.find((l) => l.start > now);
    if (!next) return { kind: 'after', last: lessons[lessons.length - 1] };
    const previous = [...lessons].reverse().find((l) => l.end <= now);
    return previous
        ? { kind: 'break', next, minutesUntil: next.start - now, previous }
        : { kind: 'before', next, minutesUntil: next.start - now };
}

/**
 * The day's time slots: lessons sharing a start and an end are one — both
 * subgroups' labs at 10:10 are one class period, not two. What "3 classes
 * today" counts.
 */
export function slotsOf(lessons: readonly DayLesson[]): DayLesson[][] {
    const out: DayLesson[][] = [];
    for (const l of lessons) {
        const slot = out.find((s) => s[0].start === l.start && s[0].end === l.end);
        if (slot) slot.push(l);
        else out.push([l]);
    }
    return out;
}

/** The next day after `date` with lessons, within two weeks — or null. */
export function nextStudyDay(
    schedule: StudySchedule,
    date: string,
    opts: StudyOptions
): { date: string; lessons: DayLesson[] } | null {
    for (let i = 1; i <= 14; i++) {
        const day = addDays(date, i);
        const lessons = lessonsOn(schedule, day, opts);
        if (lessons.length) return { date: day, lessons };
    }
    return null;
}

/** The next date a subject is taught, after `date` — for "homework for next class". */
export function nextOccurrence(
    schedule: StudySchedule,
    subject: string,
    date: string,
    opts: StudyOptions
): string | null {
    for (let i = 1; i <= 28; i++) {
        const day = addDays(date, i);
        if (lessonsOn(schedule, day, opts).some((l) => l.lesson.subject === subject)) return day;
    }
    return null;
}

/** Lessons in a week, by weekday — what the view's grid and the week strip draw. */
export function weekLessons(
    schedule: StudySchedule,
    week: 1 | 2,
    opts: Pick<StudyOptions, 'twoWeeks' | 'subgroup'>
): Map<number, DayLesson[]> {
    const out = new Map<number, DayLesson[]>();
    for (let day = 1; day <= 7; day++) out.set(day, lessonsForDay(schedule, day, week, opts));
    return out;
}

/** Weekdays to show: Monday to Friday always, Saturday and Sunday when anything is on them. */
export function shownDays(schedule: StudySchedule): number[] {
    const days = [1, 2, 3, 4, 5];
    for (const day of [6, 7]) if (schedule.lessons.some((l) => l.day === day)) days.push(day);
    return days;
}

// ── Reminders ────────────────────────────────────────

export interface StudyEvent {
    key: string;
    at: number;
    date: string;
    lessonId: string;
    start: number;
}

const localMs = (date: string, minutes: number) => {
    const d = isoToDate(date);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d.getTime();
};

/** A reminder `before` minutes ahead of each lesson in `[from, to)`. */
export function studyEvents(
    schedule: StudySchedule,
    opts: StudyOptions,
    from: number,
    to: number,
    before: number
): StudyEvent[] {
    const out: StudyEvent[] = [];
    const first = new Date(from);
    let date = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
    // Covers a reminder due before midnight for a lesson just after it.
    date = addDays(date, -1);
    for (let guard = 0; guard < 60; guard++) {
        if (localMs(date, 0) - before * 60_000 >= to) break;
        const lessons = lessonsOn(schedule, date, opts);
        // Two subgroups at the same time are one moment to be told about.
        const seen = new Set<number>();
        for (const l of lessons) {
            if (seen.has(l.start)) continue;
            seen.add(l.start);
            const at = localMs(date, l.start) - before * 60_000;
            if (at >= from && at < to) {
                out.push({
                    key: `study:${date}:${l.start}`,
                    at,
                    date,
                    lessonId: l.lesson.id,
                    start: l.start,
                });
            }
        }
        date = addDays(date, 1);
    }
    return out;
}
