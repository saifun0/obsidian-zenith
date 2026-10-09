import { describe, expect, it } from 'vitest';
import {
    ROOM_GRAND,
    ROOM_MEDIUM,
    ROOM_WIDE,
    listColumns,
    roomSpan,
    rowsThatFit,
} from '../src/modules/dashboard/cardRoom';
import {
    WEEKS_PER_YEAR,
    lifeGridPlan,
    lifeMarks,
    type LifeWeeks,
} from '../src/modules/dashboard/services/lifeWeeks';
import {
    DEFAULT_TIMER_SETTINGS,
    TIMER_CLEARED,
    normalizeTimerSettings,
    timerEvents,
    timerHold,
    timerResume,
    timerShare,
    timerStart,
    timerState,
} from '../src/modules/utilities/timer';
import { spreadHours } from '../src/modules/weather/components/HourlyStrip';

describe('the room a card gives its widget', () => {
    it('names four compositions by the body width', () => {
        expect(roomSpan(0)).toBe('narrow');
        expect(roomSpan(ROOM_MEDIUM - 1)).toBe('narrow');
        expect(roomSpan(ROOM_MEDIUM)).toBe('medium');
        expect(roomSpan(ROOM_WIDE)).toBe('wide');
        expect(roomSpan(ROOM_GRAND)).toBe('grand');
    });

    it('puts a phone column and a third of a six-column board in one column', () => {
        // 343px and 296px cards, less the body padding.
        expect(roomSpan(311)).toBe('narrow');
        expect(roomSpan(264)).toBe('narrow');
        expect(listColumns(311)).toBe(1);
    });

    it('runs a list in two columns at half a default board and three at the whole of one', () => {
        expect(listColumns(560)).toBe(2);
        expect(listColumns(1168)).toBe(3);
    });

    it('counts the rows that fit, and never fewer than the floor it is given', () => {
        expect(rowsThatFit(195, 30)).toBe(6);
        expect(rowsThatFit(195, 30, 84)).toBe(3);
        expect(rowsThatFit(20, 30)).toBe(1);
        expect(rowsThatFit(0, 30, 0, 2)).toBe(2);
    });
});

describe('a life as a grid, as fine as the room allows', () => {
    it('draws weeks where a week can be five pixels', () => {
        const plan = lifeGridPlan(80, 888, 467);
        expect(plan.grain).toBe('week');
        expect(plan.cols).toBe(80);
        expect(plan.rows).toBe(WEEKS_PER_YEAR);
        expect(plan.cell).toBeGreaterThanOrEqual(5);
    });

    it('stands the count beside a field that is tall, over one that is wide', () => {
        expect(lifeGridPlan(80, 888, 467).beside).toBe(true);
        expect(lifeGridPlan(80, 888, 195).beside).toBe(false);
    });

    it('coarsens to months, then to years, as the room shrinks', () => {
        expect(lifeGridPlan(80, 888, 195).grain).toBe('month');
        expect(lifeGridPlan(80, 420, 195).grain).toBe('month');
        expect(lifeGridPlan(80, 264, 195).grain).toBe('year');
        expect(lifeGridPlan(80, 311, 195).grain).toBe('year');
    });

    it('never draws a grid wider than its room', () => {
        for (const [w, h] of [
            [888, 467],
            [888, 195],
            [420, 195],
            [264, 195],
            [140, 59],
        ]) {
            const plan = lifeGridPlan(80, w, h);
            expect(plan.cols * plan.cell).toBeLessThanOrEqual(w + 0.001);
        }
    });

    it('has a plan before the card has been measured', () => {
        const plan = lifeGridPlan(80, 0, 0);
        expect(plan.grain).toBe('year');
        expect(plan.cell).toBeGreaterThan(0);
    });

    const life: LifeWeeks = { age: 32, week: 26, lived: 32 * 52 + 27, total: 80 * 52, fraction: 0.4 };

    it('fills whole years as one block and the year under way as a second', () => {
        const marks = lifeMarks(life, 80, { grain: 'week', cols: 80, rows: 52 });
        expect(marks.lived).toEqual([
            { x: 0, y: 0, w: 32, h: 52 },
            { x: 32, y: 0, w: 1, h: 26 },
        ]);
        expect(marks.now).toEqual({ x: 32, y: 26, w: 1, h: 1 });
    });

    it('puts now in the same share of the column at a coarser grain', () => {
        const marks = lifeMarks(life, 80, { grain: 'month', cols: 80, rows: 12 });
        expect(marks.now).toEqual({ x: 32, y: 6, w: 1, h: 1 });
    });

    it('counts years row by row when a mark is a year', () => {
        const marks = lifeMarks(life, 80, { grain: 'year', cols: 20, rows: 4 });
        expect(marks.lived).toEqual([
            { x: 0, y: 0, w: 20, h: 1 },
            { x: 0, y: 1, w: 12, h: 1 },
        ]);
        expect(marks.now).toEqual({ x: 12, y: 1, w: 1, h: 1 });
    });

    it('has no "now" once the life has outrun the span drawn', () => {
        const old: LifeWeeks = { ...life, age: 85 };
        expect(lifeMarks(old, 80, { grain: 'week', cols: 80, rows: 52 }).now).toBeNull();
        expect(lifeMarks(old, 80, { grain: 'year', cols: 20, rows: 4 }).now).toBeNull();
    });
});

describe('a timer put on hold', () => {
    const NOW = 1_800_000_000_000;

    it('keeps what was left, and has no end to ring at', () => {
        const running = { ...DEFAULT_TIMER_SETTINGS, ...timerStart(DEFAULT_TIMER_SETTINGS, NOW) };
        const held = { ...running, ...timerHold(running, NOW + 60_000) };
        expect(held.timerEndsAt).toBe(0);
        expect(held.timerHeld).toBe(24 * 60);
        expect(timerState(held, NOW + 999_999)).toEqual({ kind: 'held', left: 24 * 60 });
        expect(timerEvents({ 'picture.timer': held }, 0, Number.MAX_SAFE_INTEGER)).toEqual([]);
    });

    it('counts on from where it stopped when let go', () => {
        const held = { ...DEFAULT_TIMER_SETTINGS, timerHeld: 90 };
        const resumed = { ...held, ...timerResume(held, NOW) };
        expect(resumed.timerHeld).toBe(0);
        expect(timerState(resumed, NOW)).toEqual({ kind: 'running', left: 90 });
    });

    it('does nothing to a timer that is not in the state it acts on', () => {
        expect(timerHold(DEFAULT_TIMER_SETTINGS, NOW)).toEqual({});
        expect(timerResume(DEFAULT_TIMER_SETTINGS, NOW)).toEqual({});
    });

    it('is put away whole', () => {
        const held = { ...DEFAULT_TIMER_SETTINGS, timerHeld: 90, ...TIMER_CLEARED };
        expect(timerState(held, NOW)).toEqual({ kind: 'idle' });
    });

    it('reads a stored hold, and lets a stored end win over it', () => {
        expect(normalizeTimerSettings({ timerHeld: 42 }).timerHeld).toBe(42);
        expect(normalizeTimerSettings({ timerHeld: -1 }).timerHeld).toBe(0);
        expect(normalizeTimerSettings({ timerHeld: 'x' }).timerHeld).toBe(0);
        expect(normalizeTimerSettings({ timerHeld: 42, timerEndsAt: NOW }).timerHeld).toBe(0);
    });

    it('says how much of the run is still to go', () => {
        expect(timerShare(DEFAULT_TIMER_SETTINGS, 25 * 60)).toBe(1);
        expect(timerShare(DEFAULT_TIMER_SETTINGS, 0)).toBe(0);
        expect(timerShare(DEFAULT_TIMER_SETTINGS, 750)).toBeCloseTo(0.5);
        expect(timerShare(DEFAULT_TIMER_SETTINGS, 99_999)).toBe(1);
    });
});

describe('the hours on the weather card', () => {
    const day = Array.from({ length: 48 }, (_, i) => i);

    it('are every hour of the day ahead where there is room for them', () => {
        expect(spreadHours(day, 24)).toEqual(day.slice(0, 24));
        expect(spreadHours(day, 40)).toHaveLength(24);
    });

    it('thin out evenly, the present hour first, and never past the columns there are', () => {
        expect(spreadHours(day, 12)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
        expect(spreadHours(day, 9)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
        for (const n of [4, 5, 7, 10, 19]) {
            expect(spreadHours(day, n).length).toBeLessThanOrEqual(n);
            expect(spreadHours(day, n)[0]).toBe(0);
        }
    });

    it('draws what there is when the forecast is short', () => {
        expect(spreadHours([1, 2, 3], 12)).toEqual([1, 2, 3]);
        expect(spreadHours([], 12)).toEqual([]);
    });
});
