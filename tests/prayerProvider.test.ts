import { describe, it, expect } from 'vitest';
import { ALADHAN, __testing, roundedPlace } from '../src/modules/prayer/prayerProvider';
import type { PrayerApiOptions } from '../src/modules/prayer/prayerProvider';

const { clockToMinutes, gregorianToIso, unwrapDay, parseYear, buildYearUrl } = __testing;

/** A day as the service prints it, zone suffix and all. */
function timings(over: Record<string, string> = {}): Record<string, string> {
    return {
        Fajr: '03:57 (+03)',
        Sunrise: '05:46 (+03)',
        Dhuhr: '12:59 (+03)',
        Asr: '16:55 (+03)',
        Sunset: '20:09 (+03)',
        Maghrib: '20:11 (+03)',
        Isha: '22:00 (+03)',
        Midnight: '00:58 (+03)',
        Lastthird: '02:11 (+03)',
        ...over,
    };
}

const OPTS: PrayerApiOptions = {
    method: 'russia',
    hanafi: true,
    highLatRule: 'angleBased',
    midnight: 'toFajr',
    timezone: 'Europe/Moscow',
};

describe('clockToMinutes', () => {
    it('reads a clock and ignores the zone the service appends', () => {
        expect(clockToMinutes('03:57 (+03)')).toBe(237);
        expect(clockToMinutes('00:00')).toBe(0);
        expect(clockToMinutes('23:59 (-11)')).toBe(1439);
    });

    it('refuses anything that is not a time', () => {
        expect(clockToMinutes('-----')).toBeNaN();
        expect(clockToMinutes(undefined)).toBeNaN();
        expect(clockToMinutes(1234)).toBeNaN();
    });
});

describe('gregorianToIso', () => {
    it('turns the service’s day-first date around', () => {
        expect(gregorianToIso('01-08-2026')).toBe('2026-08-01');
        expect(gregorianToIso('31-12-2025')).toBe('2025-12-31');
    });

    it('rejects anything else', () => {
        expect(gregorianToIso('2026-08-01')).toBe('');
        expect(gregorianToIso(null)).toBe('');
    });
});

describe('unwrapDay', () => {
    it('keeps a day that never crosses midnight as it is', () => {
        const day = unwrapDay(timings())!;
        expect(day.fajr).toBe(237);
        expect(day.dhuhr).toBe(779);
        expect(day.isha).toBe(1320);
    });

    it('pushes past-midnight times into the next day', () => {
        // The whole point: the service prints a clock, so midnight and the last
        // third come back as small numbers that would sort before that
        // afternoon's asr.
        const day = unwrapDay(timings())!;
        expect(day.midnight).toBe(1440 + 58);
        expect(day.lastThird).toBe(1440 + 131);
        expect(day.lastThird).toBeGreaterThan(day.isha);
    });

    it('unwraps an isha that itself falls after midnight', () => {
        const day = unwrapDay(
            timings({ Isha: '00:20 (+03)', Midnight: '01:10 (+03)', Lastthird: '02:30 (+03)' })
        )!;
        expect(day.isha).toBe(1440 + 20);
        expect(day.midnight).toBe(1440 + 70);
        expect(day.lastThird).toBe(1440 + 150);
    });

    it('puts sunset on the same day as maghrib', () => {
        const day = unwrapDay(timings())!;
        expect(day.sunset).toBe(20 * 60 + 9);
        expect(day.sunset).toBeLessThan(day.maghrib);
    });

    it('gives up on a response that parsed into almost nothing', () => {
        expect(unwrapDay({ Fajr: '03:57', Dhuhr: '-----' })).toBeNull();
    });

    it('marks a single missing time invalid without losing the rest', () => {
        const day = unwrapDay(timings({ Lastthird: '-----' }))!;
        expect(day.lastThird).toBeNaN();
        expect(day.fajr).toBe(237);
    });
});

describe('parseYear', () => {
    const entry = (date: string) => ({ timings: timings(), date: { gregorian: { date } } });

    it('reads the annual form, keyed by month', () => {
        // What `/v1/calendar/{year}` returns: `data` by month number, each a
        // list of days — checked against the live service.
        const year = parseYear({
            data: {
                1: [entry('01-01-2026'), entry('02-01-2026')],
                12: [entry('31-12-2026')],
            },
        })!;
        expect(Object.keys(year).sort()).toEqual(['2026-01-01', '2026-01-02', '2026-12-31']);
        expect(year['2026-12-31'].fajr).toBe(237);
    });

    it('reads a plain list, which is what a single month looks like', () => {
        const year = parseYear({ data: [entry('01-08-2026'), entry('02-08-2026')] })!;
        expect(Object.keys(year)).toEqual(['2026-08-01', '2026-08-02']);
    });

    it('reads months keyed by day of the month', () => {
        const year = parseYear({ data: { 8: { 1: entry('01-08-2026') } } })!;
        expect(Object.keys(year)).toEqual(['2026-08-01']);
    });

    it('skips days it cannot place, and fails on a payload with none', () => {
        const year = parseYear({
            data: { 8: [entry('01-08-2026'), { timings: timings() }, { date: { gregorian: {} } }] },
        })!;
        expect(Object.keys(year)).toEqual(['2026-08-01']);
        expect(parseYear({ data: {} })).toBeNull();
        expect(parseYear({})).toBeNull();
    });
});

describe('buildYearUrl', () => {
    const place = { lat: 45.0428, lon: 41.9734 };

    it('asks for the whole year in one request', () => {
        expect(buildYearUrl(place, 2026, OPTS)).toContain('/calendar/2026?');
    });

    it('sends the place rounded to about a kilometre', () => {
        const url = buildYearUrl(place, 2026, OPTS);
        expect(url).toContain('latitude=45.04&');
        expect(url).toContain('longitude=41.97&');
        expect(url).not.toContain('45.0428');
    });

    it('sends the muftiate method, the madhab and the night rule', () => {
        const url = buildYearUrl(place, 2026, OPTS);
        // 14 is the Spiritual Administration of Muslims of Russia.
        expect(url).toContain('method=14');
        expect(url).toContain('school=1');
        expect(url).toContain('latitudeAdjustmentMethod=3');
        expect(url).toContain('midnightMode=1');
    });

    it('reports on the device’s zone, so daylight saving lands on the right days', () => {
        // The service applies the zone per day; sending the device's rather
        // than the place's keeps the times on the clock "now" is read from.
        expect(buildYearUrl(place, 2026, OPTS)).toContain('timezonestring=Europe%2FMoscow');
        expect(buildYearUrl(place, 2026, { ...OPTS, timezone: 'Europe/Berlin' })).toContain(
            'timezonestring=Europe%2FBerlin'
        );
    });

    it('asks for the custom method with our own angles', () => {
        const url = buildYearUrl(place, 2026, {
            ...OPTS,
            method: 'custom',
            fajrAngle: 16.5,
            ishaAngle: 14,
        });
        expect(url).toContain('method=99');
        expect(url).toContain('methodSettings=16.5%2Cnull%2C14');
    });

    it('omits the latitude rule the service has no option for', () => {
        expect(buildYearUrl(place, 2026, { ...OPTS, highLatRule: 'none' })).not.toContain(
            'latitudeAdjustmentMethod'
        );
    });

    it('asks for sunset-to-sunrise when that is what was chosen', () => {
        expect(buildYearUrl(place, 2026, { ...OPTS, midnight: 'toSunrise' })).toContain(
            'midnightMode=0'
        );
    });
});

describe('ALADHAN.shape', () => {
    it('changes with everything that changes the answer', () => {
        const base = ALADHAN.shape(OPTS);
        expect(ALADHAN.shape({ ...OPTS, method: 'mwl' })).not.toBe(base);
        expect(ALADHAN.shape({ ...OPTS, hanafi: false })).not.toBe(base);
        expect(ALADHAN.shape({ ...OPTS, highLatRule: 'none' })).not.toBe(base);
        expect(ALADHAN.shape({ ...OPTS, midnight: 'toSunrise' })).not.toBe(base);
        expect(ALADHAN.shape({ ...OPTS, timezone: 'Asia/Almaty' })).not.toBe(base);
    });

    it('carries custom angles only for the custom method', () => {
        expect(ALADHAN.shape({ ...OPTS, fajrAngle: 10 })).toBe(ALADHAN.shape(OPTS));
        expect(ALADHAN.shape({ ...OPTS, method: 'custom', fajrAngle: 10 })).not.toBe(
            ALADHAN.shape({ ...OPTS, method: 'custom', fajrAngle: 11 })
        );
    });
});

describe('roundedPlace', () => {
    it('keeps two decimals, both signs', () => {
        expect(roundedPlace({ lat: 45.0428, lon: 41.9734 })).toEqual({ lat: 45.04, lon: 41.97 });
        expect(roundedPlace({ lat: -33.8688, lon: -151.2093 })).toEqual({
            lat: -33.87,
            lon: -151.21,
        });
    });
});
