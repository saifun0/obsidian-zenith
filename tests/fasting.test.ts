import { describe, it, expect } from 'vitest';
import {
    fastChoices,
    fastCountdown,
    fastsByDate,
    parseFast,
    qadaCount,
    ramadanProgress,
    voluntaryHint,
    type FastKind,
} from '../src/modules/prayer/fasting';
import type { JournalEntry } from '../src/store/journalSlice';

// Umm al-Qura, as the platform's calendar has it: 1 Ramadan 1447 is
// 18 February 2026, and Eid al-Fitr 20 March.

describe('parseFast', () => {
    it('reads each kind, in either language', () => {
        expect(parseFast('ramadan')).toBe('ramadan');
        expect(parseFast(' Каза ')).toBe('qada');
        expect(parseFast('нафль')).toBe('nafl');
        expect(parseFast('broken')).toBe('broken');
        expect(parseFast('excused')).toBe('excused');
        expect(parseFast('maybe')).toBeUndefined();
        expect(parseFast(true)).toBeUndefined();
    });

    it('comes from the day’s note', () => {
        const entries = [
            { date: '2026-02-18', texts: { fast: 'ramadan' } },
            { date: '2026-02-19', texts: {} },
        ] as unknown as JournalEntry[];
        expect([...fastsByDate(entries)]).toEqual([['2026-02-18', 'ramadan']]);
    });
});

describe('ramadanProgress', () => {
    const fasts = new Map<string, FastKind>([
        ['2026-02-18', 'ramadan'],
        ['2026-02-19', 'excused'],
    ]);

    it('says which day of Ramadan it is, of how many, and what was kept', () => {
        expect(ramadanProgress(fasts, '2026-02-20')).toEqual({
            day: 3,
            length: 30,
            fasted: 1,
            broken: 0,
            excused: 1,
            // The third day, not yet written: unrecorded, not missed.
            unrecorded: 1,
        });
    });

    it('is nothing outside Ramadan', () => {
        expect(ramadanProgress(fasts, '2026-03-20')).toBeNull();
    });
});

describe('qadaCount', () => {
    it('counts the fasts made up', () => {
        const fasts = new Map<string, FastKind>([
            ['2026-04-01', 'qada'],
            ['2026-04-02', 'nafl'],
            ['2026-04-03', 'qada'],
        ]);
        expect(qadaCount(fasts)).toBe(2);
    });
});

describe('voluntaryHint', () => {
    it.each([
        ['2026-05-26', 'arafah'],
        ['2026-06-25', 'ashura'],
        ['2026-04-30', 'whiteDays'], // 13 Dhu al-Qa'dah, a Thursday: the white day wins
        ['2026-06-01', 'whiteDays'], // 15 Dhu al-Hijjah, a Monday
        ['2026-04-27', 'monThu'],
    ])('%s is %s', (date, hint) => {
        expect(voluntaryHint(date)).toBe(hint);
    });

    it.each([
        ['2026-02-26', 'in Ramadan'],
        ['2026-03-20', 'Eid al-Fitr'],
        ['2026-05-27', 'Eid al-Adha'],
        ['2026-05-30', 'the 13th of Dhu al-Hijjah — a day of Tashriq, not a white day'],
    ])('offers nothing on %s (%s)', (date) => {
        expect(voluntaryHint(date)).toBeNull();
    });
});

describe('fastChoices', () => {
    it('offers Ramadan’s choices in Ramadan, and the year’s otherwise', () => {
        expect(fastChoices('2026-02-20')).toEqual(['ramadan', 'broken', 'excused']);
        expect(fastChoices('2026-04-27')).toEqual(['qada', 'nafl']);
    });
});

describe('fastCountdown', () => {
    const none = new Map<string, FastKind>();
    const maghrib = { id: 'maghrib', minutesAway: 90, tomorrow: false };
    const fajrToday = { id: 'fajr', minutesAway: 120, tomorrow: false };
    const fajrTomorrow = { id: 'fajr', minutesAway: 400, tomorrow: true };

    it('calls maghrib iftar in Ramadan, and fajr the end of suhoor', () => {
        expect(fastCountdown(maghrib, '2026-02-20', none)).toEqual({
            moment: 'iftar',
            minutesAway: 90,
        });
        expect(fastCountdown(fajrToday, '2026-02-20', none)).toEqual({
            moment: 'suhoor',
            minutesAway: 120,
        });
    });

    it('does so on any day whose note records a fast', () => {
        const fasts = new Map<string, FastKind>([['2026-04-27', 'nafl']]);
        expect(fastCountdown(maghrib, '2026-04-27', fasts)?.moment).toBe('iftar');
        expect(fastCountdown(maghrib, '2026-04-28', fasts)).toBeNull();
    });

    it('asks tomorrow about fajr after isha', () => {
        // The last evening of Sha'ban: tomorrow is 1 Ramadan.
        expect(fastCountdown(fajrTomorrow, '2026-02-17', none)?.moment).toBe('suhoor');
        // The last evening of Ramadan: tomorrow is Eid.
        expect(fastCountdown(fajrTomorrow, '2026-03-19', none)).toBeNull();
    });

    it('stays quiet on a Ramadan day recorded as not fasted', () => {
        const fasts = new Map<string, FastKind>([['2026-02-20', 'excused']]);
        expect(fastCountdown(maghrib, '2026-02-20', fasts)).toBeNull();
    });

    it('counts to imsak, and gives fajr back once imsak has passed', () => {
        expect(fastCountdown(fajrToday, '2026-02-20', none, 0, 10)?.minutesAway).toBe(110);
        const close = { id: 'fajr', minutesAway: 5, tomorrow: false };
        expect(fastCountdown(close, '2026-02-20', none, 0, 10)).toBeNull();
    });

    it('leaves the other prayers alone', () => {
        const asr = { id: 'asr', minutesAway: 30, tomorrow: false };
        expect(fastCountdown(asr, '2026-02-20', none)).toBeNull();
    });
});
