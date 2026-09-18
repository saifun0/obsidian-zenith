import { describe, it, expect } from 'vitest';
import { __testing } from '../src/modules/prayer/prayerApi';
import type { PrayerApiOptions } from '../src/modules/prayer/prayerApi';

const { clockToMinutes, gregorianToIso, unwrapDay, parseMonth, buildUrl } = __testing;

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

describe('parseMonth', () => {
    const entry = (date: string) => ({ timings: timings(), date: { gregorian: { date } } });

    it('reads the array form', () => {
        const month = parseMonth({ data: [entry('01-08-2026'), entry('02-08-2026')] })!;
        expect(Object.keys(month)).toEqual(['2026-08-01', '2026-08-02']);
        expect(month['2026-08-01'].fajr).toBe(237);
    });

    it('reads the form keyed by day of the month', () => {
        const month = parseMonth({ data: { 1: entry('01-08-2026'), 2: entry('02-08-2026') } })!;
        expect(Object.keys(month).sort()).toEqual(['2026-08-01', '2026-08-02']);
    });

    it('skips days it cannot place, and fails on a payload with none', () => {
        const month = parseMonth({
            data: [entry('01-08-2026'), { timings: timings() }, { date: { gregorian: {} } }],
        })!;
        expect(Object.keys(month)).toEqual(['2026-08-01']);
        expect(parseMonth({ data: [] })).toBeNull();
        expect(parseMonth({})).toBeNull();
    });
});

describe('buildUrl', () => {
    const place = { lat: 45.0428, lon: 41.9734 };

    it('sends the muftiate method, the madhab and the night rule', () => {
        const url = buildUrl(place, 2026, 8, OPTS);
        expect(url).toContain('/calendar/2026/8?');
        // 14 is the Spiritual Administration of Muslims of Russia.
        expect(url).toContain('method=14');
        expect(url).toContain('school=1');
        expect(url).toContain('latitudeAdjustmentMethod=3');
        expect(url).toContain('midnightMode=1');
        expect(url).toContain('timezonestring=Europe%2FMoscow');
    });

    it('asks for the custom method with our own angles', () => {
        const url = buildUrl(place, 2026, 8, {
            ...OPTS,
            method: 'custom',
            fajrAngle: 16.5,
            ishaAngle: 14,
        });
        expect(url).toContain('method=99');
        expect(url).toContain('methodSettings=16.5%2Cnull%2C14');
    });

    it('omits the latitude rule the service has no option for', () => {
        const url = buildUrl(place, 2026, 8, { ...OPTS, highLatRule: 'none' });
        expect(url).not.toContain('latitudeAdjustmentMethod');
    });

    it('asks for sunset-to-sunrise when that is what was chosen', () => {
        expect(buildUrl(place, 2026, 8, { ...OPTS, midnight: 'toSunrise' })).toContain(
            'midnightMode=0'
        );
    });
});
