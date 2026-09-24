import { describe, it, expect } from 'vitest';
import {
    fastChoices,
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
