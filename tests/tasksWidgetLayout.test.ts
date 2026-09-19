import { describe, it, expect } from 'vitest';
import type { Task, SubTask } from '../src/store/taskSlice';
import type { TaskStatus } from '../src/core/constants';
import type { WidgetSize } from '../src/modules/dashboard/grid/gridTypes';
import {
    METRICS,
    NOMINAL_H,
    LOAD_H,
    FIGURE_GAP,
    FIGURE_DROP_ORDER,
    fitFigures,
    weekWidth,
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

describe('sm — one flat list', () => {
    it('fits inside the height it was given', () => {
        const p = plan(screenshot(), 'sm');
        const m = METRICS.sm;
        const budget = NOMINAL_H.sm - m.head - LOAD_H - 2 * m.area;
        expect(p.groups).toBeNull();
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(budget);
    });

    it('orders by urgency, not by file', () => {
        const p = plan(burning(), 'sm');
        // The three burning ones come first; "Резервная копия" is merely next.
        expect(titlesOf(p.lines)[0]).toBe('Улучшение ПК 3.0');
        expect(titlesOf(p.lines)).not.toContain('Резервная копия хранилища');
    });

    it('reports every task it left out', () => {
        const many = Array.from({ length: 9 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const p = plan(many, 'sm');
        expect(titlesOf(p.lines).length + p.hidden).toBe(9);
        expect(p.hidden).toBeGreaterThan(0);
    });

    it('still fits once the footer takes a row', () => {
        const many = Array.from({ length: 9 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const p = plan(many, 'sm');
        const m = METRICS.sm;
        const budget = NOMINAL_H.sm - m.head - LOAD_H - 2 * m.area - m.foot - m.area;
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(budget);
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
        const m = METRICS.sm;
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(NOMINAL_H.sm - m.head - LOAD_H - 2 * m.area);
    });

    it('shows no subtasks at all until one is opened', () => {
        const p = plan(screenshot(), 'sm');
        expect(p.lines.some((l) => l.kind === 'sub')).toBe(false);
    });
});

describe('md — two columns', () => {
    it('labels each column and keeps both inside the budget', () => {
        const p = plan(screenshot(), 'md');
        const m = METRICS.md;
        const budget = NOMINAL_H.md - m.head - LOAD_H - m.foot - 3 * m.area - m.label - m.gap;
        expect(p.columns).toEqual(['doing', 'next']);
        expect(heightOf(p.lines, p.gap)).toBeLessThanOrEqual(budget);
        expect(heightOf(p.lines2, p.gap)).toBeLessThanOrEqual(budget);
    });

    it('puts the burning ones first, in urgency order', () => {
        const p = plan(burning(), 'md');
        // Every started task here is also burning, so "in progress" is empty
        // and the second column goes to what is merely next.
        expect(p.columns).toEqual(['today', 'next']);
        expect(titlesOf(p.lines)[0]).toBe('Улучшение ПК 3.0');
        expect(titlesOf(p.lines2)).toEqual(['Резервная копия хранилища']);
        expect(titlesOf(p.lines).length + titlesOf(p.lines2).length + p.hidden).toBe(4);
    });

    it('continues one long group into the second column without repeating the label', () => {
        const many = Array.from({ length: 6 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const p = plan(many, 'md');
        expect(p.columns?.[0]).toBe('next');
        expect(p.columns?.[1]).toBe('');
        expect(titlesOf(p.lines2).length).toBeGreaterThan(0);
        // The split is 3/3, but each column still only draws what it can hold.
        expect(titlesOf(p.lines).length + titlesOf(p.lines2).length + p.hidden).toBe(6);
    });

    it('counts the overflow of a split group', () => {
        const many = Array.from({ length: 10 }, (_, i) => task(`Задача ${i}`, { dueDate: '2026-08-20' }));
        const p = plan(many, 'md');
        expect(titlesOf(p.lines).length + titlesOf(p.lines2).length + p.hidden).toBe(10);
    });
});

describe('lg — labelled groups', () => {
    it('groups the day and leaves room for the strip along the bottom', () => {
        const p = plan(screenshot(), 'lg');
        const m = METRICS.lg;
        expect(p.groups?.map((g) => g.label)).toEqual(['doing', 'next']);

        const used = (p.groups ?? []).reduce(
            (n, g, i) => n + heightOf(g.lines, m.gap) + m.label + (i > 0 ? m.area : 0),
            0
        );
        expect(used).toBeLessThanOrEqual(NOMINAL_H.lg - m.head - LOAD_H - m.stats - 3 * m.area);
    });

    it('shows subtasks without being asked', () => {
        const p = plan(screenshot(), 'lg');
        const lines = (p.groups ?? []).flatMap((g) => g.lines);
        expect(lines.filter((l) => l.kind === 'sub').length).toBeGreaterThan(0);
    });

    it('names the group by count, not by a sentence', () => {
        const p = plan(burning(), 'lg');
        const today = p.groups?.find((g) => g.label === 'today');
        expect(today?.count).toBe(3);
    });

    it('drops the subtask preview from the group that is only "up next"', () => {
        const p = plan(burning(), 'lg');
        const next = p.groups?.find((g) => g.label === 'next');
        expect(next?.lines.some((l) => l.kind === 'sub')).toBe(false);
    });

    it('keeps a long day inside the card and counts what it cut', () => {
        const many = Array.from({ length: 30 }, (_, i) =>
            task(`Задача ${i}`, { dueDate: '2026-08-01', subtasks: [sub('раз'), sub('два'), sub('три')] })
        );
        const p = plan(many, 'lg');
        const m = METRICS.lg;
        const shown = (p.groups ?? []).flatMap((g) => titlesOf(g.lines)).length;
        expect(shown + p.hidden).toBe(30);
        const used = (p.groups ?? []).reduce(
            (n, g, i) => n + heightOf(g.lines, m.gap) + m.label + (i > 0 ? m.area : 0),
            0
        );
        expect(used).toBeLessThanOrEqual(NOMINAL_H.lg - m.head - LOAD_H - m.stats - 3 * m.area - m.foot - m.area);
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

describe('the bottom strip in a narrow card', () => {
    // Roughly what the Russian labels measure at 9px uppercase.
    const WIDTHS: Record<string, number> = {
        active: 62,
        overdue: 74,
        done: 105,
        cancelled: 100,
        subtasks: 70,
        nextDue: 92,
        link: 84,
    };
    const ALL = ['active', 'overdue', 'done', 'cancelled', 'subtasks', 'nextDue', 'link'];
    const spanOf = (keys: string[]): number =>
        keys.reduce((n, k) => n + WIDTHS[k], 0) + FIGURE_GAP * Math.max(0, keys.length - 1);

    it('keeps every figure when there is room', () => {
        expect(fitFigures(ALL, WIDTHS, spanOf(ALL))).toEqual(ALL);
    });

    /**
     * The same card, at the same width, in two languages.
     *
     * These are measured widths, not invented ones: an lg card 621px wide
     * leaves the figures 295px once the week strip and its gap are paid for.
     * With the label free to run to whatever length the dictionary gives it,
     * "next due" measured 48px and "ближайший срок" 98, "closed today"
     * 73 and "завершено сегодня" 109 — so the English card showed two
     * figures and the Russian one showed one, with 38px of the difference
     * being nothing but longer words.
     *
     * The label is capped and wraps now, which puts every figure at 76 and
     * makes what the strip can hold a question about the card rather than
     * about the language it is being read in.
     */
    const ROOM_AT_621 = 295;
    const KEYS = ['overdue', 'active', 'nextDue', 'done', 'cancelled', 'subtasks', 'link'];

    it('held fewer figures in Russian than in English, before the cap', () => {
        const loose = (nextDue: number, done: number) => ({
            active: 54, overdue: 68, cancelled: 104, subtasks: 55, link: 74, nextDue, done,
        });
        expect(fitFigures(KEYS, loose(48, 73), ROOM_AT_621)).toEqual(['nextDue', 'done', 'link']);
        expect(fitFigures(KEYS, loose(98, 109), ROOM_AT_621)).toEqual(['done', 'link']);
    });

    it('holds the same figures in both, once the label is capped', () => {
        const capped = { active: 54, overdue: 68, cancelled: 76, subtasks: 55, link: 74 };
        const en = { ...capped, nextDue: 48, done: 73 };
        const ru = { ...capped, nextDue: 76, done: 76 };
        expect(fitFigures(KEYS, ru, ROOM_AT_621)).toEqual(['nextDue', 'done', 'link']);
        expect(fitFigures(KEYS, en, ROOM_AT_621)).toEqual(fitFigures(KEYS, ru, ROOM_AT_621));
    });

    it('never returns more than the width allows', () => {
        for (const available of [560, 430, 300, 210, 120, 40, 0]) {
            const kept = fitFigures(ALL, WIDTHS, available);
            // The link is the one thing that cannot be dropped, so it is the
            // only case allowed to exceed the space it was given.
            if (kept.length > 1) expect(spanOf(kept)).toBeLessThanOrEqual(available);
        }
    });

    it('gives up what the heading already says, in that order', () => {
        // The heading leads with the active count, so "active" buys the least.
        expect(fitFigures(ALL, WIDTHS, spanOf(ALL) - 1)).not.toContain('active');
        // A day that produced nothing offers no outcome figures to begin with.
        const quiet = ['active', 'overdue', 'subtasks', 'nextDue', 'link'];
        expect(fitFigures(quiet, WIDTHS, 320)).toEqual(['subtasks', 'nextDue', 'link']);
        expect(fitFigures(quiet, WIDTHS, 220)).toEqual(['nextDue', 'link']);
    });

    it('keeps what the day produced longest — it is said nowhere else', () => {
        // On a narrow card the last figure standing is what got finished.
        expect(fitFigures(ALL, WIDTHS, 250)).toEqual(['done', 'link']);
        expect(fitFigures(ALL, WIDTHS, 215)).toEqual(['done', 'link']);
    });

    it('never offers an "in progress" figure — the heading owns that number', () => {
        expect(FIGURE_DROP_ORDER).not.toContain('doing');
    });

    it('falls back to the link alone rather than clipping', () => {
        expect(fitFigures(ALL, WIDTHS, 30)).toEqual(['link']);
    });

    it('keeps an unmeasured figure, so the first pass shows everything', () => {
        // Widths arrive after the browser has drawn them; until then nothing
        // has a known cost and the strip renders in full to be measured.
        expect(fitFigures(ALL, {}, 0)).toEqual(ALL);
    });

    it('drops nothing that was already dropped from the data', () => {
        // A day with no subtasks never offers that figure in the first place.
        const keys = ['active', 'overdue', 'nextDue', 'link'];
        expect(fitFigures(keys, WIDTHS, 250)).not.toContain('subtasks');
    });

    it('reserves the width the week means to take, not the width it settles for', () => {
        // 42 for today + six ordinary days, and the overdue tally when there is
        // one. Measuring the strip instead would report whatever it had already
        // been squeezed to, and nothing beside it would ever be dropped.
        expect(weekWidth(false)).toBe(222);
        expect(weekWidth(true)).toBe(268);
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
