import { describe, it, expect } from 'vitest';
import {
    habitMonth,
    keptOn,
    longestRun,
    monthDays,
    recentHabits,
    runsOf,
    runsOfFlags,
    summarize,
    type HabitCell,
} from '../src/modules/journal/services/habitMonth';
import {
    NOTES_HEADINGS,
    activeTrackers,
    meetsGoal,
    trackerFill,
    trackerGoal,
    type JournalTracker,
} from '../src/core/journalConfig';
import { DICTS } from '../src/core/i18n';
import type { JournalEntry } from '../src/store/journalSlice';

const TODAY = '2026-07-24';

const CHECK: JournalTracker = { id: 'read', label: 'Read', icon: 'book', color: '#10b981', kind: 'check' };
const SCALE: JournalTracker = { id: 'mood', label: 'Mood', icon: 'smile', color: '#eab308', kind: 'scale' };
const NUMBER: JournalTracker = {
    id: 'water',
    label: 'Water',
    icon: 'droplet',
    color: '#3b82f6',
    kind: 'number',
    step: 1,
    max: 8,
};
/** The user's real Exercise tracker: a number with no target set. */
const OPEN_NUMBER: JournalTracker = {
    id: 'sport',
    label: 'Exercise',
    icon: 'dumbbell',
    color: '#ef4444',
    kind: 'number',
    step: 5,
};

/** A day's note: `values` recorded, and enough words to count as journalled. */
function entry(date: string, values: Record<string, unknown>, words = 10): JournalEntry {
    return {
        date,
        filePath: `journal/${date}.md`,
        values: values as JournalEntry['values'],
        words,
        mtime: 0,
    } as JournalEntry;
}

function byDateOf(entries: JournalEntry[]): Map<string, JournalEntry> {
    return new Map(entries.map((e) => [e.date, e]));
}

describe('trackerGoal', () => {
    it('is the tick for a check', () => {
        expect(trackerGoal(CHECK)).toBe(1);
    });

    it('defaults a scale to 4 of 5, and honours an explicit goal', () => {
        expect(trackerGoal(SCALE)).toBe(4);
        expect(trackerGoal({ ...SCALE, goal: 3 })).toBe(3);
    });

    it('clamps a nonsense scale goal into the scale', () => {
        expect(trackerGoal({ ...SCALE, goal: 9 })).toBe(5);
        expect(trackerGoal({ ...SCALE, goal: 0 })).toBe(1);
    });

    it('is a number tracker’s target, and zero when it has none', () => {
        expect(trackerGoal(NUMBER)).toBe(8);
        expect(trackerGoal(OPEN_NUMBER)).toBe(0);
    });
});

describe('meetsGoal', () => {
    it('reads a check', () => {
        expect(meetsGoal(CHECK, true)).toBe(true);
        expect(meetsGoal(CHECK, undefined)).toBe(false);
        expect(meetsGoal(CHECK, false)).toBe(false);
    });

    it('needs the goal score on a scale', () => {
        expect(meetsGoal(SCALE, 4)).toBe(true);
        expect(meetsGoal(SCALE, 5)).toBe(true);
        expect(meetsGoal(SCALE, 3)).toBe(false);
    });

    it('needs the target on a number that states one', () => {
        expect(meetsGoal(NUMBER, 8)).toBe(true);
        expect(meetsGoal(NUMBER, 9)).toBe(true);
        expect(meetsGoal(NUMBER, 7)).toBe(false);
    });

    it('counts anything above nothing when a number states no target', () => {
        expect(meetsGoal(OPEN_NUMBER, 20)).toBe(true);
        expect(meetsGoal(OPEN_NUMBER, 0)).toBe(false);
    });

    it('reads the strings YAML actually produces', () => {
        expect(meetsGoal(CHECK, 'yes')).toBe(true);
        expect(meetsGoal(SCALE, '4')).toBe(true);
    });
});

describe('trackerFill', () => {
    it('is zero only when nothing was recorded', () => {
        expect(trackerFill(NUMBER, undefined)).toBe(0);
        expect(trackerFill(NUMBER, 8)).toBe(1);
    });

    it('keeps a floor so a small value stays visible', () => {
        // 1 of 8 is 0.125, which would all but disappear against an empty day.
        expect(trackerFill(NUMBER, 1)).toBe(0.2);
    });

    it('is a fraction of the goal, not of the maximum', () => {
        expect(trackerFill(SCALE, 2)).toBeCloseTo(0.5);
        expect(trackerFill(SCALE, 4)).toBe(1);
        expect(trackerFill(SCALE, 5)).toBe(1);
    });
});

describe('monthDays', () => {
    it('covers the whole month the anchor is in', () => {
        const july = monthDays('2026-07-15');
        expect(july).toHaveLength(31);
        expect(july[0]).toBe('2026-07-01');
        expect(july[30]).toBe('2026-07-31');
    });

    it('knows a short month and a leap February', () => {
        expect(monthDays('2026-02-10')).toHaveLength(28);
        expect(monthDays('2028-02-10')).toHaveLength(29);
        expect(monthDays('2026-06-01')).toHaveLength(30);
    });
});

describe('runsOf / longestRun', () => {
    const cells = (states: string[]): HabitCell[] =>
        states.map((state, i) => ({
            date: `2026-07-${String(i + 1).padStart(2, '0')}`,
            day: i + 1,
            state: state as HabitCell['state'],
            fill: state === 'done' ? 1 : 0,
        }));

    it('joins consecutive done days', () => {
        const out = runsOf(cells(['done', 'done', 'done', 'miss', 'done', 'done']));
        expect(out).toEqual([
            { from: 0, to: 2 },
            { from: 4, to: 5 },
        ]);
    });

    it('leaves a lone day unconnected', () => {
        expect(runsOf(cells(['done', 'miss', 'done']))).toEqual([]);
    });

    it('closes a run that reaches the end of the month', () => {
        expect(runsOf(cells(['miss', 'done', 'done']))).toEqual([{ from: 1, to: 2 }]);
    });

    it('counts a lone day as a streak of one', () => {
        expect(longestRun(cells(['done', 'miss', 'done']))).toBe(1);
        expect(longestRun(cells(['done', 'done', 'miss', 'done']))).toBe(2);
        expect(longestRun(cells(['miss', 'empty']))).toBe(0);
    });
});

describe('habitMonth', () => {
    const entries = [
        entry('2026-07-01', { read: true, mood: 5 }),
        entry('2026-07-02', { read: true, mood: 3 }),
        entry('2026-07-03', { read: true }),
        // Journalled, but this habit went untouched.
        entry('2026-07-04', { mood: 4 }),
    ];

    const month = () => habitMonth(byDateOf(entries), [CHECK, SCALE], '2026-07-10', TODAY);

    it('places every day of the month on one axis', () => {
        expect(month().days).toHaveLength(31);
        expect(month().rows.map((r) => r.tracker.id)).toEqual(['read', 'mood']);
    });

    it('tells a skipped day from a day with no note', () => {
        const read = month().rows[0];
        expect(read.cells[3].state).toBe('miss'); // 4 July: journalled, not read
        expect(read.cells[4].state).toBe('empty'); // 5 July: no note at all
    });

    it('marks a recorded day that fell short as partial', () => {
        const mood = month().rows[1];
        expect(mood.cells[0].state).toBe('done'); // 5
        expect(mood.cells[1].state).toBe('partial'); // 3, goal is 4
    });

    it('does not call the rest of the month a failure', () => {
        const read = month().rows[0];
        expect(read.cells[24].state).toBe('future'); // 25 July, today is the 24th
    });

    it('rates against the days elapsed, not the whole month', () => {
        // 3 done out of 24 days lived through — not out of 31.
        const read = month().rows[0];
        expect(month().elapsed).toBe(24);
        expect(read.done).toBe(3);
        expect(read.rate).toBeCloseTo(3 / 24);
    });

    it('counts a whole month once it is past', () => {
        const past = habitMonth(byDateOf(entries), [CHECK], '2026-06-10', TODAY);
        expect(past.elapsed).toBe(30);
    });

    it('totals each day down the columns', () => {
        const totals = month().totals;
        expect(totals[0]).toBe(2); // read + mood 5
        expect(totals[1]).toBe(1); // read only — mood 3 fell short
        expect(totals[3]).toBe(1); // mood 4 only
        expect(totals[9]).toBe(0);
    });

    it('draws the streak as one run', () => {
        expect(month().rows[0].runs).toEqual([{ from: 0, to: 2 }]);
        expect(month().rows[0].streak).toBe(3);
    });
});

describe('recentHabits', () => {
    // A window that crosses a month boundary — exactly what a calendar month
    // cannot show on the 2nd.
    const entries = [
        entry('2026-06-29', { read: true }),
        entry('2026-06-30', { read: true }),
        entry('2026-07-01', { mood: 4 }),
    ];
    const rows = () => recentHabits(byDateOf(entries), [CHECK, SCALE], '2026-07-02', 7);

    it('ends on today and reaches back across the month boundary', () => {
        const [read] = rows();
        expect(read.cells.map((c) => c.date)).toEqual([
            '2026-06-26',
            '2026-06-27',
            '2026-06-28',
            '2026-06-29',
            '2026-06-30',
            '2026-07-01',
            '2026-07-02',
        ]);
        expect(read.cells[3].day).toBe(29);
        expect(read.cells[6].day).toBe(2);
    });

    it('draws its days in the four states the grid uses, and none in the future', () => {
        const [read, mood] = rows();
        expect(read.cells.map((c) => c.state)).toEqual([
            'empty',
            'empty',
            'empty',
            'done',
            'done',
            'miss',
            'empty',
        ]);
        expect(mood.cells[5].state).toBe('done');
    });

    it('rates against the whole window, since all of it has been lived', () => {
        const [read] = rows();
        expect(read.done).toBe(2);
        expect(read.rate).toBeCloseTo(2 / 7);
    });
});

describe('summarize', () => {
    const rows = (rates: number[]) =>
        rates.map((rate, i) => ({
            tracker: { ...CHECK, id: `t${i}`, label: `T${i}` },
            cells: [],
            runs: [],
            done: rate * 10,
            streak: 1,
            rate,
        }));

    it('picks the best and the worst', () => {
        const out = summarize(rows([0.5, 0.9, 0.2]));
        expect(out.best?.tracker.id).toBe('t1');
        expect(out.worst?.tracker.id).toBe('t2');
        expect(out.average).toBeCloseTo(0.5333, 3);
    });

    it('breaks a tie on the longer streak', () => {
        const tied = rows([0.5, 0.5]);
        tied[1].streak = 9;
        expect(summarize(tied).best?.tracker.id).toBe('t1');
    });

    it('survives having no trackers at all', () => {
        expect(summarize([])).toEqual({ best: null, worst: null, average: 0, totalDone: 0 });
    });

    it('adds up every done day across the trackers', () => {
        expect(summarize(rows([0.5, 0.9])).totalDone).toBe(14);
    });
});

describe('activeTrackers', () => {
    it('leaves out the ones switched off, in order', () => {
        const list = [CHECK, { ...SCALE, disabled: true }, NUMBER];
        expect(activeTrackers(list).map((t) => t.id)).toEqual(['read', 'water']);
    });

    it('treats an absent flag as on', () => {
        expect(activeTrackers([CHECK, SCALE])).toHaveLength(2);
    });

    it('keeps a switched-off tracker’s history readable', () => {
        // Nothing about the entry changes — only which trackers are drawn — so
        // switching one back on finds its month exactly as it was.
        const entries = [entry('2026-07-01', { read: true, mood: 5 })];
        const off = habitMonth(byDateOf(entries), activeTrackers([CHECK, { ...SCALE, disabled: true }]), '2026-07-10', TODAY);
        const on = habitMonth(byDateOf(entries), [CHECK, SCALE], '2026-07-10', TODAY);
        expect(off.rows).toHaveLength(1);
        expect(on.rows[1].cells[0].state).toBe('done');
    });
});

describe('NOTES_HEADINGS', () => {
    it('lists the notes heading of every language Zenith ships', () => {
        // The word counter matches against this list rather than the current
        // language, so a heading a translation adds must land here too.
        const shipped = Object.values(DICTS)
            .map((dict) => dict['journal.template.notes']?.toLowerCase())
            .filter((value): value is string => !!value);
        for (const heading of shipped) expect(NOTES_HEADINGS).toContain(heading);
    });
});

describe('keptOn', () => {
    const trackers = [CHECK, SCALE, NUMBER];

    it('counts the habits a day reached the goal on', () => {
        const day = entry('2026-07-01', { read: true, mood: 5, water: 3 });
        // read ticked, mood 5 clears the goal of 4, water 3 falls short of 8.
        expect(keptOn(day, trackers)).toEqual({ kept: 2, total: 3 });
    });

    it('reports the total even for a day with no note', () => {
        expect(keptOn(undefined, trackers)).toEqual({ kept: 0, total: 3 });
    });

    it('is zero out of zero when nothing is configured', () => {
        expect(keptOn(entry('2026-07-01', { read: true }), [])).toEqual({ kept: 0, total: 0 });
    });

    it('ignores values whose tracker is gone', () => {
        // A renamed tracker leaves its old key in the note; it must not count.
        const day = entry('2026-07-01', { removed: true, read: true });
        expect(keptOn(day, trackers).kept).toBe(1);
    });
});

describe('runsOfFlags', () => {
    it('joins consecutive kept days', () => {
        expect(runsOfFlags([true, true, true, false, true, true])).toEqual([
            { from: 0, to: 2 },
            { from: 4, to: 5 },
        ]);
    });

    it('leaves a lone day unconnected — it has nothing to connect to', () => {
        expect(runsOfFlags([true, false, true])).toEqual([]);
    });

    it('closes a run that reaches the end', () => {
        expect(runsOfFlags([false, true, true])).toEqual([{ from: 1, to: 2 }]);
    });

    it('handles the empty and the entirely full case', () => {
        expect(runsOfFlags([])).toEqual([]);
        expect(runsOfFlags([true, true])).toEqual([{ from: 0, to: 1 }]);
    });

    it('agrees with the month grid about what a streak is', () => {
        const month = habitMonth(
            byDateOf([
                entry('2026-07-01', { read: true }),
                entry('2026-07-02', { read: true }),
                entry('2026-07-04', { read: true }),
            ]),
            [CHECK],
            '2026-07-10',
            TODAY
        );
        const flags = month.rows[0].cells.map((cell) => cell.state === 'done');
        expect(runsOfFlags(flags)).toEqual(month.rows[0].runs);
    });
});
