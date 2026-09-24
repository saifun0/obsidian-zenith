import {
    LESSON_KINDS,
    cleanTime,
    newLessonId,
    type LessonKind,
    type StudyBell,
    type StudyLesson,
    type StudySchedule,
    type WeekTag,
} from './studyModel';

/**
 * Reading a timetable pasted into the import box.
 *
 * What arrives here was usually written by a language model from a photo, so
 * the reader is forgiving about everything a model tends to vary — a
 * ```json fence around the answer, a sentence before it, `"day": "Tuesday"`
 * instead of 2, `"week": "числитель"`, `"time": "08:30-10:00"`, a trailing
 * comma — and strict about what it cannot guess: a lesson with no day or no
 * subject is reported, not placed somewhere plausible.
 */

export type ImportProblem =
    | { kind: 'not-json'; detail: string }
    | { kind: 'no-lessons' }
    | { kind: 'lesson'; index: number; reason: 'no-day' | 'no-subject' | 'no-time' | 'bad-week' };

export interface ImportResult {
    schedule: StudySchedule;
    /** Whether the timetable has a two-week cycle — said outright, or implied by its lessons. */
    twoWeeks: boolean;
    problems: ImportProblem[];
}

const DAY_WORDS: Array<[number, string[]]> = [
    [1, ['mon', 'monday', 'пн', 'пон', 'понедельник']],
    [2, ['tue', 'tues', 'tuesday', 'вт', 'вторник']],
    [3, ['wed', 'wednesday', 'ср', 'среда']],
    [4, ['thu', 'thur', 'thurs', 'thursday', 'чт', 'четверг']],
    [5, ['fri', 'friday', 'пт', 'пятница']],
    [6, ['sat', 'saturday', 'сб', 'суббота']],
    [7, ['sun', 'sunday', 'вс', 'воскресенье']],
];

export function readDay(raw: unknown): number | undefined {
    if (typeof raw === 'number')
        return Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : undefined;
    if (typeof raw !== 'string') return undefined;
    const t = raw.trim().toLowerCase().replace(/\.$/, '');
    if (/^[1-7]$/.test(t)) return Number(t);
    return DAY_WORDS.find(([, words]) => words.includes(t))?.[0];
}

/**
 * Which week: 0 every, 1 first, 2 second — or undefined for a value that is
 * not a week at all. "Numerator" and "odd" are the first week; that is the
 * convention the prompt asks for, and the user can flip which is current.
 */
export function readWeek(raw: unknown): WeekTag | undefined {
    if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') return 0;
    if (raw === 1 || raw === 2) return raw;
    if (typeof raw !== 'string') return undefined;
    const t = raw.trim().toLowerCase();
    if (
        [
            '1',
            'first',
            'odd',
            'a',
            'top',
            'upper',
            'числитель',
            'нечётная',
            'нечетная',
            'верхняя',
            'первая',
            '1-я',
        ].includes(t)
    )
        return 1;
    if (
        [
            '2',
            'second',
            'even',
            'b',
            'bottom',
            'lower',
            'знаменатель',
            'чётная',
            'четная',
            'нижняя',
            'вторая',
            '2-я',
        ].includes(t)
    )
        return 2;
    if (['all', 'every', 'both', 'weekly', 'каждая', 'все', 'обе', 'еженедельно'].includes(t))
        return 0;
    return undefined;
}

const KIND_WORDS: Record<LessonKind, string[]> = {
    lecture: ['lecture', 'lec', 'лекция', 'лек', 'лк'],
    practice: [
        'practice',
        'practical',
        'pr',
        'практика',
        'практ',
        'пр',
        'практическое занятие',
        'пз',
    ],
    lab: ['lab', 'laboratory', 'лабораторная', 'лаб', 'лр', 'лабораторная работа'],
    seminar: ['seminar', 'сем', 'семинар'],
    exam: ['exam', 'test', 'экзамен', 'зачёт', 'зачет', 'экз', 'контрольная'],
    consultation: ['consultation', 'конс', 'консультация'],
    other: ['other', 'другое'],
};

export function readKind(raw: unknown): LessonKind {
    if (typeof raw !== 'string') return 'other';
    const t = raw.trim().toLowerCase().replace(/\.$/, '');
    if ((LESSON_KINDS as readonly string[]).includes(t)) return t as LessonKind;
    return (
        (Object.keys(KIND_WORDS) as LessonKind[]).find((k) => KIND_WORDS[k].includes(t)) ?? 'other'
    );
}

/** `08:30-10:00`, `8.30–10.00`, `08:30 - 10:00`. */
export function readRange(raw: unknown): { start: string; end: string } | undefined {
    if (typeof raw !== 'string') return undefined;
    const m = /^\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s*$/.exec(raw);
    if (!m) return undefined;
    const start = cleanTime(m[1]);
    const end = cleanTime(m[2]);
    return start && end ? { start, end } : undefined;
}

/** The JSON inside whatever was pasted: a fence, a sentence around it, a trailing comma. */
export function extractJson(pasted: string): unknown {
    let body = pasted.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
    if (fence) body = fence[1].trim();
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('no JSON object found');
    body = body.slice(first, last + 1);
    try {
        return JSON.parse(body);
    } catch {
        // The two slips models make most: a comma before a closing bracket,
        // and typographic quotes.
        return JSON.parse(body.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
    }
}

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    return undefined;
};

const str = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;

export function importSchedule(pasted: string): ImportResult {
    let raw: unknown;
    try {
        raw = extractJson(pasted);
    } catch (err) {
        return {
            schedule: { bells: [], lessons: [] },
            twoWeeks: false,
            problems: [
                { kind: 'not-json', detail: err instanceof Error ? err.message : String(err) },
            ],
        };
    }
    const src = (raw ?? {}) as Record<string, unknown>;
    const problems: ImportProblem[] = [];

    const bells: StudyBell[] = [];
    const rawBells = pick(src, 'bells', 'calls', 'times', 'звонки');
    for (const [i, b] of (Array.isArray(rawBells) ? rawBells : []).entries()) {
        const e = (b ?? {}) as Record<string, unknown>;
        const range = readRange(pick(e, 'time', 'range'));
        const start = cleanTime(pick(e, 'start', 'from')) ?? range?.start;
        const end = cleanTime(pick(e, 'end', 'to')) ?? range?.end;
        const n = Number(pick(e, 'n', 'number', 'pair', 'no') ?? i + 1);
        if (!start || !end || !Number.isInteger(n) || n < 1) continue;
        if (!bells.some((x) => x.n === n)) bells.push({ n, start, end });
    }
    bells.sort((a, b) => a.n - b.n);

    const lessons: StudyLesson[] = [];
    const rawLessons = pick(src, 'lessons', 'classes', 'pairs', 'пары', 'schedule');
    const list = Array.isArray(rawLessons) ? rawLessons : [];
    for (const [index, l] of list.entries()) {
        const e = (l ?? {}) as Record<string, unknown>;
        const day = readDay(pick(e, 'day', 'weekday', 'день'));
        const subject = str(pick(e, 'subject', 'title', 'name', 'discipline', 'предмет'));
        const week = readWeek(pick(e, 'week', 'weeks', 'parity', 'неделя'));
        if (!day) {
            problems.push({ kind: 'lesson', index, reason: 'no-day' });
            continue;
        }
        if (!subject) {
            problems.push({ kind: 'lesson', index, reason: 'no-subject' });
            continue;
        }
        if (week === undefined) {
            problems.push({ kind: 'lesson', index, reason: 'bad-week' });
            continue;
        }
        const range = readRange(pick(e, 'time', 'range'));
        const nRaw = Number(pick(e, 'n', 'number', 'pair', 'no', 'пара'));
        const n = Number.isInteger(nRaw) && nRaw >= 1 ? nRaw : undefined;
        const start = cleanTime(pick(e, 'start', 'from')) ?? range?.start;
        const end = cleanTime(pick(e, 'end', 'to')) ?? range?.end;
        const hasBell = n !== undefined && bells.some((b) => b.n === n);
        if (!hasBell && !(start && end)) {
            problems.push({ kind: 'lesson', index, reason: 'no-time' });
            continue;
        }
        const subgroup = Number(pick(e, 'subgroup', 'group', 'подгруппа'));
        lessons.push({
            id: newLessonId(),
            day,
            n,
            // Only kept when they differ from the bell: a lesson that repeats
            // its bell's times would stop following the bell when it changes.
            start: hasBell && start === bells.find((b) => b.n === n)?.start ? undefined : start,
            end: hasBell && end === bells.find((b) => b.n === n)?.end ? undefined : end,
            week,
            subject,
            kind: readKind(pick(e, 'kind', 'type', 'тип')),
            room: str(pick(e, 'room', 'auditorium', 'place', 'location', 'аудитория')),
            teacher: str(pick(e, 'teacher', 'lecturer', 'tutor', 'преподаватель')),
            subgroup: Number.isInteger(subgroup) && subgroup > 0 ? subgroup : undefined,
            note: str(pick(e, 'note', 'comment', 'примечание')),
        });
    }
    if (!lessons.length && !problems.length) problems.push({ kind: 'no-lessons' });

    const weeks = Number(pick(src, 'weeks', 'cycle'));
    return {
        schedule: { bells, lessons },
        twoWeeks: weeks === 2 || lessons.some((l) => l.week !== 0),
        problems,
    };
}

/** The timetable in the paste box's own format — what "copy current" gives. */
export function exportSchedule(schedule: StudySchedule, twoWeeks: boolean): string {
    const out = {
        weeks: twoWeeks ? 2 : 1,
        bells: schedule.bells.map((b) => ({ n: b.n, start: b.start, end: b.end })),
        lessons: [...schedule.lessons]
            .sort((a, b) => a.day - b.day || (a.n ?? 99) - (b.n ?? 99) || a.week - b.week)
            .map((l) => {
                const o: Record<string, unknown> = { day: l.day };
                if (l.n !== undefined) o.n = l.n;
                if (l.start) o.start = l.start;
                if (l.end) o.end = l.end;
                if (twoWeeks || l.week) o.week = l.week;
                o.subject = l.subject;
                o.kind = l.kind;
                if (l.room) o.room = l.room;
                if (l.teacher) o.teacher = l.teacher;
                if (l.subgroup) o.subgroup = l.subgroup;
                if (l.note) o.note = l.note;
                return o;
            }),
    };
    return JSON.stringify(out, null, 2);
}
