import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    entranceDuration,
    playHabitEntrance,
    playStreakGrowth,
} from '../src/modules/journal/components/habitEntrance';

/**
 * A DOM stand-in: enough of an element for the entrance to walk the grid and
 * schedule its animations. `jsdom` isn't in this project's test environment,
 * and the thing worth testing is the timing, not the rendering.
 */
function fakeGrid(options: {
    rows: number;
    days: number;
    runsPerRow?: number;
    canAnimate?: boolean;
    /** Days that recorded something, 0-based, per row. */
    marked?: number[];
    /** Last day of the single run each row is given. */
    runTo?: number;
}) {
    const calls: Array<{ selector: string; at: number; delay: number }> = [];

    const el = (selector: string, at: number, row = 0) => ({
        getAttribute: (name: string) => {
            if (name === 'data-row') return String(row);
            if (name === 'data-marked') return options.marked?.includes(at) ? '1' : null;
            if (name === 'data-to') return String(options.runTo ?? at);
            return String(at);
        },
        style: {} as Record<string, string>,
        // A platform with no Web Animations API leaves this undefined, which
        // is a case the entrance has to survive rather than throw on.
        animate:
            options.canAnimate === false
                ? undefined
                : (_keyframes: unknown, timing: { delay: number }) => {
                      calls.push({ selector, at, delay: timing.delay });
                      return { cancel: () => undefined } as unknown as Animation;
                  },
    });

    const list = (selector: string, count: number, row = 0) =>
        Array.from({ length: count }, (_, i) => el(selector, i, row));

    /** Flattened the way the grid renders it: every row's marks in one list. */
    const perRow = (selector: string, count: number) =>
        Array.from({ length: options.rows }, (_, row) => list(selector, count, row)).flat();

    const root = {
        querySelectorAll: (selector: string) => {
            if (selector.includes('__label')) return list('label', options.rows);
            if (selector.includes('__run')) return perRow('run', options.runsPerRow ?? 1);
            if (selector.includes('__cell')) return perRow('cell', options.days);
            if (selector.includes('__day')) return list('head', options.days);
            if (selector.includes('hcard')) return list('card', 3);
            return [];
        },
    };

    return { root: root as unknown as HTMLElement, calls };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

/** Tests run in node: `window` is whatever we say it is. */
function setMotion(reduced: boolean) {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
}

const enableMotion = () => setMotion(false);

describe('entranceDuration', () => {
    it('covers the last recorded day to arrive', () => {
        // Row 6 starts at 420ms, its 31st column adds 360ms, a recorded day is
        // 260ms behind its row and takes 420ms to land.
        expect(entranceDuration(7, 31)).toBe(420 + 360 + 260 + 420);
    });

    it('is never negative for an empty grid', () => {
        expect(entranceDuration(0, 0)).toBeGreaterThan(0);
    });

    it('grows with the month and with the number of habits', () => {
        expect(entranceDuration(7, 31)).toBeGreaterThan(entranceDuration(3, 31));
        expect(entranceDuration(7, 31)).toBeGreaterThan(entranceDuration(7, 28));
    });

    it('never finishes before the cards have arrived', () => {
        // One habit over a short month is done before the summary is, and the
        // sequence is not over until the last thing on screen has moved.
        expect(entranceDuration(1, 28)).toBe(560 + 2 * 80 + 420);
    });
});

describe('playHabitEntrance', () => {
    it('does nothing where nothing can animate', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 2, days: 5, canAnimate: false });
        expect(playHabitEntrance(root)).toEqual([]);
        expect(calls).toHaveLength(0);
    });

    it('leaves the motion question to the plugin’s own setting', () => {
        // Zenith has its own Animations switch, and the caller gates on it. A
        // second opinion from the OS meant a machine with Windows animations
        // off discarded the sequence whatever the plugin said — which is
        // indistinguishable from the feature being broken.
        setMotion(true);
        const { root, calls } = fakeGrid({ rows: 2, days: 5 });
        expect(playHabitEntrance(root)).not.toEqual([]);
        expect(calls.length).toBeGreaterThan(0);
    });

    it('animates every part of the grid', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 2, days: 5 });
        playHabitEntrance(root);
        const kinds = calls.reduce<Record<string, number>>((acc, call) => {
            acc[call.selector] = (acc[call.selector] ?? 0) + 1;
            return acc;
        }, {});
        expect(kinds).toEqual({ label: 2, run: 2, cell: 10, head: 5, card: 3 });
    });

    it('staggers rows, and columns within a row', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 2, days: 3 });
        playHabitEntrance(root);
        const cells = calls.filter((c) => c.selector === 'cell').map((c) => c.delay);
        // Empty days: 150, 162, 174. Row 1 starts 70ms later.
        expect(cells).toEqual([150, 162, 174, 220, 232, 244]);
    });

    it('brings a recorded day in after the empty ones around it', () => {
        // A month is mostly empty rings; animating them all alike spends the
        // whole sequence on the part nobody looks at.
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 1, days: 3, marked: [1] });
        playHabitEntrance(root);
        const cells = calls.filter((c) => c.selector === 'cell').map((c) => c.delay);
        expect(cells).toEqual([150, 260 + 12, 174]);
    });

    it('starts a streak before the days that sit on it', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 1, days: 3 });
        playHabitEntrance(root);
        const run = calls.find((c) => c.selector === 'run');
        const firstCell = calls.find((c) => c.selector === 'cell');
        expect(run?.delay).toBe(90);
        expect(firstCell?.delay).toBeGreaterThan(run?.delay ?? 0);
    });
});

describe('playStreakGrowth', () => {
    it('draws the bar and lands its days on it, in order', () => {
        enableMotion();
        // One row, a streak running from day 0 to day 3, and day 3 is the one
        // just ticked — so the bar grows rightwards and the marks follow.
        const { root, calls } = fakeGrid({ rows: 1, days: 4, runTo: 3 });
        playStreakGrowth(root, 0, 3);

        const bar = calls.find((c) => c.selector === 'run');
        const marks = calls.filter((c) => c.selector === 'cell');
        expect(bar?.delay).toBe(0);
        // Each day waits for the bar to reach it: 60ms, then a share of the
        // bar's own 560ms.
        expect(marks.map((m) => Math.round(m.delay))).toEqual([60, 191, 321, 452]);
    });

    it('runs the days backwards when the streak grew leftwards', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 1, days: 4, runTo: 3 });
        // Day 0 is the new one, so the bar reaches out from its other end.
        playStreakGrowth(root, 0, 0);
        const marks = calls.filter((c) => c.selector === 'cell').map((m) => Math.round(m.delay));
        expect(marks).toEqual([452, 321, 191, 60]);
    });

    it('still lands a day that joined no streak', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 1, days: 4, runTo: 1 });
        // Day 3 sits outside the run, so only that mark animates.
        playStreakGrowth(root, 0, 3);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ selector: 'cell', at: 3, delay: 0 });
    });

    it('leaves the other rows alone', () => {
        enableMotion();
        const { root, calls } = fakeGrid({ rows: 3, days: 4, runTo: 3 });
        playStreakGrowth(root, 1, 3);
        expect(calls.every((c) => c.selector !== 'label')).toBe(true);
        expect(calls.filter((c) => c.selector === 'cell')).toHaveLength(4);
    });
});
