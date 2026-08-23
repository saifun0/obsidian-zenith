import { describe, it, expect } from 'vitest';
import { hijriDate, hijriMonthKey, isRamadan, RAMADAN_MONTH } from '../src/modules/prayer/hijri';

/**
 * The Hijri date comes from the platform, so these tests check the wrapper —
 * that the offset is applied, that an unsupported runtime degrades to null
 * instead of handing back a Gregorian date in disguise, and that the shape is
 * what the UI expects.
 *
 * A runtime without the Islamic calendar returns null everywhere, so each test
 * states what must hold in both cases rather than assuming full ICU.
 */

const AUGUST = new Date(2026, 7, 9);
const MS_PER_DAY = 86_400_000;

describe('hijriDate', () => {
    it('returns a plausible date, or null where the calendar is missing', () => {
        const h = hijriDate(AUGUST);
        if (h === null) return;
        expect(h.month).toBeGreaterThanOrEqual(1);
        expect(h.month).toBeLessThanOrEqual(12);
        expect(h.day).toBeGreaterThanOrEqual(1);
        expect(h.day).toBeLessThanOrEqual(30);
        // 2026 CE falls in the 1440s AH; a Gregorian year leaking through would
        // be the exact failure the resolved-calendar check exists to catch.
        expect(h.year).toBeGreaterThan(1400);
        expect(h.year).toBeLessThan(1500);
    });

    it('moves the date by whole days when offset', () => {
        const plain = hijriDate(AUGUST);
        const shifted = hijriDate(AUGUST, 1);
        const tomorrow = hijriDate(new Date(AUGUST.getTime() + MS_PER_DAY));
        if (!plain || !shifted || !tomorrow) return;
        // Shifting the reading by a day is the same as reading the next day —
        // that is what "my mosque starts the month a day later" means.
        expect(shifted).toEqual(tomorrow);
        expect(shifted).not.toEqual(plain);
    });

    it('walks a whole Gregorian year without producing a bad month', () => {
        for (let i = 0; i < 365; i += 7) {
            const h = hijriDate(new Date(2026, 0, 1 + i));
            if (!h) return;
            expect(h.month, `day ${i}`).toBeGreaterThanOrEqual(1);
            expect(h.month, `day ${i}`).toBeLessThanOrEqual(12);
        }
    });
});

describe('isRamadan', () => {
    it('agrees with the month number it reads', () => {
        const h = hijriDate(AUGUST);
        if (!h) {
            // No calendar means no Ramadan claim — the Gulf methods then simply
            // use their ordinary isha interval.
            expect(isRamadan(AUGUST)).toBe(false);
            return;
        }
        expect(isRamadan(AUGUST)).toBe(h.month === RAMADAN_MONTH);
    });

    it('finds Ramadan somewhere in a Gregorian year', () => {
        if (hijriDate(AUGUST) === null) return;
        const found = Array.from({ length: 366 }, (_, i) => new Date(2026, 0, 1 + i)).some((d) =>
            isRamadan(d)
        );
        expect(found).toBe(true);
    });
});

describe('hijriMonthKey', () => {
    it('names the translation key for a month', () => {
        expect(hijriMonthKey(9)).toBe('hijri.month.9');
    });
});
