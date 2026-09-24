import { useMemo } from 'react';
import type { StudySchedule } from './studyModel';
import { lessonsOn, slotsOf, type StudyOptions } from './studyTime';
import { useStudyOptions, useStudySchedule } from './useStudy';

/** A class as the calendar draws it: a stretch of the day that is spoken for. */
export interface CalendarClass {
    key: string;
    /** Minutes from midnight. */
    start: number;
    end: number;
    /** "Physics", or "Physics / Chemistry" when two subgroups share the time. */
    subject: string;
    room: string;
}

/**
 * Each date's classes, one per time slot: two subgroups at once are one
 * stretch of the day, and the calendar only needs to know it is taken.
 */
export function calendarClasses(
    schedule: StudySchedule,
    dates: readonly string[],
    opts: StudyOptions
): Map<string, CalendarClass[]> {
    const out = new Map<string, CalendarClass[]>();
    if (!schedule.lessons.length) return out;
    for (const date of dates) {
        const slots = slotsOf(lessonsOn(schedule, date, opts));
        if (!slots.length) continue;
        out.set(
            date,
            slots.map((slot) => ({
                key: `${date}:${slot[0].start}`,
                start: slot[0].start,
                end: Math.max(...slot.map((l) => l.end)),
                subject: [...new Set(slot.map((l) => l.lesson.subject))].join(' / '),
                room: slot
                    .map((l) => l.lesson.room)
                    .filter(Boolean)
                    .join(' / '),
            }))
        );
    }
    return out;
}

/** The timetable over `dates`, for a calendar; `null` while it should draw none. */
export function useCalendarClasses(
    dates: readonly string[],
    enabled: boolean
): Map<string, CalendarClass[]> | null {
    const schedule = useStudySchedule();
    const opts = useStudyOptions();
    const key = dates.join('|');
    return useMemo(
        () => (enabled ? calendarClasses(schedule, key ? key.split('|') : [], opts) : null),
        [enabled, schedule, opts, key]
    );
}
