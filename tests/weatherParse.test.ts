import { describe, it, expect } from 'vitest';
import {
    FORECAST_HOURS,
    num,
    parseDaily,
    parseHourly,
    type DailyRaw,
    type HourlyRaw,
} from '../src/modules/weather/weatherParse';

/** `n` hourly timestamps starting at 2025-06-15T00:00. */
function hours(n: number): string[] {
    return Array.from(
        { length: n },
        (_, i) => `2025-06-${String(15 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`
    );
}

describe('num', () => {
    it('passes finite numbers through and replaces everything else', () => {
        expect(num(21.7)).toBe(21.7);
        expect(num(0)).toBe(0);
        expect(num(-3.5)).toBe(-3.5);
        expect(num(null)).toBe(0);
        expect(num(undefined)).toBe(0);
        expect(num(NaN)).toBe(0);
        expect(num(Infinity)).toBe(0);
        expect(num('21')).toBe(0);
        expect(num(null, 24000)).toBe(24000);
    });
});

describe('parseDaily', () => {
    it('is empty when the block is missing or has no days', () => {
        expect(parseDaily(undefined)).toEqual([]);
        expect(parseDaily({})).toEqual([]);
        expect(parseDaily({ time: [] })).toEqual([]);
    });

    it('keeps parallel arrays aligned to their own day', () => {
        const raw: DailyRaw = {
            time: ['2025-06-15', '2025-06-16', '2025-06-17'],
            temperature_2m_max: [32.4, 30.1, 31.8],
            temperature_2m_min: [20.2, 22.0, 21.4],
            wind_gusts_10m_max: [41, 55, 33],
            sunrise: ['2025-06-15T05:05', '2025-06-16T05:05', '2025-06-17T05:06'],
            sunset: ['2025-06-15T19:30', '2025-06-16T19:31', '2025-06-17T19:31'],
            daylight_duration: [51900, 51960, 51900],
        };
        const days = parseDaily(raw);

        expect(days).toHaveLength(3);
        expect(days[1]).toMatchObject({
            date: '2025-06-16',
            tempMaxC: 30.1,
            tempMinC: 22.0,
            windGustMaxKmh: 55,
            sunrise: '2025-06-16T05:05',
            sunset: '2025-06-16T19:31',
            daylightSec: 51960,
        });
    });

    it('does not round — the widget converts to °F and would compound it', () => {
        const days = parseDaily({ time: ['2025-06-15'], temperature_2m_max: [32.4] });
        expect(days[0].tempMaxC).toBe(32.4);
    });

    it('reports a missing variable as zero rather than undefined', () => {
        // Every consumer does arithmetic on these; undefined would render "NaN°".
        const days = parseDaily({ time: ['2025-06-15'] });
        expect(days[0].precipMm).toBe(0);
        expect(days[0].uvIndexMax).toBe(0);
        expect(days[0].sunrise).toBe('');
    });
});

describe('parseHourly', () => {
    it('is empty when the block is missing', () => {
        expect(parseHourly(undefined, '2025-06-15T15:00')).toEqual([]);
        expect(parseHourly({ time: [] }, '2025-06-15T15:00')).toEqual([]);
    });

    it('starts at the current hour, not at midnight', () => {
        const time = hours(48);
        const raw: HourlyRaw = { time, temperature_2m: time.map((_, i) => i) };

        const out = parseHourly(raw, '2025-06-15T15:20');
        expect(out[0].time).toBe('2025-06-15T15:00');
        // Index 15 in the source, so the value must travel with it.
        expect(out[0].tempC).toBe(15);
        expect(out[1].tempC).toBe(16);
    });

    it('treats the exact top of the hour as the current hour', () => {
        const time = hours(24);
        expect(parseHourly({ time }, '2025-06-15T15:00')[0].time).toBe('2025-06-15T15:00');
    });

    it('falls back to the first entry when every hour is already past', () => {
        const time = hours(24);
        expect(parseHourly({ time }, '2025-12-31T23:00')[0].time).toBe('2025-06-15T00:00');
    });

    it('caps the window at FORECAST_HOURS', () => {
        const time = hours(96);
        expect(parseHourly({ time }, '2025-06-15T00:00')).toHaveLength(FORECAST_HOURS);
    });

    it('returns however few hours remain near the end of the series', () => {
        const time = hours(24);
        expect(parseHourly({ time }, '2025-06-15T22:00')).toHaveLength(2);
    });

    it('defaults is_day to daytime and visibility to the API ceiling', () => {
        const time = hours(3);
        const out = parseHourly({ time }, '2025-06-15T00:00');
        expect(out[0].isDay).toBe(true);
        expect(out[0].visibilityM).toBe(24000);
    });

    it('reads is_day as the night flag the sky band depends on', () => {
        const time = hours(3);
        const out = parseHourly({ time, is_day: [1, 0, 0] }, '2025-06-15T00:00');
        expect(out.map((h) => h.isDay)).toEqual([true, false, false]);
    });

    it('offsets every variable by the slice start, not just time', () => {
        const time = hours(24);
        const raw: HourlyRaw = {
            time,
            uv_index: time.map((_, i) => i * 0.5),
            wind_direction_10m: time.map((_, i) => i * 10),
            is_day: time.map((_, i) => (i >= 20 ? 0 : 1)),
        };
        const out = parseHourly(raw, '2025-06-15T19:00');
        expect(out[0]).toMatchObject({ uvIndex: 9.5, windDir: 190, isDay: true });
        expect(out[1]).toMatchObject({ uvIndex: 10, windDir: 200, isDay: false });
    });
});
