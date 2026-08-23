import { describe, it, expect } from 'vitest';
import {
    entriesByDate,
    isJournalled,
    currentStreak,
    longestStreak,
    journalStats,
} from '../src/modules/journal/services/journalStats';
import type { JournalTracker } from '../src/core/journalConfig';
import type { JournalEntry } from '../src/store/journalSlice';

const entry = (date: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
    date,
    filePath: `J/${date}.md`,
    values: {},
    tags: [],
    body: '',
    words: 0,
    mtime: 0,
    ...over,
});

const MOOD: JournalTracker = {
    id: 'mood',
    label: 'Mood',
    icon: 'smile',
    color: '#eab308',
    kind: 'scale',
};
const SPORT: JournalTracker = {
    id: 'sport',
    label: 'Exercise',
    icon: 'dumbbell',
    color: '#ef4444',
    kind: 'check',
};
const WATER: JournalTracker = {
    id: 'water',
    label: 'Water',
    icon: 'droplet',
    color: '#3b82f6',
    kind: 'number',
    step: 1,
    max: 8,
};
const ALL = [MOOD, SPORT, WATER];

const statFor = (result: ReturnType<typeof journalStats>, id: string) =>
    result.trackers.find((s) => s.tracker.id === id)!;

describe('isJournalled', () => {
    it('counts a day with words or any recorded value', () => {
        expect(isJournalled(entry('2026-07-28', { words: 12 }))).toBe(true);
        expect(isJournalled(entry('2026-07-28', { values: { mood: 3 } }))).toBe(true);
        expect(isJournalled(entry('2026-07-28', { values: { sport: true } }))).toBe(true);
        expect(isJournalled(entry('2026-07-28', { values: { water: 0 } }))).toBe(true);
    });

    it('does not count an empty note, so clicking through the calendar cannot pad a streak', () => {
        expect(isJournalled(entry('2026-07-28'))).toBe(false);
        expect(isJournalled(undefined)).toBe(false);
    });
});

describe('entriesByDate', () => {
    it('indexes entries by day', () => {
        const map = entriesByDate([entry('2026-07-27'), entry('2026-07-28')]);
        expect(map.size).toBe(2);
        expect(map.get('2026-07-28')?.filePath).toBe('J/2026-07-28.md');
    });

    it('keeps the most recently edited file when two claim the same day', () => {
        const map = entriesByDate([
            entry('2026-07-28', { filePath: 'old.md', mtime: 10 }),
            entry('2026-07-28', { filePath: 'new.md', mtime: 20 }),
        ]);
        expect(map.get('2026-07-28')?.filePath).toBe('new.md');
    });
});

describe('currentStreak', () => {
    const today = '2026-07-28';

    it('counts consecutive journalled days ending today', () => {
        const map = entriesByDate([
            entry('2026-07-26', { words: 5 }),
            entry('2026-07-27', { words: 5 }),
            entry('2026-07-28', { words: 5 }),
        ]);
        expect(currentStreak(map, today)).toBe(3);
    });

    it('survives an unwritten today — the day is not over yet', () => {
        const map = entriesByDate([
            entry('2026-07-26', { words: 5 }),
            entry('2026-07-27', { words: 5 }),
        ]);
        expect(currentStreak(map, today)).toBe(2);
    });

    it('breaks after two blank days', () => {
        const map = entriesByDate([
            entry('2026-07-25', { words: 5 }),
            entry('2026-07-26', { words: 5 }),
        ]);
        expect(currentStreak(map, today)).toBe(0);
    });

    it('is zero for an empty journal', () => {
        expect(currentStreak(new Map(), today)).toBe(0);
    });
});

describe('longestStreak', () => {
    it('finds the longest run anywhere in the history', () => {
        const map = entriesByDate([
            entry('2026-07-01', { words: 1 }),
            entry('2026-07-02', { words: 1 }),
            entry('2026-07-03', { words: 1 }),
            entry('2026-07-04', { words: 1 }),
            // gap
            entry('2026-07-10', { words: 1 }),
            entry('2026-07-11', { words: 1 }),
        ]);
        expect(longestStreak(map)).toBe(4);
    });

    it('ignores empty notes inside a run', () => {
        const map = entriesByDate([
            entry('2026-07-01', { words: 1 }),
            entry('2026-07-02'), // empty — breaks the run
            entry('2026-07-03', { words: 1 }),
        ]);
        expect(longestStreak(map)).toBe(1);
    });
});

describe('journalStats', () => {
    const today = '2026-07-28';

    it('averages a scale over the days that recorded it, not over the window', () => {
        const stats = journalStats(
            [
                entry('2026-07-28', { values: { mood: 5 }, words: 10 }),
                entry('2026-07-27', { values: { mood: 3 }, words: 10 }),
                // 28 days with nothing — they must not drag the average to ~0.
            ],
            ALL,
            today,
            30
        );
        expect(statFor(stats, 'mood').average).toBe(4);
        expect(statFor(stats, 'mood').days).toBe(2);
        expect(stats.inRange).toBe(2);
    });

    it('reports a null average rather than zero when nothing was recorded', () => {
        const stats = journalStats([entry('2026-07-28', { words: 40 })], ALL, today, 30);
        expect(statFor(stats, 'mood').average).toBeNull();
        expect(statFor(stats, 'mood').days).toBe(0);
    });

    it('gives a check tracker a rate and no average', () => {
        const stats = journalStats(
            [
                entry('2026-07-28', { values: { sport: true } }),
                entry('2026-07-27', { values: { sport: true } }),
            ],
            ALL,
            today,
            10
        );
        const sport = statFor(stats, 'sport');
        expect(sport.total).toBe(2);
        expect(sport.rate).toBeCloseTo(0.2);
        // An average of 1.0 would be true and useless — a habit is a rate.
        expect(sport.average).toBeNull();
    });

    it('totals a number tracker and averages it over the days it was recorded', () => {
        const stats = journalStats(
            [
                entry('2026-07-28', { values: { water: 6 } }),
                entry('2026-07-27', { values: { water: 4 } }),
            ],
            ALL,
            today,
            30
        );
        const water = statFor(stats, 'water');
        expect(water.total).toBe(10);
        expect(water.average).toBe(5);
        expect(water.days).toBe(2);
    });

    it('keeps a recorded zero distinct from an unrecorded day', () => {
        const stats = journalStats([entry('2026-07-28', { values: { water: 0 } })], ALL, today, 7);
        const water = statFor(stats, 'water');
        expect(water.days).toBe(1);
        expect(water.average).toBe(0);
        expect(water.series[6].value).toBe(0);
    });

    it('returns one series point per day of the window, oldest first', () => {
        const stats = journalStats([entry('2026-07-28', { values: { mood: 4 } })], ALL, today, 7);
        const mood = statFor(stats, 'mood');
        expect(mood.series).toHaveLength(7);
        expect(mood.series[0]).toEqual({ date: '2026-07-22', value: null });
        expect(mood.series[6]).toEqual({ date: today, value: 4 });
    });

    it('scales a number series against its target, or its own peak when higher', () => {
        const stats = journalStats([entry('2026-07-28', { values: { water: 12 } })], ALL, today, 7);
        // The configured target is 8; a day that beat it must not overflow the bar.
        expect(statFor(stats, 'water').scaleMax).toBe(12);
    });

    it('counts words and entries only inside the window', () => {
        const stats = journalStats(
            [
                entry('2026-07-28', { words: 100 }),
                entry('2026-01-01', { words: 999 }), // long before the window
            ],
            ALL,
            today,
            7
        );
        expect(stats.words).toBe(100);
        expect(stats.inRange).toBe(1);
        expect(stats.total).toBe(2); // all-time still sees both
    });

    it('produces no tracker rows when nothing is configured', () => {
        const stats = journalStats([entry('2026-07-28', { words: 5 })], [], today, 7);
        expect(stats.trackers).toEqual([]);
        expect(stats.inRange).toBe(1);
    });

    describe('last entry', () => {
        it('reports the most recent journalled day', () => {
            const stats = journalStats(
                [
                    entry('2026-07-20', { words: 5 }),
                    entry('2026-07-26', { words: 5 }),
                    entry('2026-07-22', { words: 5 }),
                ],
                ALL,
                today,
                30
            );
            expect(stats.lastEntryDate).toBe('2026-07-26');
        });

        it('looks past the window, which is when the question actually matters', () => {
            // An empty window is exactly when "when did I last write?" is worth
            // asking; answering "—" there would be useless.
            const stats = journalStats([entry('2026-01-05', { words: 5 })], ALL, today, 7);
            expect(stats.inRange).toBe(0);
            expect(stats.lastEntryDate).toBe('2026-01-05');
        });

        it('ignores empty notes, the same as the streak does', () => {
            const stats = journalStats(
                [entry('2026-07-20', { words: 5 }), entry('2026-07-27')],
                ALL,
                today,
                30
            );
            expect(stats.lastEntryDate).toBe('2026-07-20');
        });

        it('is null when nothing has been written', () => {
            expect(journalStats([], ALL, today, 30).lastEntryDate).toBeNull();
        });
    });
});
