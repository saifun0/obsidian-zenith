import { describe, it, expect } from 'vitest';
import type { JournalEntry } from '../src/store/journalSlice';
import {
    currentStreak,
    dayOf,
    hasAnyRecord,
    isComplete,
    longestStreak,
    performedCount,
    prayerDaysByDate,
    prayerStats,
    readPrayerDay,
    recentDays,
} from '../src/modules/prayer/prayerStats';
import { parsePrayerStatus } from '../src/modules/prayer/prayerConfig';

const TODAY = '2026-08-09';

/** A parsed daily note carrying the given frontmatter. */
function entry(
    date: string,
    texts: Record<string, string> = {},
    values: Record<string, number | boolean> = {}
): JournalEntry {
    return {
        date,
        filePath: `journal/${date}.md`,
        values,
        texts,
        tags: [],
        body: '',
        words: 0,
        mtime: 1,
    };
}

/** A day with all five prayers performed. */
const fullDay = (date: string) =>
    entry(date, { fajr: 'ontime', dhuhr: 'ontime', asr: 'ontime', maghrib: 'ontime', isha: 'late' });

describe('reading a status', () => {
    it('accepts what Zenith writes', () => {
        expect(parsePrayerStatus('ontime')).toBe('ontime');
        expect(parsePrayerStatus('late')).toBe('late');
        expect(parsePrayerStatus('missed')).toBe('missed');
    });

    it('accepts what a person types', () => {
        // The whole point of a plain-text log is that it can be filled in by
        // hand, in either language, by someone who has never read the schema.
        expect(parsePrayerStatus('X')).toBe('ontime');
        expect(parsePrayerStatus(' Done ')).toBe('ontime');
        expect(parsePrayerStatus('вовремя')).toBe('ontime');
        expect(parsePrayerStatus('када')).toBe('late');
        expect(parsePrayerStatus('пропущен')).toBe('missed');
        expect(parsePrayerStatus(true)).toBe('ontime');
    });

    it('reads the retired congregation status as on time', () => {
        // Notes written while it was a status of its own still say so, and
        // those prayers were performed on time.
        expect(parsePrayerStatus('jamaah')).toBe('ontime');
        expect(parsePrayerStatus('мечеть')).toBe('ontime');
        expect(parsePrayerStatus('джамаат')).toBe('ontime');
    });

    it('treats nothing, gibberish and false as unrecorded', () => {
        // `false` is a leftover, not a confession: the writer deletes a key
        // rather than writing one.
        expect(parsePrayerStatus(false)).toBeUndefined();
        expect(parsePrayerStatus('')).toBeUndefined();
        expect(parsePrayerStatus(null)).toBeUndefined();
        expect(parsePrayerStatus('probably')).toBeUndefined();
    });
});

describe('reading a day', () => {
    it('reads statuses from strings and from hand-written booleans', () => {
        const day = readPrayerDay(entry(TODAY, { fajr: 'late' }, { dhuhr: true }), TODAY);
        expect(day.statuses.fajr).toBe('late');
        expect(day.statuses.dhuhr).toBe('ontime');
        expect(day.statuses.asr).toBeUndefined();
        expect(day.hasNote).toBe(true);
    });

    it('picks up the voluntary prayers', () => {
        const day = readPrayerDay(entry(TODAY, {}, { witr: true, tahajjud: false }), TODAY);
        expect(day.extras.witr).toBe(true);
        expect(day.extras.tahajjud).toBeUndefined();
    });

    it('returns an empty day for a date with no note', () => {
        const day = readPrayerDay(undefined, TODAY);
        expect(day.hasNote).toBe(false);
        expect(hasAnyRecord(day)).toBe(false);
        expect(performedCount(day)).toBe(0);
    });

    it('counts a missed prayer as recorded but not performed', () => {
        const day = readPrayerDay(entry(TODAY, { fajr: 'missed', dhuhr: 'ontime' }), TODAY);
        expect(hasAnyRecord(day)).toBe(true);
        expect(performedCount(day)).toBe(1);
        expect(isComplete(day)).toBe(false);
    });

    it('keeps the most recently edited note when two claim a day', () => {
        const stale = { ...entry(TODAY, { fajr: 'missed' }), filePath: 'a.md', mtime: 1 };
        const fresh = { ...entry(TODAY, { fajr: 'ontime' }), filePath: 'b.md', mtime: 2 };
        const days = prayerDaysByDate([stale, fresh]);
        expect(dayOf(days, TODAY).statuses.fajr).toBe('ontime');
    });
});

describe('streaks', () => {
    it('counts consecutive complete days', () => {
        const days = prayerDaysByDate([
            fullDay('2026-08-07'),
            fullDay('2026-08-08'),
            fullDay(TODAY),
        ]);
        expect(currentStreak(days, TODAY)).toBe(3);
    });

    it("doesn't break the streak on an unfinished today", () => {
        // Isha hasn't come in for most of the day — a streak that collapsed
        // every morning would measure nothing but the time of day.
        const days = prayerDaysByDate([
            fullDay('2026-08-07'),
            fullDay('2026-08-08'),
            entry(TODAY, { fajr: 'ontime', dhuhr: 'ontime' }),
        ]);
        expect(currentStreak(days, TODAY)).toBe(2);
    });

    it('ends the streak on a gap, and on a day with a missed prayer', () => {
        const gap = prayerDaysByDate([fullDay('2026-08-05'), fullDay(TODAY)]);
        expect(currentStreak(gap, TODAY)).toBe(1);

        const missed = prayerDaysByDate([
            fullDay('2026-08-07'),
            entry('2026-08-08', {
                fajr: 'missed',
                dhuhr: 'ontime',
                asr: 'ontime',
                maghrib: 'ontime',
                isha: 'ontime',
            }),
            fullDay(TODAY),
        ]);
        expect(currentStreak(missed, TODAY)).toBe(1);
    });

    it('remembers the longest run on record', () => {
        const days = prayerDaysByDate([
            fullDay('2026-07-01'),
            fullDay('2026-07-02'),
            fullDay('2026-07-03'),
            fullDay('2026-07-05'),
            fullDay(TODAY),
        ]);
        expect(longestStreak(days)).toBe(3);
        expect(currentStreak(days, TODAY)).toBe(1);
    });
});

describe('prayerStats over a window', () => {
    const entries = [
        fullDay('2026-08-07'),
        entry('2026-08-08', { fajr: 'missed', dhuhr: 'ontime', asr: 'ontime' }),
        entry(TODAY, { fajr: 'ontime', dhuhr: 'late' }),
    ];

    it('measures against the whole window, not against the days filled in', () => {
        // 5 + 2 + 2 = 9 prayers performed out of 7 days × 5.
        const stats = prayerStats(entries, TODAY, 7);
        expect(stats.counts.performed).toBe(9);
        expect(stats.rate).toBeCloseTo(9 / 35, 5);
        expect(stats.activeDays).toBe(3);
        expect(stats.completeDays).toBe(1);
    });

    it('separates missed from never recorded', () => {
        const stats = prayerStats(entries, TODAY, 7);
        expect(stats.counts.missed).toBe(1);
        // 9 performed + 1 missed — the other 25 slots said nothing at all.
        expect(stats.counts.recorded).toBe(10);
    });

    it('reports punctuality as a share of what was actually prayed', () => {
        const stats = prayerStats(entries, TODAY, 7);
        // 7 on time out of 9 performed; the two `late` ones don't count.
        expect(stats.counts.ontime).toBe(7);
        expect(stats.counts.late).toBe(2);
        expect(stats.punctuality).toBeCloseTo(7 / 9, 5);
    });

    it('ignores days outside the window', () => {
        const withOld = [...entries, fullDay('2026-01-01')];
        expect(prayerStats(withOld, TODAY, 7).counts.performed).toBe(9);
        // …but the all-time streak still sees them.
        expect(prayerStats(withOld, TODAY, 7).longestStreak).toBe(1);
    });

    it('survives an empty history', () => {
        const stats = prayerStats([], TODAY, 30);
        expect(stats.rate).toBe(0);
        expect(stats.punctuality).toBe(0);
        expect(stats.currentStreak).toBe(0);
        expect(stats.counts.recorded).toBe(0);
        expect(stats.activeDays).toBe(0);
    });
});

describe('recentDays', () => {
    it('returns the window oldest first, filling the gaps', () => {
        const days = prayerDaysByDate([fullDay(TODAY)]);
        const strip = recentDays(days, TODAY, 3);
        expect(strip.map((d) => d.date)).toEqual(['2026-08-07', '2026-08-08', TODAY]);
        expect(strip[0].hasNote).toBe(false);
        expect(isComplete(strip[2])).toBe(true);
    });
});
