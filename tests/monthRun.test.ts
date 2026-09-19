import { describe, expect, it } from 'vitest';
import { monthHeading, monthRun, startOfWeek } from '../src/core/calendarDates';

/**
 * The calendar stopped paging a month at a time, so the thing it draws is no
 * longer "a month padded out to whole weeks" but a run of them. Three
 * properties matter and none of them are obvious from reading the function:
 * it must start and end on week boundaries, it must not drop or repeat a day
 * where two months meet, and the week a month begins in has to be findable —
 * that week is where the month's name is set.
 */
describe('a run of months', () => {
    const run = monthRun('2026-09-19', 'mon', 1, 4);

    it('is whole weeks, from a Monday to a Sunday', () => {
        expect(run.length % 7).toBe(0);
        expect(run[0]).toBe(startOfWeek(run[0], 'mon'));
        expect(new Date(`${run[0]}T00:00:00`).getDay()).toBe(1);
        expect(new Date(`${run[run.length - 1]}T00:00:00`).getDay()).toBe(0);
    });

    it('covers every month it was asked for, end to end', () => {
        // One month behind September and four ahead: August through January.
        expect(run[0] <= '2026-08-01').toBe(true);
        expect(run[run.length - 1] >= '2027-01-31').toBe(true);
    });

    it('runs the days on without a gap or a repeat', () => {
        // The failure this guards against is a month boundary swallowing the
        // 31st or serving it twice, which a grid built month by month cannot
        // even express and a continuous one can.
        expect(new Set(run).size).toBe(run.length);
        for (let i = 1; i < run.length; i++) {
            const gap =
                (Date.parse(`${run[i]}T00:00:00Z`) - Date.parse(`${run[i - 1]}T00:00:00Z`)) / 86400000;
            expect(gap).toBe(1);
        }
    });

    it('puts each 1st in exactly one week, which is where its name goes', () => {
        const firsts = run.filter((d) => d.endsWith('-01'));
        const months = new Set(firsts.map((d) => d.slice(0, 7)));
        expect(firsts.length).toBe(months.size);
        expect(months.has('2026-09')).toBe(true);
        expect(months.has('2026-10')).toBe(true);
    });

    it('starts on a Sunday when the week does', () => {
        const sun = monthRun('2026-09-19', 'sun', 0, 1);
        expect(new Date(`${sun[0]}T00:00:00`).getDay()).toBe(0);
        expect(sun.length % 7).toBe(0);
    });
});

describe('a month heading', () => {
    /**
     * Russian's `{month: 'long', year: 'numeric'}` is "сентябрь 2026 г." — the
     * era suffix is correct in a sentence and noise in a heading two words
     * long, and the month arrives lowercase where a heading wants a capital.
     */
    it('is a name and a year, capitalised, with nothing after it', () => {
        expect(monthHeading('2026-09-19', 'ru-RU')).toBe('Сентябрь 2026');
        expect(monthHeading('2026-09-19', 'en-US')).toBe('September 2026');
    });
});
