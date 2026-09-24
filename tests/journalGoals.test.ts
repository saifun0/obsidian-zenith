import { describe, it, expect } from 'vitest';
import {
    goalChanged,
    goalOn,
    isRestWord,
    meetsGoal,
    withGoalHistory,
    withoutGoalExtensions,
    type JournalTracker,
} from '../src/core/journalConfig';
import {
    dayState,
    habitMonth,
    longestRun,
    runsOf,
    weekStartOf,
    weeklyReading,
    type HabitCell,
} from '../src/modules/journal/services/habitMonth';
import { journalStats } from '../src/modules/journal/services/journalStats';
import { usableTrackers } from '../src/modules/journal/services/usableTrackers';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import type { JournalEntry } from '../src/store/journalSlice';

const SPORT: JournalTracker = {
    id: 'sport',
    label: 'Sport',
    icon: 'dumbbell',
    color: '#f00',
    kind: 'check',
};
const COFFEE: JournalTracker = {
    id: 'coffee',
    label: 'Coffee',
    icon: 'coffee',
    color: '#a52',
    kind: 'number',
    max: 2,
    goalDirection: 'atMost',
};
const SMOKING: JournalTracker = {
    id: 'smoke',
    label: 'Smoking',
    icon: 'x',
    color: '#555',
    kind: 'check',
    mode: 'quit',
};

function entry(
    date: string,
    values: Record<string, unknown>,
    texts: Record<string, string> = {},
    words = 10
): JournalEntry {
    return {
        date,
        filePath: `journal/${date}.md`,
        values: values as JournalEntry['values'],
        texts,
        tags: [],
        body: '',
        words,
        mtime: 0,
    } as JournalEntry;
}
const byDate = (entries: JournalEntry[]) => new Map(entries.map((e) => [e.date, e]));
const cells = (states: HabitCell['state'][]): HabitCell[] =>
    states.map((state, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        day: i + 1,
        state,
        fill: 0,
    }));

describe('limits — at most', () => {
    it('is kept by staying under, zero included', () => {
        expect(meetsGoal(COFFEE, 0)).toBe(true);
        expect(meetsGoal(COFFEE, 2)).toBe(true);
        expect(meetsGoal(COFFEE, 3)).toBe(false);
        // Nothing recorded is not a kept limit: nobody said.
        expect(meetsGoal(COFFEE, undefined)).toBe(false);
    });

    it('reads a limit gone over as a miss, not a partial day', () => {
        expect(
            dayState(COFFEE, entry('2026-09-10', { coffee: 3 }), '2026-09-10', '2026-09-20')
        ).toBe('miss');
        expect(
            dayState(COFFEE, entry('2026-09-10', { coffee: 1 }), '2026-09-10', '2026-09-20')
        ).toBe('done');
    });
});

describe('goal history — changing a goal does not rewrite the past', () => {
    const weekly3: JournalTracker = { ...SPORT, goalPeriod: 'week', goalCount: 3 };

    it('keeps the old goal until yesterday', () => {
        const raised = withGoalHistory(weekly3, { ...weekly3, goalCount: 5 }, '2026-09-19');
        expect(raised.goalHistory).toEqual([
            { until: '2026-09-19', goalPeriod: 'week', goalCount: 3 },
        ]);
        expect(goalOn(raised, '2026-09-10').goalCount).toBe(3);
        expect(goalOn(raised, '2026-09-20').goalCount).toBe(5);
    });

    it('records the goal before today only once, however often it is edited today', () => {
        const once = withGoalHistory(weekly3, { ...weekly3, goalCount: 5 }, '2026-09-19');
        const twice = withGoalHistory(once, { ...once, goalCount: 4 }, '2026-09-19');
        expect(twice.goalHistory).toHaveLength(1);
        expect(goalOn(twice, '2026-09-19').goalCount).toBe(3);
    });

    it('records nothing for an edit that leaves the goal alone', () => {
        expect(
            withGoalHistory(weekly3, { ...weekly3, label: 'Gym' }, '2026-09-19').goalHistory
        ).toBeUndefined();
        expect(goalChanged(weekly3, { ...weekly3, color: '#000' })).toBe(false);
    });

    it('judges a past day by the limit it had', () => {
        const tighter = withGoalHistory(COFFEE, { ...COFFEE, max: 1 }, '2026-09-19');
        expect(meetsGoal(tighter, 2, '2026-09-10')).toBe(true);
        expect(meetsGoal(tighter, 2, '2026-09-21')).toBe(false);
    });
});

describe('rest days', () => {
    const resting = { ...SPORT, restDays: true };

    it('reads the rest words in either language', () => {
        expect(isRestWord('rest')).toBe(true);
        expect(isRestWord(' Отдых ')).toBe(true);
        expect(isRestWord('done')).toBe(false);
    });

    it('marks a day of rest only while rest days are honoured', () => {
        const day = entry('2026-09-10', {}, { sport: 'rest' });
        expect(dayState(resting, day, '2026-09-10', '2026-09-20')).toBe('rest');
        expect(dayState(SPORT, day, '2026-09-10', '2026-09-20')).toBe('miss');
    });

    it('neither breaks a streak nor adds to it', () => {
        expect(longestRun(cells(['done', 'done', 'rest', 'done', 'miss', 'done']))).toBe(3);
        expect(longestRun(cells(['rest', 'rest']))).toBe(0);
    });

    it('carries a run across it without starting or ending one on it', () => {
        expect(runsOf(cells(['rest', 'done', 'rest', 'done', 'rest']))).toEqual([
            { from: 1, to: 3 },
        ]);
        expect(runsOf(cells(['done', 'rest', 'miss']))).toEqual([]);
    });
});

describe('habits to quit', () => {
    it('counts a recorded day without the habit as kept, and an unrecorded one as nothing', () => {
        expect(dayState(SMOKING, entry('2026-09-10', {}), '2026-09-10', '2026-09-20')).toBe('done');
        expect(
            dayState(SMOKING, entry('2026-09-10', { smoke: true }), '2026-09-10', '2026-09-20')
        ).toBe('miss');
        expect(dayState(SMOKING, undefined, '2026-09-10', '2026-09-20')).toBe('empty');
        expect(dayState(SMOKING, entry('2026-09-10', {}, {}, 0), '2026-09-10', '2026-09-20')).toBe(
            'empty'
        );
    });

    it('rates over the recorded days, not the calendar', () => {
        const entries = [
            entry('2026-09-01', {}),
            entry('2026-09-02', { smoke: true }),
            entry('2026-09-03', {}),
            entry('2026-09-04', {}),
        ];
        const row = habitMonth(byDate(entries), [SMOKING], '2026-09-10', '2026-09-10').rows[0];
        expect(row.done).toBe(3);
        expect(row.recorded).toBe(4);
        expect(row.rate).toBe(0.75);
    });

    it('says the same in the statistics: kept of recorded', () => {
        const entries = [entry('2026-09-19', {}), entry('2026-09-20', { smoke: true })];
        const stat = journalStats(entries, [SMOKING], '2026-09-20', 30).trackers[0];
        expect(stat.quit).toEqual({ kept: 1, recorded: 2 });
    });
});

describe('weekly goals', () => {
    const gym: JournalTracker = { ...SPORT, goalPeriod: 'week', goalCount: 3 };

    it('finds the first day of the week either way round', () => {
        // 2026-09-24 is a Thursday.
        expect(weekStartOf('2026-09-24', 'mon')).toBe('2026-09-21');
        expect(weekStartOf('2026-09-24', 'sun')).toBe('2026-09-20');
    });

    it('keeps a week on its count of days, and runs weeks together', () => {
        const days = (dates: string[]) => dates.map((d) => entry(d, { sport: true }));
        const entries = [
            ...days(['2026-09-07', '2026-09-09', '2026-09-11']), // kept
            ...days(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-19']), // kept
            ...days(['2026-09-21']), // this week, open, 1 of 3
        ];
        const month = Array.from(
            { length: 24 },
            (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`
        );
        const reading = weeklyReading(byDate(entries), gym, month, '2026-09-24', 'mon');
        expect(reading.current).toMatchObject({
            start: '2026-09-21',
            done: 1,
            count: 3,
            met: false,
            open: true,
        });
        // The open week is not yet a failure: the run still stands.
        expect(reading.run).toBe(2);
    });

    it('judges each week by the count it had', () => {
        const raised = withGoalHistory(gym, { ...gym, goalCount: 5 }, '2026-09-13');
        const entries = ['2026-09-07', '2026-09-09', '2026-09-11'].map((d) =>
            entry(d, { sport: true })
        );
        const reading = weeklyReading(byDate(entries), raised, ['2026-09-07'], '2026-09-24', 'mon');
        expect(reading.weeks[0]).toMatchObject({ count: 3, met: true });
    });
});

describe('usableTrackers — off means off', () => {
    const tracker: JournalTracker = { ...COFFEE, goalPeriod: 'week', goalCount: 2, mode: 'quit' };
    const settings = { ...DEFAULT_SETTINGS, journalTrackers: [tracker] };

    it('keeps goals and quitting while their features are on, and honours rest days', () => {
        const [t] = usableTrackers(settings);
        expect(t).toMatchObject({
            goalPeriod: 'week',
            goalDirection: 'atMost',
            mode: 'quit',
            restDays: true,
        });
    });

    it('sets them aside, not deletes them, while off', () => {
        const [t] = usableTrackers({
            ...settings,
            features: { ...settings.features, 'journal.goals': false, 'journal.quitHabits': false },
        });
        expect(t.goalPeriod).toBeUndefined();
        expect(t.goalDirection).toBeUndefined();
        expect(t.mode).toBeUndefined();
        expect(t.restDays).toBeUndefined();
        // The saved tracker is untouched.
        expect(settings.journalTrackers[0].goalPeriod).toBe('week');
    });

    it('strips every goal extension for the plain reading', () => {
        expect(withoutGoalExtensions(tracker)).not.toHaveProperty('goalCount');
    });
});
