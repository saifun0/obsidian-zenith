import { describe, it, expect } from 'vitest';
import {
    buildCalendar,
    countEntries,
    layoutSpans,
    agenda,
    type CalendarOptions,
} from '../src/modules/tasks-calendar/services/calendarTasks';
import type { Task } from '../src/store/taskSlice';

const TODAY = '2026-07-28';

function task(partial: Partial<Task> & { id: string }): Task {
    return {
        title: partial.id,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'tasks/inbox.md',
        lineNumber: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ...partial,
    };
}

function opts(over: Partial<CalendarOptions> = {}): CalendarOptions {
    return {
        today: TODAY,
        spanDays: true,
        showDailyNotes: true,
        hideDone: false,
        ...over,
    };
}

/** Kinds placed on a date, in render order. */
const kindsOn = (tasks: Task[], date: string, over?: Partial<CalendarOptions>) =>
    (buildCalendar(tasks, opts(over)).byDate.get(date) ?? []).map((e) => e.kind);

describe('buildCalendar — placement', () => {
    it('puts a due task on its due date', () => {
        expect(kindsOn([task({ id: 'a', dueDate: '2026-07-30' })], '2026-07-30')).toEqual(['due']);
    });

    it('marks a due task with a recurrence rule as recurring', () => {
        const t = task({ id: 'a', dueDate: '2026-07-30', recurrence: 'every week' });
        expect(kindsOn([t], '2026-07-30')).toEqual(['recurrence']);
    });

    it('pins an overdue task to today, not to the day it was due', () => {
        const tasks = [task({ id: 'a', dueDate: '2026-07-20' })];
        expect(kindsOn(tasks, '2026-07-20')).toEqual([]);
        expect(kindsOn(tasks, TODAY)).toEqual(['overdue']);
    });

    it('counts how many days an overdue task is late by', () => {
        const calendar = buildCalendar([task({ id: 'a', dueDate: '2026-07-20' })], opts());
        expect(calendar.byDate.get(TODAY)?.[0].overdueBy).toBe(8);
    });

    it('places a task with only a start date on that day', () => {
        expect(kindsOn([task({ id: 'a', startDate: '2026-07-29' })], '2026-07-29')).toEqual([
            'start',
        ]);
    });

    it('splits a multi-day task into start and due chips when spanning is off', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-01' });
        expect(kindsOn([t], '2026-07-29', { spanDays: false })).toEqual(['start']);
        expect(kindsOn([t], '2026-08-01', { spanDays: false })).toEqual(['due']);
        // Nothing is drawn in between — that's what the span is for.
        expect(kindsOn([t], '2026-07-30', { spanDays: false })).toEqual([]);
    });
});

describe('buildCalendar — spans', () => {
    it('turns a multi-day task into one span and no day entries', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-01' });
        const calendar = buildCalendar([t], opts());
        expect(calendar.spans).toHaveLength(1);
        expect(calendar.spans[0]).toMatchObject({ from: '2026-07-29', to: '2026-08-01' });
        // The bar carries both dates, so neither end also gets a chip.
        for (const d of ['2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01']) {
            expect(calendar.byDate.get(d) ?? []).toEqual([]);
        }
    });

    it('makes no span when spanning is off', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-01' });
        expect(buildCalendar([t], opts({ spanDays: false })).spans).toEqual([]);
    });

    it('makes no span for a single-day task', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-07-29' });
        expect(buildCalendar([t], opts()).spans).toEqual([]);
        expect(kindsOn([t], '2026-07-29')).toEqual(['due', 'start']);
    });

    it('makes no span for a recurring task — the window describes one occurrence', () => {
        const t = task({
            id: 'a',
            startDate: '2026-07-29',
            dueDate: '2026-08-01',
            recurrence: 'every week',
        });
        expect(buildCalendar([t], opts()).spans).toEqual([]);
        expect(kindsOn([t], '2026-08-01')).toEqual(['recurrence']);
    });

    it('makes no span once the due date is in the past — that is overdue, not in flight', () => {
        const t = task({ id: 'a', startDate: '2026-07-01', dueDate: '2026-07-10' });
        expect(buildCalendar([t], opts()).spans).toEqual([]);
        expect(kindsOn([t], TODAY)).toEqual(['overdue']);
    });

    it('makes no span for a finished task', () => {
        const t = task({
            id: 'a',
            status: 'done',
            completed: true,
            startDate: '2026-07-29',
            dueDate: '2026-08-01',
        });
        expect(buildCalendar([t], opts()).spans).toEqual([]);
    });

    it('places a finished task on its completion date', () => {
        const t = task({
            id: 'a',
            status: 'done',
            completed: true,
            dueDate: '2026-07-25',
            doneDate: '2026-07-27',
        });
        expect(kindsOn([t], '2026-07-27')).toEqual(['done']);
        expect(kindsOn([t], '2026-07-25')).toEqual([]);
    });

    it('falls back to the due date for a task finished without a ✅ date', () => {
        const t = task({ id: 'a', status: 'done', completed: true, dueDate: '2026-07-25' });
        expect(kindsOn([t], '2026-07-25')).toEqual(['done']);
    });

    it('never treats a finished task as overdue', () => {
        const t = task({ id: 'a', status: 'done', completed: true, dueDate: '2026-07-01' });
        expect(kindsOn([t], TODAY)).toEqual([]);
    });

    it('separates cancelled from done', () => {
        const t = task({ id: 'a', status: 'cancelled', dueDate: '2026-07-27' });
        expect(kindsOn([t], '2026-07-27')).toEqual(['cancelled']);
    });

    it('hides done and cancelled entries when asked', () => {
        const tasks = [
            task({ id: 'a', status: 'done', completed: true, doneDate: '2026-07-27' }),
            task({ id: 'b', status: 'cancelled', dueDate: '2026-07-27' }),
            task({ id: 'c', dueDate: '2026-07-27' }),
        ];
        // 'c' is overdue relative to today, so 2026-07-27 holds only the two closed ones.
        expect(kindsOn(tasks, '2026-07-27')).toEqual(['done', 'cancelled']);
        expect(kindsOn(tasks, '2026-07-27', { hideDone: true })).toEqual([]);
    });
});

describe('buildCalendar — daily notes', () => {
    const dailyNoteDate = (path: string) =>
        /(\d{4}-\d{2}-\d{2})\.md$/.exec(path)?.[1] ?? null;

    it('places an undated task on the day of the note it lives in', () => {
        const t = task({ id: 'a', filePath: 'journal/2026-07-29.md' });
        expect(kindsOn([t], '2026-07-29', { dailyNoteDate })).toEqual(['dailyNote']);
    });

    it('leaves a dated task where its own dates put it', () => {
        const t = task({ id: 'a', filePath: 'journal/2026-07-29.md', dueDate: '2026-07-31' });
        expect(kindsOn([t], '2026-07-29', { dailyNoteDate })).toEqual([]);
        expect(kindsOn([t], '2026-07-31', { dailyNoteDate })).toEqual(['due']);
    });

    it('places nothing without a matcher — the journal module is off', () => {
        const t = task({ id: 'a', filePath: 'journal/2026-07-29.md' });
        expect(kindsOn([t], '2026-07-29')).toEqual([]);
    });

    it('respects the daily-notes toggle', () => {
        const t = task({ id: 'a', filePath: 'journal/2026-07-29.md' });
        expect(kindsOn([t], '2026-07-29', { dailyNoteDate, showDailyNotes: false })).toEqual([]);
    });
});

describe('buildCalendar — ordering within a day', () => {
    it('sorts by kind first, then priority, then title', () => {
        const tasks = [
            task({ id: 'z', title: 'Zebra', dueDate: '2026-07-30' }),
            task({ id: 'a', title: 'Apple', dueDate: '2026-07-30' }),
            task({ id: 'u', title: 'Urgent', dueDate: '2026-07-30', priority: 'urgent' }),
            task({ id: 's', title: 'Starts', startDate: '2026-07-30' }),
        ];
        const entries = buildCalendar(tasks, opts()).byDate.get('2026-07-30') ?? [];
        expect(entries.map((e) => e.task.title)).toEqual(['Urgent', 'Apple', 'Zebra', 'Starts']);
    });

    it('puts the clock before priority — a day reads in the order it happens', () => {
        const tasks = [
            task({ id: 'b', title: 'Late', dueDate: '2026-07-30', dueTime: '17:00', priority: 'urgent' }),
            task({ id: 'a', title: 'Early', dueDate: '2026-07-30', dueTime: '09:00' }),
            task({ id: 'c', title: 'Sometime', dueDate: '2026-07-30', priority: 'urgent' }),
        ];
        const entries = buildCalendar(tasks, opts()).byDate.get('2026-07-30') ?? [];
        expect(entries.map((e) => e.task.title)).toEqual(['Early', 'Late', 'Sometime']);
    });
});

describe('buildCalendar — time of day', () => {
    it('stamps the hour on the entry for the date the ⏰ qualifies', () => {
        const t = task({ id: 'a', dueDate: '2026-07-30', dueTime: '15:45', dueEndTime: '16:30' });
        const [entry] = buildCalendar([t], opts()).byDate.get('2026-07-30') ?? [];
        expect(entry.startMinutes).toBe(945);
        expect(entry.endMinutes).toBe(990);
    });

    it('leaves the same task’s start-date entry all-day', () => {
        // "Starts Monday" doesn't happen at 15:45; only the due date does.
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-07-30', dueTime: '15:45' });
        const [start] = buildCalendar([t], opts({ spanDays: false })).byDate.get('2026-07-29') ?? [];
        expect(start.kind).toBe('start');
        expect(start.startMinutes).toBeUndefined();
    });

    it('does not carry the hour onto an overdue entry', () => {
        // The entry is pinned to today; 15:45 belonged to a day that has gone.
        const t = task({ id: 'a', dueDate: '2026-07-20', dueTime: '15:45' });
        const [entry] = buildCalendar([t], opts()).byDate.get(TODAY) ?? [];
        expect(entry.kind).toBe('overdue');
        expect(entry.startMinutes).toBeUndefined();
    });

    it('falls back to the scheduled day when there is no due date', () => {
        const t = task({ id: 'a', scheduledDate: '2026-07-30', dueTime: '11:00' });
        const [entry] = buildCalendar([t], opts()).byDate.get('2026-07-30') ?? [];
        expect(entry.kind).toBe('scheduled');
        expect(entry.startMinutes).toBe(660);
    });

    it('gives a multi-day task both its bar and the hour it is due at', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-02', dueTime: '15:45' });
        const calendar = buildCalendar([t], opts());
        expect(calendar.spans).toHaveLength(1);
        expect(calendar.spans[0].timedEnd).toBe(true);

        const [entry] = calendar.byDate.get('2026-08-02') ?? [];
        expect(entry.kind).toBe('due');
        expect(entry.startMinutes).toBe(945);
        // …and still no chip at the other end — that is what the bar is for.
        expect(calendar.byDate.get('2026-07-29')).toBeUndefined();
    });

    it('counts a timed bar once, not twice', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-07-30', dueTime: '15:45' });
        const counts = countEntries(
            buildCalendar([t], opts()),
            ['2026-07-29', '2026-07-30']
        );
        expect(counts.byKind.due).toBe(1);
        expect(counts.remaining).toBe(1);
    });

    it('leaves a bar with no hour exactly as it was', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-02' });
        const calendar = buildCalendar([t], opts());
        expect(calendar.spans[0].timedEnd).toBe(false);
        expect(calendar.byDate.get('2026-08-02')).toBeUndefined();
    });

    it('times a finished task only when it was closed on the day it was due', () => {
        const onTime = task({
            id: 'a',
            status: 'done',
            completed: true,
            dueDate: '2026-07-27',
            doneDate: '2026-07-27',
            dueTime: '09:00',
        });
        const late = task({
            id: 'b',
            status: 'done',
            completed: true,
            dueDate: '2026-07-27',
            doneDate: '2026-07-29',
            dueTime: '09:00',
        });
        const calendar = buildCalendar([onTime, late], opts());
        expect(calendar.byDate.get('2026-07-27')?.[0].startMinutes).toBe(540);
        expect(calendar.byDate.get('2026-07-29')?.[0].startMinutes).toBeUndefined();
    });
});

describe('countEntries', () => {
    const range = ['2026-07-27', TODAY, '2026-07-29', '2026-07-30'];

    it('tallies each kind over the range', () => {
        const tasks = [
            task({ id: 'a', dueDate: '2026-07-30' }),
            task({ id: 'b', dueDate: '2026-07-10' }), // overdue → today
            task({ id: 'c', status: 'done', completed: true, doneDate: '2026-07-27' }),
        ];
        const counts = countEntries(buildCalendar(tasks, opts()), range);
        expect(counts.byKind.due).toBe(1);
        expect(counts.byKind.overdue).toBe(1);
        expect(counts.byKind.done).toBe(1);
        expect(counts.remaining).toBe(2);
        expect(counts.percentDone).toBe(33);
    });

    it('reads an empty range as complete rather than as zero progress', () => {
        const counts = countEntries(buildCalendar([], opts()), range);
        expect(counts.percentDone).toBe(100);
        expect(counts.remaining).toBe(0);
    });

    it('ignores start and scheduled dates — they are the same work seen twice', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', scheduledDate: '2026-07-30' });
        const counts = countEntries(buildCalendar([t], opts()), range);
        expect(counts.byKind.start).toBe(1);
        expect(counts.byKind.scheduled).toBe(1);
        expect(counts.remaining).toBe(0);
        expect(counts.percentDone).toBe(100);
    });

    it('counts a span as in flight, and as work due on the day it lands', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-07-30' });
        const counts = countEntries(buildCalendar([t], opts()), range);
        expect(counts.byKind.process).toBe(1);
        expect(counts.remaining).toBe(1);
        expect(counts.percentDone).toBe(0);
    });

    it('counts a span that only passes through the range, without calling it due', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-20' });
        const counts = countEntries(buildCalendar([t], opts()), range);
        expect(counts.byKind.process).toBe(1);
        expect(counts.remaining).toBe(0);
    });
});

describe('layoutSpans', () => {
    const week = ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02'];
    const span = (id: string, from: string, to: string) => ({
        key: id,
        task: task({ id, title: id }),
        from,
        to,
    });

    it('maps a span onto the columns it covers', () => {
        const { segments, lanes } = layoutSpans([span('a', '2026-07-28', '2026-07-30')], week);
        expect(lanes).toBe(1);
        expect(segments[0]).toMatchObject({ from: 1, to: 3, clippedStart: false, clippedEnd: false, lane: 0 });
    });

    it('clips a span that runs past either end of the row', () => {
        const { segments } = layoutSpans([span('a', '2026-07-20', '2026-08-10')], week);
        expect(segments[0]).toMatchObject({ from: 0, to: 6, clippedStart: true, clippedEnd: true });
    });

    it('drops spans that miss the row entirely', () => {
        const { segments, lanes } = layoutSpans([span('a', '2026-08-05', '2026-08-09')], week);
        expect(segments).toEqual([]);
        expect(lanes).toBe(0);
    });

    it('reuses a lane once the previous bar in it has ended', () => {
        const { segments, lanes } = layoutSpans(
            [span('a', '2026-07-27', '2026-07-28'), span('b', '2026-07-30', '2026-07-31')],
            week
        );
        expect(lanes).toBe(1);
        expect(segments.map((s) => s.lane)).toEqual([0, 0]);
    });

    it('stacks bars that overlap', () => {
        const { segments, lanes } = layoutSpans(
            [span('a', '2026-07-27', '2026-07-31'), span('b', '2026-07-29', '2026-08-02')],
            week
        );
        expect(lanes).toBe(2);
        expect(segments.map((s) => s.lane)).toEqual([0, 1]);
    });

    it('puts the longer run in the upper lane when two start together', () => {
        const { segments } = layoutSpans(
            [span('short', '2026-07-27', '2026-07-28'), span('long', '2026-07-27', '2026-08-02')],
            week
        );
        expect(segments.map((s) => s.span.key)).toEqual(['long', 'short']);
        expect(segments.map((s) => s.lane)).toEqual([0, 1]);
    });
});

describe('agenda', () => {
    const days = ['2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01'];

    it('keeps calendar order and drops empty days', () => {
        const tasks = [
            task({ id: 'a', dueDate: '2026-07-30' }),
            task({ id: 'b', dueDate: '2026-08-01' }),
        ];
        const out = agenda(buildCalendar(tasks, opts()), days);
        expect(out.map((d) => d.date)).toEqual(['2026-07-30', '2026-08-01']);
    });

    it('unfolds a span into the two days that matter — it starts, and it is due', () => {
        const t = task({ id: 'a', startDate: '2026-07-29', dueDate: '2026-08-01' });
        const out = agenda(buildCalendar([t], opts()), days);
        expect(out.map((d) => [d.date, d.entries.map((e) => e.kind)])).toEqual([
            ['2026-07-29', ['start']],
            ['2026-08-01', ['due']],
        ]);
    });
});
