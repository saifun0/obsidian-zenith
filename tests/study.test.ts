import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    conflicts,
    generateBells,
    lessonTimes,
    normalizeSchedule,
    slotOf,
    type StudySchedule,
} from '../src/modules/study/studyModel';
import {
    exportSchedule,
    extractJson,
    importSchedule,
    readDay,
    readKind,
    readRange,
    readWeek,
} from '../src/modules/study/studyImport';
import {
    anchorFor,
    dayState,
    lessonsOn,
    nextOccurrence,
    nextStudyDay,
    shownDays,
    slotsOf,
    studyEvents,
    termState,
    weekOfCycle,
    type StudyOptions,
} from '../src/modules/study/studyTime';
import { aiPrompt, PROMPT_EXAMPLE } from '../src/modules/study/studyPrompt';
import {
    clearStudyPreview,
    previewOffset,
    previewPresets,
    setStudyPreview,
    studyPreviewOffset,
} from '../src/modules/study/previewClock';
import { calendarClasses } from '../src/modules/study/calendarClasses';

const TODAY = '2026-09-24'; // a Thursday, ISO week 39

const BELLS = [
    { n: 1, start: '08:30', end: '10:00' },
    { n: 2, start: '10:10', end: '11:40' },
    { n: 3, start: '12:20', end: '13:50' },
];

const SCHEDULE: StudySchedule = normalizeSchedule({
    bells: BELLS,
    lessons: [
        { id: 'a', day: 4, n: 1, week: 0, subject: 'Maths', kind: 'lecture', room: '305' },
        {
            id: 'b',
            day: 4,
            n: 2,
            week: 1,
            subject: 'Physics',
            kind: 'lab',
            room: '214',
            subgroup: 1,
        },
        {
            id: 'c',
            day: 4,
            n: 2,
            week: 1,
            subject: 'Chemistry',
            kind: 'lab',
            room: '215',
            subgroup: 2,
        },
        { id: 'd', day: 4, n: 3, week: 2, subject: 'Programming', kind: 'practice' },
        { id: 'e', day: 1, n: 2, week: 0, subject: 'History', kind: 'seminar' },
        {
            id: 'f',
            day: 5,
            start: '18:00',
            end: '19:30',
            week: 0,
            subject: 'English',
            kind: 'practice',
        },
    ],
});

const OPTS: StudyOptions = { twoWeeks: true, anchor: '', subgroup: 0, termStart: '', termEnd: '' };

describe('the timetable model', () => {
    it('keeps what it can draw and drops the rest', () => {
        const s = normalizeSchedule({
            bells: [
                { n: 1, start: '8:30', end: '10:00' },
                { n: 1, start: '09:00', end: '10:00' },
                { n: 2, start: 'soon', end: '12:00' },
            ],
            lessons: [
                { day: 9, subject: 'x' },
                { day: 2, subject: '' },
                { day: 2, subject: 'Art', kind: 'dance', week: 3 },
            ],
        });
        expect(s.bells).toEqual([{ n: 1, start: '08:30', end: '10:00' }]);
        expect(s.lessons).toHaveLength(1);
        expect(s.lessons[0]).toMatchObject({ subject: 'Art', kind: 'other', week: 0 });
    });

    it('takes a lesson’s times from its bell unless it has its own', () => {
        expect(lessonTimes(SCHEDULE.lessons[0], BELLS)).toEqual({ start: 510, end: 600 });
        expect(lessonTimes(SCHEDULE.lessons[5], BELLS)).toEqual({ start: 1080, end: 1170 });
        expect(slotOf({ ...SCHEDULE.lessons[5], start: '10:30', end: '11:30' }, BELLS)).toBe(2);
    });

    it('finds lessons that clash, and lets subgroups and weeks share a slot', () => {
        expect(conflicts(SCHEDULE)).toEqual([]);
        const clash = normalizeSchedule({
            bells: BELLS,
            lessons: [
                { id: 'x', day: 1, n: 1, subject: 'A' },
                { id: 'y', day: 1, n: 1, week: 2, subject: 'B' },
            ],
        });
        expect(conflicts(clash)).toHaveLength(1);
    });

    it('lays bells out evenly, with a long break where asked', () => {
        expect(
            generateBells({
                first: '08:30',
                length: 90,
                gap: 10,
                count: 4,
                longAfter: 2,
                longGap: 40,
            })
        ).toEqual([
            { n: 1, start: '08:30', end: '10:00' },
            { n: 2, start: '10:10', end: '11:40' },
            { n: 3, start: '12:20', end: '13:50' },
            { n: 4, start: '14:00', end: '15:30' },
        ]);
    });
});

describe('the paste box', () => {
    it('reads the words people and models use', () => {
        expect(readDay('Вторник')).toBe(2);
        expect(readDay('fri.')).toBe(5);
        expect(readDay(7)).toBe(7);
        expect(readDay('someday')).toBeUndefined();
        expect(readWeek('Числитель')).toBe(1);
        expect(readWeek('even')).toBe(2);
        expect(readWeek(undefined)).toBe(0);
        expect(readWeek('каждая')).toBe(0);
        expect(readWeek('fortnightly')).toBeUndefined();
        expect(readKind('лаб.')).toBe('lab');
        expect(readKind('ПЗ')).toBe('practice');
        expect(readKind('dance')).toBe('other');
        expect(readRange('8.30 – 10.00')).toEqual({ start: '08:30', end: '10:00' });
    });

    it('finds the JSON in a fenced, chatty answer with a trailing comma', () => {
        const answer =
            'Here you go:\n```json\n{ "lessons": [ { "day": 1, "subject": "A", "time": "9:00-10:00", }, ] }\n```\nGood luck!';
        expect(extractJson(answer)).toEqual({
            lessons: [{ day: 1, subject: 'A', time: '9:00-10:00' }],
        });
    });

    it('imports a timetable and says what it could not place', () => {
        const result = importSchedule(`{
            "bells": [ { "n": 1, "time": "08:30-10:00" } ],
            "lessons": [
                { "day": "пн", "pair": 1, "subject": "Матанализ", "type": "лек.", "auditorium": "305" },
                { "day": "вт", "time": "18:00-19:30", "week": "знаменатель", "subject": "Английский" },
                { "day": "ср", "subject": "Без времени" },
                { "subject": "Без дня", "n": 1 }
            ]
        }`);
        expect(result.schedule.bells).toEqual([{ n: 1, start: '08:30', end: '10:00' }]);
        expect(
            result.schedule.lessons.map((l) => [l.day, l.subject, l.kind, l.week, l.room])
        ).toEqual([
            [1, 'Матанализ', 'lecture', 0, '305'],
            [2, 'Английский', 'other', 2, undefined],
        ]);
        expect(result.twoWeeks).toBe(true);
        expect(result.problems).toEqual([
            { kind: 'lesson', index: 2, reason: 'no-time' },
            { kind: 'lesson', index: 3, reason: 'no-day' },
        ]);
    });

    it('says so when there is no JSON at all', () => {
        expect(importSchedule('Monday: maths at 9').problems[0].kind).toBe('not-json');
    });

    it('gives back what it was given', () => {
        const text = exportSchedule(SCHEDULE, true);
        const again = importSchedule(text);
        expect(again.twoWeeks).toBe(true);
        expect(again.schedule.bells).toEqual(SCHEDULE.bells);
        const shape = (s: StudySchedule) =>
            s.lessons
                .map((l) =>
                    [
                        l.day,
                        l.n,
                        l.start,
                        l.end,
                        l.week,
                        l.subject,
                        l.kind,
                        l.room,
                        l.subgroup,
                    ].join('|')
                )
                .sort();
        expect(shape(again.schedule)).toEqual(shape(SCHEDULE));
    });

    it('reads the example the AI prompt shows', () => {
        const result = importSchedule(PROMPT_EXAMPLE);
        expect(result.problems).toEqual([]);
        expect(result.twoWeeks).toBe(true);
        expect(result.schedule.lessons).toHaveLength(4);
        expect(aiPrompt('ru')).toContain(PROMPT_EXAMPLE);
        expect(aiPrompt('en')).toContain('"week": 0 every week');
    });
});

describe('the two-week cycle', () => {
    it('guesses from ISO weeks until told', () => {
        expect(weekOfCycle(TODAY, { twoWeeks: true, anchor: '' })).toBe(1); // week 39: odd
        expect(weekOfCycle('2026-09-28', { twoWeeks: true, anchor: '' })).toBe(2);
        expect(weekOfCycle(TODAY, { twoWeeks: false, anchor: '' })).toBe(1);
    });

    it('follows "this week is the second one"', () => {
        const anchor = anchorFor(TODAY, 2);
        expect(weekOfCycle(TODAY, { twoWeeks: true, anchor })).toBe(2);
        expect(weekOfCycle('2026-09-28', { twoWeeks: true, anchor })).toBe(1);
        // And in the past, too.
        expect(weekOfCycle('2026-09-14', { twoWeeks: true, anchor })).toBe(1);
    });
});

describe('the day', () => {
    it('lists the lessons of this week, for this subgroup', () => {
        const all = lessonsOn(SCHEDULE, TODAY, OPTS).map((l) => l.lesson.subject);
        expect(all).toEqual(['Maths', 'Physics', 'Chemistry']);
        const mine = lessonsOn(SCHEDULE, TODAY, { ...OPTS, subgroup: 2 }).map(
            (l) => l.lesson.subject
        );
        expect(mine).toEqual(['Maths', 'Chemistry']);
        // Next Thursday is the second week: programming instead of the labs.
        const next = lessonsOn(SCHEDULE, '2026-10-01', OPTS).map((l) => l.lesson.subject);
        expect(next).toEqual(['Maths', 'Programming']);
    });

    it('has no lessons outside the term', () => {
        expect(termState(TODAY, { termStart: '2026-10-01', termEnd: '' })).toBe('before');
        expect(lessonsOn(SCHEDULE, TODAY, { ...OPTS, termStart: '2026-10-01' })).toEqual([]);
        expect(termState(TODAY, { termStart: '', termEnd: '' })).toBe('none');
    });

    it('knows what is on now, and what is next', () => {
        const lessons = lessonsOn(SCHEDULE, TODAY, { ...OPTS, subgroup: 1 });
        expect(dayState(lessons, 8 * 60)).toMatchObject({ kind: 'before', minutesUntil: 30 });
        const during = dayState(lessons, 9 * 60);
        expect(during).toMatchObject({ kind: 'during', minutesLeft: 60 });
        expect(during.kind === 'during' && during.next?.lesson.subject).toBe('Physics');
        expect(during.kind === 'during' && during.fraction).toBeCloseTo(1 / 3);
        expect(dayState(lessons, 10 * 60 + 5)).toMatchObject({ kind: 'break', minutesUntil: 5 });
        expect(dayState(lessons, 12 * 60)).toMatchObject({ kind: 'after' });
        expect(dayState([], 12 * 60)).toEqual({ kind: 'free' });
    });

    it('treats two subgroups at once as one slot', () => {
        const lessons = lessonsOn(SCHEDULE, TODAY, OPTS);
        const state = dayState(lessons, 10 * 60 + 30);
        expect(state.kind === 'during' && state.next).toBeUndefined();
        expect(slotsOf(lessons).map((s) => s.map((l) => l.lesson.subject))).toEqual([
            ['Maths'],
            ['Physics', 'Chemistry'],
        ]);
    });

    it('finds the next day with lessons, and the next class of a subject', () => {
        expect(nextStudyDay(SCHEDULE, TODAY, OPTS)?.date).toBe('2026-09-25');
        expect(nextOccurrence(SCHEDULE, 'History', TODAY, OPTS)).toBe('2026-09-28');
        expect(nextOccurrence(SCHEDULE, 'Programming', TODAY, OPTS)).toBe('2026-10-01');
    });

    it('shows the weekend only when something is on it', () => {
        expect(shownDays(SCHEDULE)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('reminders', () => {
    it('come before each lesson, once per slot', () => {
        const from = new Date(2026, 8, 24, 0, 0).getTime();
        const to = new Date(2026, 8, 25, 0, 0).getTime();
        const events = studyEvents(SCHEDULE, OPTS, from, to, 10);
        expect(events.map((e) => new Date(e.at).toTimeString().slice(0, 5))).toEqual([
            '08:20',
            '10:00',
        ]);
        expect(events[0].key).toBe('study:2026-09-24:510');
    });
});

describe('the preview clock', () => {
    afterEach(() => {
        clearStudyPreview();
        vi.useRealTimers();
    });

    it('moves Study to a chosen minute in whole minutes, and back', () => {
        const real = new Date(2026, 8, 24, 9, 17, 42);
        expect(previewOffset('2026-09-25', 10 * 60 + 30, real)).toBe((24 * 60 + 73) * 60_000);

        vi.useFakeTimers();
        vi.setSystemTime(real);
        expect(studyPreviewOffset()).toBeNull();
        setStudyPreview('2026-09-24', 9 * 60 + 17);
        expect(studyPreviewOffset()).toBe(0);
        setStudyPreview('2026-09-24', 8 * 60);
        expect(studyPreviewOffset()).toBe(-77 * 60_000);
        clearStudyPreview();
        expect(studyPreviewOffset()).toBeNull();
    });

    it('offers the moments the day has', () => {
        const at = previewPresets(SCHEDULE, TODAY, OPTS).map((p) => [p.id, p.date, p.minute]);
        expect(at).toEqual([
            ['before', TODAY, 8 * 60],
            ['during', TODAY, 10 * 60 + 30],
            ['break', TODAY, 10 * 60 + 5],
            ['after', TODAY, 12 * 60 + 10],
            ['free', '2026-09-26', 12 * 60],
        ]);
        // Each moment is what it says it is.
        const lessons = lessonsOn(SCHEDULE, TODAY, OPTS);
        for (const [id, , minute] of at.slice(0, 4)) {
            expect(dayState(lessons, minute as number).kind).toBe(id);
        }
    });

    it('leaves out what the day does not have', () => {
        // Monday: one class, so no break; Saturday: nothing but the day off itself.
        const monday = previewPresets(SCHEDULE, '2026-09-28', OPTS).map((p) => p.id);
        expect(monday).toEqual(['before', 'during', 'after', 'free']);
        const saturday = previewPresets(SCHEDULE, '2026-09-26', OPTS);
        expect(saturday).toEqual([{ id: 'free', date: '2026-09-26', minute: 12 * 60 }]);
    });
});

describe('classes on the calendar', () => {
    it('gives each date its classes, one stretch per slot', () => {
        const days = ['2026-09-24', '2026-09-25', '2026-09-26'];
        const map = calendarClasses(SCHEDULE, days, OPTS);
        expect(map.get('2026-09-24')).toEqual([
            { key: '2026-09-24:510', start: 510, end: 600, subject: 'Maths', room: '305' },
            {
                key: '2026-09-24:610',
                start: 610,
                end: 700,
                subject: 'Physics / Chemistry',
                room: '214 / 215',
            },
        ]);
        expect(map.get('2026-09-25')?.map((c) => [c.subject, c.room])).toEqual([['English', '']]);
        // A day without classes is simply not there.
        expect(map.has('2026-09-26')).toBe(false);
    });

    it('follows the subgroup and the term', () => {
        const mine = calendarClasses(SCHEDULE, [TODAY], { ...OPTS, subgroup: 2 });
        expect(mine.get(TODAY)?.map((c) => c.subject)).toEqual(['Maths', 'Chemistry']);
        const holidays = calendarClasses(SCHEDULE, [TODAY], { ...OPTS, termEnd: '2026-09-01' });
        expect(holidays.size).toBe(0);
    });
});
