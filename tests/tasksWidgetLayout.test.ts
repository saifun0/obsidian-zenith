import { describe, it, expect } from 'vitest';
import type { Task, SubTask } from '../src/store/taskSlice';
import type { TaskStatus } from '../src/core/constants';
import type { WidgetSize } from '../src/modules/dashboard/grid/gridTypes';
import {
    METRICS,
    NOMINAL_H,
    dayProgress,
    planWidget,
    splitTasks,
    type Line,
    type Plan,
} from '../src/modules/tasks/services/widgetLayout';

/**
 * The tasks widget's fitting maths.
 *
 * The card is not allowed to scroll, so every one of these is really the same
 * question asked in different shapes: does what the plan says to draw actually
 * fit in the height it was given, and is the "+N" it reports the truth?
 */

const TODAY = '2026-08-10';

let seq = 0;

function sub(title: string, status: TaskStatus = 'todo'): SubTask {
    return { title, status, completed: status === 'done', lineNumber: ++seq, subtasks: [] };
}

function task(title: string, over: Partial<Task> = {}): Task {
    return {
        id: `t${++seq}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'Tasks.md',
        lineNumber: seq,
        createdAt: TODAY,
        ...over,
    };
}

/** The screenshot the redesign started from. */
const screenshot = (): Task[] => [
    task('Улучшение ПК 3.0', {
        dueDate: '2026-08-15',
        subtasks: [sub('Avito - rtx 3080 ti'), sub('DNS - Блок питания Cougar GEC 850'), sub('Кулер'), sub('Корпус')],
    }),
    task('Zenith 0.1.0', {
        status: 'in-progress',
        priority: 'high',
        dueDate: '2026-09-01',
        subtasks: [sub('Перенести все функции со старого плагина', 'in-progress'), sub('Публикация на GitHub')],
    }),
    task('Подписка Claude Code', { status: 'in-progress', dueDate: '2026-09-08' }),
];

/** Two overdue and one due today. */
const burning = (): Task[] => [
    task('Улучшение ПК 3.0', { dueDate: '2026-08-07', subtasks: [sub('Avito - rtx 3080 ti'), sub('Корпус')] }),
    task('Подписка Claude Code', { status: 'in-progress', priority: 'urgent', dueDate: '2026-08-09' }),
    task('Zenith 0.1.0', { status: 'in-progress', priority: 'high', dueDate: TODAY }),
    task('Резервная копия хранилища', { dueDate: '2026-08-20' }),
];

const plan = (tasks: Task[], size: WidgetSize, expanded: string | null = null): Plan =>
    planWidget({
        split: splitTasks(tasks, TODAY),
        size,
        available: NOMINAL_H[size],
        expanded,
    });

/** Height a run of rows really occupies once drawn at `gap` spacing. */
const heightOf = (lines: Line[], gap: number): number =>
    lines.length === 0 ? 0 : lines.reduce((n, l) => n + l.height, 0) + gap * (lines.length - 1);

const titlesOf = (lines: Line[]): string[] =>
    lines.filter((l) => l.kind === 'task').map((l) => (l.kind === 'task' ? l.task.title : ''));

describe('splitting the day', () => {
    it('separates burning, running and waiting', () => {
        const s = splitTasks(screenshot(), TODAY);
        expect(s.active).toHaveLength(3);
        expect(s.burning).toHaveLength(0);
        expect(s.doing.map((t) => t.title)).toEqual(['Zenith 0.1.0', 'Подписка Claude Code']);
        expect(s.next.map((t) => t.title)).toEqual(['Улучшение ПК 3.0']);
        expect(s.overdue).toBe(0);
        expect(s.inProgress).toBe(2);
    });

    it('counts overdue apart from due-today', () => {
        const s = splitTasks(burning(), TODAY);
        expect(s.burning).toHaveLength(3);
        expect(s.overdue).toBe(2);
        expect(s.dueToday).toBe(1);
        // A burning task that is also started still counts as in progress.
        expect(s.inProgress).toBe(2);
    });

    it('leaves finished and cancelled tasks out entirely', () => {
        const tasks = [
            task('Готово', { status: 'done', dueDate: '2026-08-01' }),
            task('Отменено', { status: 'cancelled', dueDate: '2026-08-01' }),
        ];
        const s = splitTasks(tasks, TODAY);
        expect(s.active).toHaveLength(0);
        expect(s.overdue).toBe(0);
    });

    it('counts what the day produced, finished and dropped apart', () => {
        const tasks = [
            task('Закрыто сегодня', { status: 'done', doneDate: TODAY }),
            task('Закрыто вчера', { status: 'done', doneDate: '2026-08-09' }),
            // Marked done by hand, with no ✅ date to count it by.
            task('Закрыто без даты', { status: 'done' }),
            task('Отменено сегодня', { status: 'cancelled', cancelledDate: TODAY }),
            task('Отменено вчера', { status: 'cancelled', cancelledDate: '2026-08-09' }),
            task('В работе', { status: 'in-progress' }),
        ];
        const s = splitTasks(tasks, TODAY);
        expect(s.doneToday).toBe(1);
        expect(s.cancelledToday).toBe(1);
    });

    it('never counts a cancelled task as finished, or the reverse', () => {
        const tasks = [
            // A stale ✅ left on a task that was later cancelled, and vice versa:
            // the status decides which tally it belongs to, not the stamp.
            task('Передумал', { status: 'cancelled', doneDate: TODAY, cancelledDate: TODAY }),
            task('Доделал', { status: 'done', doneDate: TODAY, cancelledDate: TODAY }),
        ];
        const s = splitTasks(tasks, TODAY);
        expect(s.doneToday).toBe(1);
        expect(s.cancelledToday).toBe(1);
    });

    it('reports nothing on a day with no completions', () => {
        const s = splitTasks(screenshot(), TODAY);
        expect(s.doneToday).toBe(0);
        expect(s.cancelledToday).toBe(0);
    });

    it('sorts what is waiting by due date, undated last', () => {
        const tasks = [
            task('без срока'),
            task('позже', { dueDate: '2026-09-01' }),
            task('скоро', { dueDate: '2026-08-12' }),
        ];
        expect(splitTasks(tasks, TODAY).next.map((t) => t.title)).toEqual(['скоро', 'позже', 'без срока']);
    });
});

const groupLines = (p: Plan): Line[] => (p.groups ?? []).flatMap((g) => g.lines);

/** What the groups of a plan take, drawn: rows, gaps, labels and the gaps between groups. */
const groupsHeight = (p: Plan, size: 'md' | 'lg'): number => {
    const m = METRICS[size];
    return (p.groups ?? []).reduce(
        (n, g, i) => n + heightOf(g.lines, p.gap) + m.label + (i > 0 ? m.area : 0),
        0
    );
};

describe('sm — the three most urgent', () => {
    it('fits inside the height it was given', () => {
        const p = plan(screenshot(), 'sm');
        const m = METRICS.sm;
        expect(p.groups).toBeNull();
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(NOMINAL_H.sm - m.head - 2 * m.area);
    });

    it('orders by urgency, not by file', () => {
        const p = plan(burning(), 'sm');
        // The three burning ones, and "Резервная копия" — merely next — left out.
        expect(titlesOf(p.lines)).toEqual(['Улучшение ПК 3.0', 'Подписка Claude Code', 'Zenith 0.1.0']);
        expect(p.hidden).toBe(1);
    });

    it('never shows more than three, however tall the card', () => {
        const many = Array.from({ length: 9 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const split = splitTasks(many, TODAY);
        const p = planWidget({ split, size: 'sm', available: 900, expanded: null });
        expect(titlesOf(p.lines)).toHaveLength(3);
        expect(p.hidden).toBe(6);
    });

    it('still fits once the footer takes a row', () => {
        const many = Array.from({ length: 9 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const p = plan(many, 'sm');
        const m = METRICS.sm;
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(NOMINAL_H.sm - m.head - 2 * m.area - m.foot - m.area);
    });

    it('opens one task’s subtasks in place, and floats it to the top', () => {
        const tasks = screenshot();
        const pc = tasks[0];
        const p = plan(tasks, 'sm', pc.id);
        expect(titlesOf(p.lines)[0]).toBe('Улучшение ПК 3.0');
        // Two previewed, and the two it can't show are named as a link.
        expect(p.lines.filter((l) => l.kind === 'sub')).toHaveLength(2);
        const more = p.lines.find((l) => l.kind === 'more');
        expect(more?.kind === 'more' && more.count).toBe(2);
    });

    it('shows no subtasks at all until one is opened', () => {
        const p = plan(screenshot(), 'sm');
        expect(p.lines.some((l) => l.kind === 'sub')).toBe(false);
    });
});

describe('md — labelled groups, up to five', () => {
    it('groups the day and keeps it inside the budget', () => {
        const m = METRICS.md;
        // At its nominal height the card holds the group in progress…
        const p = plan(screenshot(), 'md');
        expect(p.lines).toEqual([]);
        expect(p.groups?.map((g) => g.label)).toEqual(['doing']);
        expect(groupsHeight(p, 'md')).toBeLessThanOrEqual(NOMINAL_H.md - m.head - m.stats - 3 * m.area);
        // …and a taller one what is next as well.
        const split = splitTasks(screenshot(), TODAY);
        const tall = planWidget({ split, size: 'md', available: 300, expanded: null });
        expect(tall.groups?.map((g) => g.label)).toEqual(['doing', 'next']);
        expect(groupsHeight(tall, 'md')).toBeLessThanOrEqual(300 - m.head - m.stats - 3 * m.area);
    });

    it('puts what is burning first', () => {
        const split = splitTasks(burning(), TODAY);
        const p = planWidget({ split, size: 'md', available: 400, expanded: null });
        expect(p.groups?.[0].label).toBe('today');
        expect(titlesOf(p.groups?.[0].lines ?? [])[0]).toBe('Улучшение ПК 3.0');
    });

    it('stops at five tasks, however tall the card', () => {
        const many = Array.from({ length: 12 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const split = splitTasks(many, TODAY);
        const p = planWidget({ split, size: 'md', available: 900, expanded: null });
        expect(titlesOf(groupLines(p))).toHaveLength(5);
        expect(p.hidden).toBe(7);
    });

    it('opens subtasks only for the task asked', () => {
        const tasks = screenshot();
        const split = splitTasks(tasks, TODAY);
        const closed = planWidget({ split, size: 'md', available: 400, expanded: null });
        expect(groupLines(closed).some((l) => l.kind === 'sub')).toBe(false);
        const open = planWidget({ split, size: 'md', available: 400, expanded: tasks[0].id });
        expect(groupLines(open).filter((l) => l.kind === 'sub').length).toBeGreaterThan(0);
    });
});

describe('lg — labelled groups', () => {
    it('groups the day and leaves room for the strip along the bottom', () => {
        const p = plan(screenshot(), 'lg');
        const m = METRICS.lg;
        expect(p.groups?.map((g) => g.label)).toEqual(['doing', 'next']);
        expect(groupsHeight(p, 'lg')).toBeLessThanOrEqual(NOMINAL_H.lg - m.head - m.stats - 3 * m.area);
    });

    it('keeps subtasks folded until one task is opened', () => {
        const p = plan(screenshot(), 'lg');
        expect(groupLines(p).some((l) => l.kind === 'sub')).toBe(false);
    });

    it('names the group by count, not by a sentence', () => {
        const p = plan(burning(), 'lg');
        const today = p.groups?.find((g) => g.label === 'today');
        expect(today?.count).toBe(3);
    });

    it('keeps a long day inside the card and counts what it cut', () => {
        const many = Array.from({ length: 30 }, (_, i) =>
            task(`Задача ${i}`, { dueDate: '2026-08-01', subtasks: [sub('раз'), sub('два'), sub('три')] })
        );
        const p = plan(many, 'lg');
        const m = METRICS.lg;
        const shown = titlesOf(groupLines(p)).length;
        expect(shown + p.hidden).toBe(30);
        expect(groupsHeight(p, 'lg')).toBeLessThanOrEqual(
            NOMINAL_H.lg - m.head - m.stats - 3 * m.area - m.foot - m.area
        );
    });
});

describe('an empty day', () => {
    it('plans nothing when there is nothing active', () => {
        const done = [task('Готово', { status: 'done' })];
        for (const size of ['sm', 'md', 'lg'] as const) {
            const p = plan(done, size);
            expect(p.lines).toEqual([]);
            expect(p.groups).toBeNull();
            expect(p.hidden).toBe(0);
        }
    });

    it('plans nothing for an empty vault', () => {
        expect(plan([], 'lg')).toMatchObject({ lines: [], groups: null, hidden: 0 });
    });
});

describe('the day’s progress along the bottom', () => {
    it('counts what was closed today out of what today asked for', () => {
        const split = splitTasks(
            [
                task('late', { dueDate: '2026-08-05' }),
                task('today', { dueDate: TODAY }),
                task('done', { status: 'done', doneDate: TODAY }),
                task('later', { dueDate: '2026-09-20' }),
            ],
            TODAY
        );
        expect(dayProgress(split)).toEqual({ done: 1, total: 3 });
    });

    it('says nothing on a day that asked for nothing', () => {
        expect(dayProgress(splitTasks([task('later', { dueDate: '2026-09-20' })], TODAY))).toBeNull();
    });
});

describe('a card the user has resized', () => {
    it('shows more in a taller card and less in a shorter one', () => {
        const many = Array.from({ length: 12 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const split = splitTasks(many, TODAY);
        const short = planWidget({ split, size: 'sm', available: 120, expanded: null });
        const tall = planWidget({ split, size: 'sm', available: 400, expanded: null });
        expect(titlesOf(tall.lines).length).toBeGreaterThan(titlesOf(short.lines).length);
        expect(tall.hidden).toBeLessThan(short.hidden);
    });

    it('never plans a row it cannot draw, however small the card', () => {
        const many = Array.from({ length: 12 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const split = splitTasks(many, TODAY);
        const p = planWidget({ split, size: 'sm', available: 60, expanded: null });
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(60);
        expect(titlesOf(p.lines).length + p.hidden).toBe(12);
    });
});

/**
 * The card's own furniture, measured rather than assumed.
 *
 * `METRICS` guesses what the heading and the bottom strip cost, and both depend
 * on the theme's font and on the language of the labels. When the guess was low
 * the difference came out of the strip pinned to the bottom of the card, which
 * was pushed past the edge and clipped — so the plan has to be able to be told
 * what those two really measured.
 */
describe('furniture the card measured for itself', () => {
    const many = () => Array.from({ length: 12 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));

    it('keeps the guess until something has been measured', () => {
        const split = splitTasks(many(), TODAY);
        const guessed = planWidget({ split, size: 'lg', available: 460, expanded: null });
        // Zero is "not measured yet", never "takes no room" — a strip costed at
        // nothing would let the list fill the card and then be drawn over it.
        const unmeasured = planWidget({
            split,
            size: 'lg',
            available: 460,
            expanded: null,
            chrome: { head: 0, stats: 0 },
        });
        expect(titlesOf(unmeasured.groups?.flatMap((g) => g.lines) ?? [])).toEqual(
            titlesOf(guessed.groups?.flatMap((g) => g.lines) ?? [])
        );
    });

    it('gives up a row when the heading turns out taller than budgeted', () => {
        const split = splitTasks(many(), TODAY);
        const budgeted = planWidget({ split, size: 'lg', available: 460, expanded: null });
        const measured = planWidget({
            split,
            size: 'lg',
            available: 460,
            expanded: null,
            chrome: { head: METRICS.lg.head + 40, stats: METRICS.lg.stats + 20 },
        });
        const rows = (p: Plan) => (p.groups ?? []).reduce((n, g) => n + g.lines.length, 0);
        expect(rows(measured)).toBeLessThan(rows(budgeted));
        expect(measured.hidden).toBeGreaterThan(budgeted.hidden);
    });

    it('still accounts for every task it was given', () => {
        const split = splitTasks(many(), TODAY);
        const p = planWidget({
            split,
            size: 'lg',
            available: 460,
            expanded: null,
            chrome: { head: 52, stats: 61 },
        });
        const shown = (p.groups ?? []).flatMap((g) => titlesOf(g.lines)).length;
        expect(shown + p.hidden).toBe(12);
    });
});

describe('a wide card, planned in two columns', () => {
    const next = (n: number): Task[] =>
        Array.from({ length: n }, (_, i) => task(`Later ${i + 1}`, { dueDate: `2026-09-${10 + i}` }));
    const today = (n: number): Task[] =>
        Array.from({ length: n }, (_, i) => task(`Now ${i + 1}`, { dueDate: TODAY }));

    const shownIn = (p: Plan): number =>
        (p.columns ?? []).reduce(
            (n, c) => n + (c.groups ? c.groups.flatMap((g) => g.lines) : c.lines).length,
            0
        );

    it('holds what one column could not, and says what it still leaves out', () => {
        const split = splitTasks([...today(3), ...next(9)], TODAY);
        const one = planWidget({ split, size: 'sm', available: 190, expanded: null });
        const two = planWidget({ split, size: 'sm', available: 190, expanded: null, columns: 2 });
        expect(shownIn(two)).toBeGreaterThan(one.lines.length);
        expect(shownIn(two) + two.hidden).toBe(12);
        expect(two.columns).toHaveLength(2);
    });

    it('never makes a column taller than the room it was planned into', () => {
        for (const available of [190, 260, 330, 460]) {
            for (const size of ['sm', 'md', 'lg'] as const) {
                const split = splitTasks([...today(4), ...next(14)], TODAY);
                const p = planWidget({ split, size, available, expanded: null, columns: 2 });
                const m = METRICS[size];
                for (const col of p.columns ?? []) {
                    const drawn = col.groups
                        ? col.groups.reduce(
                              (n, g, i) =>
                                  n + m.label + (i > 0 ? m.area : 0) + heightOf(g.lines, p.gap) + p.gap,
                              0
                          )
                        : heightOf(col.lines, p.gap);
                    const furniture = size === 'sm' ? m.head + 2 * m.area : m.head + m.stats + 3 * m.area;
                    expect(drawn).toBeLessThanOrEqual(available - furniture);
                }
            }
        }
    });

    it('balances the two, so the card is as short as the tasks allow', () => {
        // Six, not eight: the small composition draws three tasks a column at most.
        const split = splitTasks(next(6), TODAY);
        const p = planWidget({ split, size: 'sm', available: 600, expanded: null, columns: 2 });
        expect(p.hidden).toBe(0);
        expect(p.columns?.map((c) => c.lines.length)).toEqual([3, 3]);

        const four = planWidget({
            split: splitTasks(next(4), TODAY),
            size: 'sm',
            available: 600,
            expanded: null,
            columns: 2,
        });
        expect(four.columns?.map((c) => c.lines.length)).toEqual([2, 2]);
    });

    it('turns the corner at the end of a group where that costs nearly nothing', () => {
        const split = splitTasks([...today(4), ...next(4)], TODAY);
        const p = planWidget({ split, size: 'lg', available: 600, expanded: null, columns: 2 });
        expect(p.columns?.[0].groups?.map((g) => g.label)).toEqual(['today']);
        expect(p.columns?.[1].groups?.map((g) => g.label)).toEqual(['next']);
        expect(p.columns?.[1].groups?.[0].continued).toBeUndefined();
    });

    it('marks a group that runs on into the second column, and counts it whole', () => {
        const split = splitTasks(next(9), TODAY);
        const p = planWidget({ split, size: 'lg', available: 600, expanded: null, columns: 2 });
        const [first, second] = p.columns ?? [];
        expect(first.groups?.[0].continued).toBeUndefined();
        expect(second.groups?.[0].label).toBe('next');
        expect(second.groups?.[0].continued).toBe(true);
        expect(second.groups?.[0].count).toBe(9);
        // Everything is still there in reading order, as one group.
        expect(p.groups).toHaveLength(1);
        expect(p.groups?.[0].lines).toHaveLength(9);
    });

    /** Which column each drawn task is in, by title. */
    const sides = (p: Plan): Map<string, number> => {
        const out = new Map<string, number>();
        (p.columns ?? []).forEach((c, i) => {
            for (const line of c.groups ? c.groups.flatMap((g) => g.lines) : c.lines) {
                if (line.kind === 'task') out.set(line.task.title, i);
            }
        });
        return out;
    };

    it('moves no task to the other column when one is opened', () => {
        for (const size of ['sm', 'md', 'lg'] as const) {
            const tasks = [
                task('A', { dueDate: '2026-09-10' }),
                task('B', { dueDate: '2026-09-11' }),
                task('C', {
                    dueDate: '2026-09-12',
                    subtasks: [sub('one'), sub('two'), sub('three')],
                }),
            ];
            const split = splitTasks(tasks, TODAY);
            const closed = planWidget({ split, size, available: 460, expanded: null, columns: 2 });
            for (const opened of tasks) {
                const open = planWidget({
                    split,
                    size,
                    available: 460,
                    expanded: opened.id,
                    columns: 2,
                });
                for (const [title, side] of sides(open)) {
                    expect(side, `${size}: ${title} with ${opened.title} opened`).toBe(
                        sides(closed).get(title)
                    );
                }
                expect(open.hidden).toBe(0);
            }
        }
    });

    it('puts the longer column first where two turns are as good as each other', () => {
        const split = splitTasks(next(3), TODAY);
        const p = planWidget({ split, size: 'lg', available: 460, expanded: null, columns: 2 });
        expect(p.columns?.map((c) => c.groups?.flatMap((g) => g.lines).length)).toEqual([2, 1]);
    });

    it('lets the foot of the opened task\'s column give way, and nothing else', () => {
        const tasks = [
            task('A', {
                dueDate: '2026-09-10',
                subtasks: [sub('one'), sub('two'), sub('three'), sub('four')],
            }),
            ...next(5),
        ];
        const split = splitTasks(tasks, TODAY);
        const closed = planWidget({ split, size: 'lg', available: 250, expanded: null, columns: 2 });
        const open = planWidget({
            split,
            size: 'lg',
            available: 250,
            expanded: tasks[0].id,
            columns: 2,
        });
        const before = sides(closed);
        const after = sides(open);
        // The opened task is still there, where it was.
        expect(after.get('A')).toBe(before.get('A'));
        // Whatever is still drawn has not changed sides.
        for (const [title, side] of after) expect(side).toBe(before.get(title));
        // The other column lost nothing to the opening itself.
        const other = before.get('A') === 0 ? 1 : 0;
        const inOther = (m: Map<string, number>) => [...m].filter(([, s]) => s === other).length;
        expect(inOther(before) - inOther(after)).toBeLessThanOrEqual(1);
        // And the count of what is not drawn is the truth.
        expect(after.size + open.hidden).toBe(tasks.length);
    });

    it('is one column when there is one task to draw', () => {
        const split = splitTasks(next(1), TODAY);
        const p = planWidget({ split, size: 'sm', available: 190, expanded: null, columns: 2 });
        expect(p.columns).toHaveLength(1);
        expect(p.hidden).toBe(0);
    });

    it('draws one task even where not one fits', () => {
        const split = splitTasks(next(5), TODAY);
        const p = planWidget({ split, size: 'lg', available: 60, expanded: null, columns: 2 });
        expect(shownIn(p)).toBe(1);
        expect(p.hidden).toBe(4);
    });

    it('leaves the single-column plan exactly as it was', () => {
        const split = splitTasks([...today(3), ...next(9)], TODAY);
        const plain = planWidget({ split, size: 'md', available: 300, expanded: null });
        const one = planWidget({ split, size: 'md', available: 300, expanded: null, columns: 1 });
        expect(one).toEqual(plain);
        expect(plain.columns).toBeUndefined();
    });
});
