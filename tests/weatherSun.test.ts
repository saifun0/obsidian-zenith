import { describe, it, expect } from 'vitest';
import {
    clockLabel,
    formatDuration,
    locationNowMs,
    skyStops,
    sunArc,
    wallClockMs,
    windowOffset,
} from '../src/modules/weather/sun';
import type { DailyForecast, WeatherData } from '../src/modules/weather/weatherTypes';

/** A day carrying only the fields the sun maths reads. */
function day(date: string, sunrise: string, sunset: string): DailyForecast {
    return {
        date,
        code: 0,
        tempMaxC: 30,
        tempMinC: 20,
        feelsMaxC: 30,
        feelsMinC: 20,
        precipProb: 0,
        precipMm: 0,
        rainMm: 0,
        snowCm: 0,
        precipHours: 0,
        uvIndexMax: 0,
        windMaxKmh: 0,
        windGustMaxKmh: 0,
        windDir: 0,
        sunrise,
        sunset,
        daylightSec: 51900,
        sunshineSec: 40000,
    };
}

const JUN15 = day('2025-06-15', '2025-06-15T05:05', '2025-06-15T19:30');
const JUN16 = day('2025-06-16', '2025-06-16T05:05', '2025-06-16T19:31');

const at = (iso: string) => wallClockMs(iso);
const near = (v: number, expected: number) => expect(v).toBeCloseTo(expected, 4);

describe('skyStops', () => {
    it('has nothing to draw without sun times', () => {
        expect(skyStops(at('2025-06-15T15:00'), at('2025-06-16T03:00'), [])).toEqual([]);
        expect(
            skyStops(at('2025-06-15T15:00'), at('2025-06-16T03:00'), [day('2025-06-15', '', '')])
        ).toEqual([]);
    });

    it('is empty for a zero-length or inverted window', () => {
        expect(skyStops(at('2025-06-15T15:00'), at('2025-06-15T15:00'), [JUN15])).toEqual([]);
        expect(skyStops(at('2025-06-15T18:00'), at('2025-06-15T15:00'), [JUN15])).toEqual([]);
    });

    it('ramps through twilight instead of switching on a hard edge', () => {
        // 15:00 → 03:00 next day: starts in daylight, crosses sunset at 19:30.
        const stops = skyStops(at('2025-06-15T15:00'), at('2025-06-16T03:00'), [JUN15, JUN16]);

        expect(stops.map((s) => s.day)).toEqual([true, true, false, false]);
        near(stops[0].offset, 0);
        // Half an hour before 19:30 is 19:00 — four hours into a twelve-hour window.
        near(stops[1].offset, 4 / 12);
        near(stops[2].offset, 5 / 12);
        near(stops[3].offset, 1);
    });

    it('places the boundary on the real minute, not the top of the hour', () => {
        // The old is_day approach could only ever land on 19:00 or 20:00.
        const stops = skyStops(at('2025-06-15T12:00'), at('2025-06-16T00:00'), [JUN15, JUN16]);
        // Sunset 19:30 − 30min = 19:00, which is 7/12 through a noon→midnight window.
        near(stops[1].offset, 7 / 12);
        near(stops[2].offset, 8 / 12);
    });

    it('infers the starting state from the first crossing when none precedes it', () => {
        // Window opens before sunrise, so the only clue is that dawn comes next.
        const stops = skyStops(at('2025-06-15T02:00'), at('2025-06-15T10:00'), [JUN15]);
        expect(stops[0].day).toBe(false);
        expect(stops[stops.length - 1].day).toBe(true);
    });

    it('stays one flat band when the window contains no crossing', () => {
        const stops = skyStops(at('2025-06-15T10:00'), at('2025-06-15T16:00'), [JUN15, JUN16]);
        expect(stops).toEqual([
            { offset: 0, day: true },
            { offset: 1, day: true },
        ]);
    });

    it('handles two crossings in one window', () => {
        // Sunset on the 15th and sunrise on the 16th both fall inside.
        const stops = skyStops(at('2025-06-15T18:00'), at('2025-06-16T08:00'), [JUN15, JUN16]);
        expect(stops.map((s) => s.day)).toEqual([true, true, false, false, true, true]);
    });
});

describe('windowOffset', () => {
    const start = at('2025-06-15T15:00');
    const end = at('2025-06-16T03:00');

    it('locates a moment inside the window', () => {
        near(windowOffset('2025-06-15T19:30', start, end)!, 4.5 / 12);
    });

    it('is null outside the window, so the marker simply is not drawn', () => {
        expect(windowOffset('2025-06-15T05:05', start, end)).toBeNull();
        expect(windowOffset('2025-06-16T09:00', start, end)).toBeNull();
        expect(windowOffset('', start, end)).toBeNull();
    });
});

describe('locationNowMs', () => {
    it("rides the location's clock, not the device's", () => {
        // The series says it is the 15:00 hour where the forecast is; the device
        // is 20 minutes into its own hour. Neither timezone needs to be known.
        const data = { hourly: [{ time: '2025-06-15T15:00' }] } as WeatherData;
        expect(locationNowMs(data, new Date(2030, 0, 1, 4, 20, 30))).toBe(
            at('2025-06-15T15:20') + 30_000
        );
    });

    it('falls back to the device clock with no series to anchor to', () => {
        const now = new Date(2025, 5, 15, 15, 20);
        expect(locationNowMs({ hourly: [] } as unknown as WeatherData, now)).toBe(now.getTime());
    });
});

describe('sunArc', () => {
    const data = (nowDaily: DailyForecast[]) => ({ daily: nowDaily }) as WeatherData;

    it('tracks progress across the day and counts down to sunset', () => {
        const arc = sunArc(data([JUN15, JUN16]), at('2025-06-15T12:00'));
        expect(arc?.isUp).toBe(true);
        expect(arc?.next).toBe('sunset');
        near(arc!.progress!, (12 - 5 - 5 / 60) / (19.5 - 5 - 5 / 60));
        expect(arc?.untilNextSec).toBe(Math.round((19.5 - 12) * 3600));
    });

    it('parks the sun rather than extrapolating it below the horizon', () => {
        const before = sunArc(data([JUN15, JUN16]), at('2025-06-15T03:00'));
        expect(before).toMatchObject({ progress: null, isUp: false, next: 'sunrise' });

        const after = sunArc(data([JUN15, JUN16]), at('2025-06-15T21:00'));
        expect(after).toMatchObject({ progress: null, isUp: false, next: 'sunrise' });
        // Counts on to tomorrow's sunrise, not back to today's.
        expect(after?.untilNextSec).toBe(Math.round((24 - 21 + 5 + 5 / 60) * 3600));
    });

    it('gives up rather than guessing when the day has no sun times', () => {
        expect(sunArc(data([day('2025-06-15', '', '')]), at('2025-06-15T12:00'))).toBeNull();
        expect(sunArc(data([]), at('2025-06-15T12:00'))).toBeNull();
    });
});

describe('clockLabel / formatDuration', () => {
    it('takes the wall clock straight off the string', () => {
        expect(clockLabel('2025-06-15T05:05')).toBe('05:05');
        expect(clockLabel('')).toBe('');
        expect(clockLabel('2025-06-15')).toBe('');
    });

    it('keeps the minutes, which is what makes two days comparable', () => {
        expect(formatDuration(51900, 'h', 'm')).toBe('14h 25m');
        expect(formatDuration(2400, 'h', 'm')).toBe('40m');
        expect(formatDuration(0, 'h', 'm')).toBe('0m');
        expect(formatDuration(-5, 'h', 'm')).toBe('0m');
    });
});
