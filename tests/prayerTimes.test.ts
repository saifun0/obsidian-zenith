import { describe, it, expect } from 'vitest';
import {
    currentPrayer,
    formatClock,
    hasEntered,
    nextPrayer,
    prayerTimes,
    prayerWindows,
    type PrayerCalcOptions,
} from '../src/modules/prayer/prayerTimes';
import { PRAYERS } from '../src/modules/prayer/prayerConfig';
import { statusForTap } from '../src/modules/prayer/prayerActions';

/**
 * The times are asserted as invariants — ordering, the direction each knob
 * moves a time, the size of an offset — rather than against a table of
 * expected minutes.
 *
 * That is deliberate. A hard-coded "fajr is at 02:41" would be checking this
 * implementation against itself: the reference is what a local calendar prints,
 * and matching that to the minute is a job for the per-prayer adjustments in
 * settings, not for a unit test. What a test *can* pin down is that the
 * algorithm doesn't silently invert a sign, drop a timezone or reorder a day.
 */

const MOSCOW = { lat: 55.75, lon: 37.62 };
const MECCA = { lat: 21.42, lon: 39.83 };
const PETERSBURG = { lat: 59.94, lon: 30.31 };
const MURMANSK = { lat: 68.97, lon: 33.08 };

/** Explicit offsets everywhere: the suite must not depend on the machine's zone. */
const base = (over: Partial<PrayerCalcOptions> = {}): PrayerCalcOptions => ({
    method: 'russia',
    asrMadhab: 'hanafi',
    highLatRule: 'angleBased',
    tzOffsetMinutes: 180,
    ...over,
});

const winter = new Date(2026, 0, 15);
const summer = new Date(2026, 5, 21);

describe('prayerTimes — the shape of a day', () => {
    it('orders the day from fajr to isha', () => {
        const { times } = prayerTimes(MOSCOW, winter, base());
        expect(times.fajr).toBeLessThan(times.sunrise);
        expect(times.sunrise).toBeLessThan(times.dhuhr);
        expect(times.dhuhr).toBeLessThan(times.asr);
        expect(times.asr).toBeLessThan(times.maghrib);
        expect(times.maghrib).toBeLessThan(times.isha);
    });

    it('puts dhuhr near the middle of the day', () => {
        // Solar noon in Moscow lands early in the 13th hour in winter; the wide
        // band is what makes this a sanity check rather than a golden value.
        const { times } = prayerTimes(MOSCOW, winter, base());
        expect(times.dhuhr).toBeGreaterThan(11 * 60);
        expect(times.dhuhr).toBeLessThan(14 * 60);
    });

    it('reports the date it computed, from local calendar fields', () => {
        expect(prayerTimes(MOSCOW, winter, base()).date).toBe('2026-01-15');
    });

    it('has nothing invalid at a sane latitude', () => {
        expect(prayerTimes(MECCA, winter, base()).invalid).toEqual([]);
    });

    it('lands on the published sunrise and sunset', () => {
        // The one place a golden value is honest: sunrise and sunset are plain
        // astronomy, published for every city and identical whatever a method
        // says about twilight. If the solar position or the equation of time
        // ever breaks, it breaks here first — every other time is derived from
        // the same two functions.
        const near = (actual: number, hh: number, mm: number) => {
            expect(Math.abs(actual - (hh * 60 + mm))).toBeLessThanOrEqual(2);
        };

        const london = prayerTimes({ lat: 51.5074, lon: -0.1278 }, winter, base({ tzOffsetMinutes: 0 }));
        near(london.times.sunrise, 7, 59);
        near(london.times.sunset, 16, 21);

        const moscow = prayerTimes(MOSCOW, winter, base());
        near(moscow.times.sunrise, 8, 49);
        near(moscow.times.sunset, 16, 29);
    });
});

describe('prayerTimes — the knobs', () => {
    it('starts asr later for the Hanafi shadow length', () => {
        const standard = prayerTimes(MOSCOW, winter, base({ asrMadhab: 'standard' }));
        const hanafi = prayerTimes(MOSCOW, winter, base({ asrMadhab: 'hanafi' }));
        expect(hanafi.times.asr).toBeGreaterThan(standard.times.asr);
        // Only asr moves — the madhab says nothing about the rest of the day.
        expect(hanafi.times.dhuhr).toBe(standard.times.dhuhr);
        expect(hanafi.times.maghrib).toBe(standard.times.maghrib);
    });

    it('brings fajr forward as the angle deepens', () => {
        // ISNA 15° → Russia 16° → MWL 18° → Egypt 19.5°: each waits for a
        // darker sky, so each starts earlier.
        const at = (method: string) => prayerTimes(MECCA, winter, base({ method })).times.fajr;
        expect(at('russia')).toBeLessThan(at('isna'));
        expect(at('mwl')).toBeLessThan(at('russia'));
        expect(at('egypt')).toBeLessThan(at('mwl'));
    });

    it('honours custom angles only for the custom method', () => {
        const custom = prayerTimes(
            MECCA,
            winter,
            base({ method: 'custom', fajrAngle: 19.5, ishaAngle: 17.5 })
        );
        const egypt = prayerTimes(MECCA, winter, base({ method: 'egypt' }));
        expect(custom.times.fajr).toBe(egypt.times.fajr);
        expect(custom.times.isha).toBe(egypt.times.isha);

        // The same angles handed to a fixed method are ignored.
        const ignored = prayerTimes(MECCA, winter, base({ method: 'isna', fajrAngle: 19.5 }));
        expect(ignored.times.fajr).toBe(prayerTimes(MECCA, winter, base({ method: 'isna' })).times.fajr);
    });

    it('sets Umm al-Qura isha a fixed interval after maghrib', () => {
        const normal = prayerTimes(MECCA, winter, base({ method: 'makkah' }));
        expect(normal.times.isha - normal.times.maghrib).toBe(90);

        const ramadan = prayerTimes(MECCA, winter, base({ method: 'makkah', isRamadan: true }));
        expect(ramadan.times.isha - ramadan.times.maghrib).toBe(120);
        // Ramadan moves isha and nothing else.
        expect(ramadan.times.maghrib).toBe(normal.times.maghrib);
    });

    it('waits for deeper twilight for maghrib where the method says so', () => {
        const sunni = prayerTimes(MECCA, winter, base({ method: 'mwl' }));
        const jafari = prayerTimes(MECCA, winter, base({ method: 'jafari' }));
        expect(jafari.times.maghrib).toBeGreaterThan(sunni.times.maghrib);
        // Sunset itself is astronomy, not doctrine — it must not move.
        expect(jafari.times.sunset).toBe(sunni.times.sunset);
    });

    it('applies per-prayer adjustments exactly, and only to their own time', () => {
        const plain = prayerTimes(MOSCOW, winter, base());
        const tuned = prayerTimes(MOSCOW, winter, base({ adjustments: { fajr: -3, isha: 7 } }));
        expect(tuned.times.fajr).toBe(plain.times.fajr - 3);
        expect(tuned.times.isha).toBe(plain.times.isha + 7);
        expect(tuned.times.dhuhr).toBe(plain.times.dhuhr);
    });
});

describe('prayerTimes — place and clock', () => {
    it('shifts the whole day with the timezone offset', () => {
        const msk = prayerTimes(MOSCOW, winter, base({ tzOffsetMinutes: 180 }));
        const shifted = prayerTimes(MOSCOW, winter, base({ tzOffsetMinutes: 120 }));
        for (const id of PRAYERS) {
            expect(msk.times[id] - shifted.times[id]).toBe(60);
        }
    });

    it('shifts the day with longitude, an hour per 15 degrees', () => {
        const west = prayerTimes({ lat: 55.75, lon: 22.62 }, winter, base());
        const east = prayerTimes(MOSCOW, winter, base());
        // Further east, the sun arrives earlier on the same clock.
        expect(west.times.dhuhr - east.times.dhuhr).toBeGreaterThanOrEqual(59);
        expect(west.times.dhuhr - east.times.dhuhr).toBeLessThanOrEqual(61);
    });
});

describe('prayerTimes — high latitudes', () => {
    it('leaves fajr and isha uncomputable when asked not to substitute', () => {
        // A Petersburg midsummer has no astronomical night: the sun never gets
        // 16° below the horizon, so those two times genuinely do not exist.
        const { times, invalid } = prayerTimes(PETERSBURG, summer, base({ highLatRule: 'none' }));
        expect(invalid).toContain('fajr');
        expect(invalid).toContain('isha');
        expect(Number.isNaN(times.fajr)).toBe(true);
        // Sunrise and sunset are still real, and still ordered.
        expect(times.sunrise).toBeLessThan(times.sunset);
    });

    it('substitutes a portion of the night for each rule, keeping the order', () => {
        for (const rule of ['angleBased', 'middleOfNight', 'seventhOfNight'] as const) {
            const { times, invalid } = prayerTimes(PETERSBURG, summer, base({ highLatRule: rule }));
            expect(invalid, rule).toEqual([]);
            expect(times.fajr, rule).toBeLessThan(times.sunrise);
            expect(times.maghrib, rule).toBeLessThan(times.isha);
        }
    });

    it('keeps midnight and the last third inside the night', () => {
        const { times } = prayerTimes(MOSCOW, winter, base());
        expect(times.midnight).toBeGreaterThan(times.maghrib);
        expect(times.lastThird).toBeGreaterThan(times.midnight);
        // Both are measured to the next fajr, which is tomorrow's.
        expect(times.lastThird).toBeLessThan(times.fajr + 1440);
    });

    it('admits defeat under the polar day rather than inventing a night', () => {
        // Murmansk in June: the sun does not set at all, so there is no night
        // to take a portion of, and no rule can produce an honest fajr.
        const { invalid } = prayerTimes(MURMANSK, summer, base({ highLatRule: 'angleBased' }));
        expect(invalid).toContain('sunset');
        expect(invalid).toContain('fajr');
    });
});

describe('reading a computed day', () => {
    const day = prayerTimes(MOSCOW, winter, base());
    const { times } = day;

    it('finds the next prayer, wrapping past isha to tomorrow', () => {
        const morning = nextPrayer(times, times.fajr - 30);
        expect(morning?.id).toBe('fajr');
        expect(morning?.minutesAway).toBe(30);

        const lateNight = nextPrayer(times, times.isha + 10);
        expect(lateNight?.id).toBe('fajr');
        expect(lateNight?.tomorrow).toBe(true);
        expect(lateNight?.minutesAway).toBeGreaterThan(0);
    });

    it('names the prayer whose window is open', () => {
        expect(currentPrayer(times, times.asr + 5)?.id).toBe('asr');
        expect(currentPrayer(times, times.isha + 5)?.id).toBe('isha');

        // Before fajr the open window still belongs to yesterday's isha.
        const beforeDawn = currentPrayer(times, times.fajr - 60);
        expect(beforeDawn?.id).toBe('isha');
        expect(beforeDawn?.fromYesterday).toBe(true);
    });

    it('closes each window where the next thing begins', () => {
        const windows = prayerWindows(times);
        expect(windows.map((w) => w.id)).toEqual([...PRAYERS]);

        const byId = new Map(windows.map((w) => [w.id, w]));
        // Fajr ends at sunrise, not at dhuhr — the morning belongs to nobody.
        expect(byId.get('fajr')?.end).toBe(times.sunrise);
        expect(byId.get('asr')?.end).toBe(times.maghrib);
        // Isha runs past midnight, into tomorrow's fajr.
        expect(byId.get('isha')?.end).toBe(times.fajr + 1440);
        for (const w of windows) expect(w.end).toBeGreaterThan(w.start);
    });

    it('knows whether a prayer has come in yet', () => {
        expect(hasEntered(times, 'dhuhr', times.dhuhr + 1)).toBe(true);
        expect(hasEntered(times, 'dhuhr', times.dhuhr - 1)).toBe(false);
    });

    it('records on time inside the window and late once it has closed', () => {
        // What a single tap means. Getting this backwards would quietly file
        // every prayer as late — or, worse, every late one as on time.
        expect(statusForTap(times, 'dhuhr', times.dhuhr + 5)).toBe('ontime');
        expect(statusForTap(times, 'dhuhr', times.asr + 5)).toBe('late');

        // Fajr closes at sunrise, not at dhuhr.
        expect(statusForTap(times, 'fajr', times.sunrise - 1)).toBe('ontime');
        expect(statusForTap(times, 'fajr', times.sunrise + 1)).toBe('late');

        // Isha runs past midnight, to the next fajr.
        expect(statusForTap(times, 'isha', times.isha + 90)).toBe('ontime');
        expect(statusForTap(times, 'isha', times.fajr + 1440 + 10)).toBe('late');
    });

    it('formats a clock label, wrapping times that run past midnight', () => {
        expect(formatClock(5 * 60 + 7, 'ru')).toBe('05:07');
        // 25:30 is half past one the next morning, not an error.
        expect(formatClock(25 * 60 + 30, 'ru')).toBe('01:30');
        expect(formatClock(NaN, 'ru')).toBe('—');
    });
});
