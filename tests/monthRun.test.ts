import { describe, expect, it } from 'vitest';
import { monthHeading, monthRows, monthRun, startOfWeek } from '../src/core/calendarDates';

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
                (Date.parse(`${run[i]}T00:00:00Z`) - Date.parse(`${run[i - 1]}T00:00:00Z`)) /
                86400000;
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

    /**
     * Reaching further back has to add weeks at the FRONT and disturb nothing
     * else. The grid restores the scroll after a prepend by adding however much
     * the content grew to `scrollTop`, which is only the right number if every
     * week that was already on screen kept its position in the run — one week
     * appearing or vanishing further down and the reader is thrown a row.
     */
    it('grows backwards by prepending, leaving the rest of the run alone', () => {
        const near = monthRun('2026-09-19', 'mon', 1, 4);
        const far = monthRun('2026-09-19', 'mon', 5, 4);

        expect(far.length).toBeGreaterThan(near.length);
        expect(far.slice(far.length - near.length)).toEqual(near);
    });
});

/**
 * The run as rows, and which month each row is filed under.
 *
 * Two things read this. The scroll reports a row's month to the toolbar, so
 * the title names what is on screen; and `opens` marks the row a month starts
 * in — where its name is drawn, and where "go to October" scrolls to. Both
 * break quietly if a row is filed under the wrong month or a month opens
 * twice, which is what these pin down.
 */
describe('a run as month rows', () => {
    const run = monthRun('2026-09-19', 'mon', 2, 4);
    const rows = monthRows(run);

    it('keeps the weeks whole, and every day exactly once', () => {
        // The rows ARE the run: nothing cut, nothing repeated, nothing lost.
        for (const row of rows) expect(row.dates).toHaveLength(7);
        expect(rows.flatMap((row) => row.dates)).toEqual(run);
    });

    it('files a row under the month it ends in', () => {
        // Which is the month whose 1st the week contains, and so the month
        // whose heading stands above the row.
        for (const row of rows) expect(row.month).toBe(row.dates[6].slice(0, 7));
    });

    it('opens every month exactly once, in order, on its 1st', () => {
        const opened = rows.filter((row) => row.opens);
        const months = opened.map((row) => row.month);
        expect(new Set(months).size).toBe(months.length);
        expect(months).toEqual([...months].sort());
        expect(new Set(rows.map((row) => row.month)).size).toBe(months.length);
        expect(rows[0].opens).toBe(true);
        // The name is drawn on the 1st, so the row that opens a month has one.
        for (const row of opened) expect(row.dates).toContain(`${row.month}-01`);
    });

    it('opens a month on the week its 1st falls in, tail and all', () => {
        // 1 October 2026 is a Thursday, so October opens in a week that begins
        // with three days of September. They belong in that week and stay.
        const october = rows.find((row) => row.opens && row.month === '2026-10');
        expect(october?.dates.slice(0, 3)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
        expect(october?.dates[3]).toBe('2026-10-01');
    });

    it('opens on the first column when a month starts the week', () => {
        // 1 February 2027 is a Monday: the week is the month's from the off.
        const february = monthRows(monthRun('2027-02-15', 'mon', 0, 0)).find(
            (row) => row.opens && row.month === '2027-02'
        );
        expect(february?.dates[0]).toBe('2027-02-01');
    });

    /**
     * Three days across, for a phone. The rows are no longer weeks, so they
     * have no natural start — and the one thing that must hold is that they do
     * not re-phase when the run grows. The grid restores the scroll after a
     * prepend by how much the content grew, which is only the right number if
     * every row already on screen kept its days; re-grouping would shuffle the
     * whole calendar sideways under the reader's thumb.
     */
    it('groups three days a row without re-phasing as the run grows', () => {
        const near = monthRows(monthRun('2026-09-19', 'mon', 1, 4), 3);
        const far = monthRows(monthRun('2026-09-19', 'mon', 5, 4), 3);

        const full = (list: typeof near) => list.filter((row) => row.dates.length === 3);
        expect(full(near).length).toBeGreaterThan(0);

        // Every full row of the shorter run appears, unchanged, in the longer.
        const grown = new Map(far.map((row) => [row.dates[0], row.dates]));
        for (const row of full(near)) expect(grown.get(row.dates[0])).toEqual(row.dates);
    });

    it('keeps every day exactly once at three across, too', () => {
        const run3 = monthRun('2026-09-19', 'mon', 1, 1);
        const rows3 = monthRows(run3, 3);
        expect(rows3.flatMap((row) => row.dates)).toEqual(run3);
        // Only the run's two ends may be short of a full row.
        for (const row of rows3.slice(1, -1)) expect(row.dates).toHaveLength(3);
    });

    it('still opens every month exactly once at three across', () => {
        const rows3 = monthRows(monthRun('2026-09-19', 'mon', 2, 4), 3);
        const months = rows3.filter((row) => row.opens).map((row) => row.month);
        expect(new Set(months).size).toBe(months.length);
        expect(months).toEqual([...months].sort());
        expect(new Set(rows3.map((row) => row.month)).size).toBe(months.length);
    });

    it('files a Sunday-start week the same way', () => {
        const sunday = monthRows(monthRun('2026-09-19', 'sun', 1, 1));
        for (const row of sunday) {
            expect(new Date(`${row.dates[0]}T00:00:00`).getDay()).toBe(0);
            expect(row.month).toBe(row.dates[6].slice(0, 7));
        }
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
