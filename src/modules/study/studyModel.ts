/**
 * The study timetable: bells and lessons.
 *
 * Bells are the day's numbered slots — "2nd pair, 10:10–11:40" — and most
 * lessons simply name one. A lesson may give its own times instead, for the
 * school whose Saturday runs differently or the one-off consultation at 18:00.
 *
 * A lesson belongs to every week, or to the first or second of a two-week
 * cycle — the numerator/denominator weeks of a Russian university. And to the
 * whole group, or to one subgroup.
 *
 * Kept in settings rather than in a note: it is the same timetable on every
 * device, read far more often than written, and written by forms and a paste
 * box rather than by hand. The paste box reads and writes a plain JSON form of
 * it, so it can always be taken out, edited anywhere and put back.
 */

export const LESSON_KINDS = [
    'lecture',
    'practice',
    'lab',
    'seminar',
    'exam',
    'consultation',
    'other',
] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/** 0 — every week; 1, 2 — the first or second week of a two-week cycle. */
export type WeekTag = 0 | 1 | 2;

export interface StudyBell {
    /** The slot's number, 1-based. */
    n: number;
    /** `HH:MM`. */
    start: string;
    end: string;
}

export interface StudyLesson {
    /** Stable within the timetable, for editing. */
    id: string;
    /** 1 Monday … 7 Sunday. */
    day: number;
    /** The bell it takes, when it takes one. */
    n?: number;
    /** Its own times, overriding the bell's. */
    start?: string;
    end?: string;
    week: WeekTag;
    subject: string;
    kind: LessonKind;
    room?: string;
    teacher?: string;
    /** 0 or absent: the whole group. */
    subgroup?: number;
    note?: string;
}

export interface StudySchedule {
    bells: StudyBell[];
    lessons: StudyLesson[];
}

export const EMPTY_SCHEDULE: StudySchedule = { bells: [], lessons: [] };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `9:5`-proof `HH:MM`, or undefined. */
export function cleanTime(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    const m = TIME.exec(raw.trim().replace(/[.,]/, ':'));
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

export function minutesOf(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export function timeOf(minutes: number): string {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

let counter = 0;
/** A short id, unique enough within one timetable. */
export function newLessonId(): string {
    counter = (counter + 1) % 1_000_000;
    return `l${Date.now().toString(36)}${counter.toString(36)}`;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Whatever `data.json` holds, as a timetable Zenith can draw: anything
 * malformed is dropped rather than drawn wrong. The paste box is more
 * forgiving — see `studyImport` — this only has to survive its own output
 * and a hand edit.
 */
export function normalizeSchedule(raw: unknown): StudySchedule {
    if (!raw || typeof raw !== 'object') return { bells: [], lessons: [] };
    const src = raw as { bells?: unknown; lessons?: unknown };

    const bells: StudyBell[] = [];
    for (const b of Array.isArray(src.bells) ? src.bells : []) {
        const e = (b ?? {}) as Record<string, unknown>;
        const n = Number(e.n);
        const start = cleanTime(e.start);
        const end = cleanTime(e.end);
        if (!Number.isInteger(n) || n < 1 || !start || !end) continue;
        if (bells.some((x) => x.n === n)) continue;
        bells.push({ n, start, end });
    }
    bells.sort((a, b) => a.n - b.n);

    const lessons: StudyLesson[] = [];
    const ids = new Set<string>();
    for (const l of Array.isArray(src.lessons) ? src.lessons : []) {
        const e = (l ?? {}) as Record<string, unknown>;
        const day = Number(e.day);
        const subject = text(e.subject);
        if (!Number.isInteger(day) || day < 1 || day > 7 || !subject) continue;
        const n = Number(e.n);
        const week = Number(e.week);
        const subgroup = Number(e.subgroup);
        let id = text(e.id) ?? newLessonId();
        while (ids.has(id)) id = newLessonId();
        ids.add(id);
        lessons.push({
            id,
            day,
            n: Number.isInteger(n) && n >= 1 ? n : undefined,
            start: cleanTime(e.start),
            end: cleanTime(e.end),
            week: week === 1 || week === 2 ? week : 0,
            subject,
            kind: (LESSON_KINDS as readonly string[]).includes(String(e.kind))
                ? (e.kind as LessonKind)
                : 'other',
            room: text(e.room),
            teacher: text(e.teacher),
            subgroup: Number.isInteger(subgroup) && subgroup > 0 ? subgroup : undefined,
            note: text(e.note),
        });
    }
    return { bells, lessons };
}

/** A lesson's times, from its own fields or its bell. Null when it has neither. */
export function lessonTimes(
    lesson: StudyLesson,
    bells: readonly StudyBell[]
): { start: number; end: number } | null {
    const bell = lesson.n !== undefined ? bells.find((b) => b.n === lesson.n) : undefined;
    const start = lesson.start ?? bell?.start;
    const end = lesson.end ?? bell?.end;
    if (!start || !end) return null;
    const s = minutesOf(start);
    const e = minutesOf(end);
    return e > s ? { start: s, end: e } : null;
}

/** The bell a lesson sits in on the grid: its own, or the one its start falls in. */
export function slotOf(lesson: StudyLesson, bells: readonly StudyBell[]): number | undefined {
    if (lesson.n !== undefined && bells.some((b) => b.n === lesson.n)) return lesson.n;
    const times = lessonTimes(lesson, bells);
    if (!times) return undefined;
    return bells.find((b) => times.start >= minutesOf(b.start) && times.start < minutesOf(b.end))
        ?.n;
}

/** Lessons that would be in the same room of the week at the same time. */
export function conflicts(schedule: StudySchedule): Array<[StudyLesson, StudyLesson]> {
    const out: Array<[StudyLesson, StudyLesson]> = [];
    const { lessons, bells } = schedule;
    for (let i = 0; i < lessons.length; i++) {
        for (let j = i + 1; j < lessons.length; j++) {
            const a = lessons[i];
            const b = lessons[j];
            if (a.day !== b.day) continue;
            if (a.week && b.week && a.week !== b.week) continue;
            if (a.subgroup && b.subgroup && a.subgroup !== b.subgroup) continue;
            const x = lessonTimes(a, bells);
            const y = lessonTimes(b, bells);
            if (x && y && x.start < y.end && y.start < x.end) out.push([a, b]);
        }
    }
    return out;
}

/**
 * Bells laid out evenly: `count` slots of `length` minutes from `first`, with
 * `gap` between them and a longer break after slot `longAfter` — how most
 * timetables are built, typed once instead of six times.
 */
export function generateBells(opts: {
    first: string;
    length: number;
    gap: number;
    count: number;
    longAfter?: number;
    longGap?: number;
}): StudyBell[] {
    const out: StudyBell[] = [];
    let at = minutesOf(opts.first);
    for (let n = 1; n <= opts.count; n++) {
        const end = at + opts.length;
        if (end >= 24 * 60) break;
        out.push({ n, start: timeOf(at), end: timeOf(end) });
        at = end + (opts.longAfter === n && opts.longGap ? opts.longGap : opts.gap);
    }
    return out;
}
