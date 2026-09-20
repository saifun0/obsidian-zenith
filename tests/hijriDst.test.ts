// Set before anything imports a Date-using module: this file exists to check
// behaviour in a zone that observes daylight saving, and the machine running
// the suite probably does not. Vitest gives each test file its own worker, so
// this does not leak into the rest of the suite.
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { hijriDate } from '../src/modules/prayer/hijri';

/**
 * The Hijri offset, on the one day a year a day is not 86,400,000 ms long.
 *
 * The offset exists because a mosque may start the month a day either side of
 * the arithmetic, so it shifts the date before it is read. It used to shift by
 * adding a day's worth of milliseconds to the timestamp — which on the date a
 * zone falls back lands at 23:00 on the SAME calendar day, so the offset
 * quietly did nothing.
 *
 * The previous test for the offset could not catch this: it built its expected
 * "tomorrow" by adding the same milliseconds, so it only ever checked that the
 * function agreed with itself, and its fixed date was nowhere near a
 * transition.
 */

/** 2 Nov 2025: the day the US falls back, and therefore 25 hours long. */
const FALL_BACK = new Date(2025, 10, 2);
const NEXT_DAY = new Date(2025, 10, 3);

describe('the Hijri offset across a DST transition', () => {
    it('runs in a zone that actually has one', () => {
        // If this fails, the rest of the file proves nothing.
        //
        // Asserted on the arithmetic rather than on `getTimezoneOffset`, which
        // under a TZ set at runtime keeps reporting the offset the process
        // started with even while date maths honours the transition. What
        // matters here is the transition, so that is what is checked: a day's
        // worth of milliseconds added to this local midnight must NOT reach
        // the next calendar day.
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
        expect(new Date(FALL_BACK.getTime() + 86_400_000).getDate()).toBe(FALL_BACK.getDate());
    });

    it('is available in this runtime at all', () => {
        // `hijriDate` returns null when the runtime has no Islamic calendar,
        // and a null would make every assertion below vacuously true.
        expect(hijriDate(FALL_BACK, 0)).not.toBeNull();
    });

    it('moves the date by a whole day, even on the long one', () => {
        const plain = hijriDate(FALL_BACK, 0);
        const offset = hijriDate(FALL_BACK, 1);

        expect(offset).not.toEqual(plain);
        // And it lands exactly where reading the next day plainly would.
        expect(offset).toEqual(hijriDate(NEXT_DAY, 0));
    });

    it('moves backwards across the same boundary', () => {
        expect(hijriDate(NEXT_DAY, -1)).toEqual(hijriDate(FALL_BACK, 0));
    });
});
