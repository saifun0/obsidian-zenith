/**
 * Turning Open-Meteo's column-oriented JSON into our row-oriented types.
 *
 * Split out from `weatherService` so it can be tested as what it is: pure
 * functions over a decoded response, with no network, no `window`, and no
 * Obsidian runtime in the way. This is also where the real risk lives — the
 * API returns parallel arrays indexed by position, so an off-by-one silently
 * attaches Tuesday's wind to Monday.
 */

import type { DailyForecast, HourlyForecast } from './weatherTypes';

/** Hours of hourly detail kept. Two days is what the expanded panel scrolls. */
export const FORECAST_HOURS = 48;

/** Open-Meteo saturates visibility here, so it's also the sane default. */
const MAX_VISIBILITY_M = 24000;

/** Finite number, or `fallback`. Open-Meteo sends null for unavailable hours. */
export function num(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface DailyRaw {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    apparent_temperature_max?: (number | null)[];
    apparent_temperature_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    rain_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    precipitation_hours?: (number | null)[];
    uv_index_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    wind_gusts_10m_max?: (number | null)[];
    wind_direction_10m_dominant?: (number | null)[];
    sunrise?: (string | null)[];
    sunset?: (string | null)[];
    daylight_duration?: (number | null)[];
    sunshine_duration?: (number | null)[];
}

export interface HourlyRaw {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    dew_point_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    weather_code?: (number | null)[];
    cloud_cover?: (number | null)[];
    pressure_msl?: (number | null)[];
    visibility?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    uv_index?: (number | null)[];
    is_day?: (number | null)[];
}

export function parseDaily(d: DailyRaw | undefined): DailyForecast[] {
    if (!d?.time?.length) return [];
    return d.time.map((date, i) => ({
        date,
        code: num(d.weather_code?.[i]),
        tempMaxC: num(d.temperature_2m_max?.[i]),
        tempMinC: num(d.temperature_2m_min?.[i]),
        feelsMaxC: num(d.apparent_temperature_max?.[i]),
        feelsMinC: num(d.apparent_temperature_min?.[i]),
        precipProb: num(d.precipitation_probability_max?.[i]),
        precipMm: num(d.precipitation_sum?.[i]),
        rainMm: num(d.rain_sum?.[i]),
        snowCm: num(d.snowfall_sum?.[i]),
        precipHours: num(d.precipitation_hours?.[i]),
        uvIndexMax: num(d.uv_index_max?.[i]),
        windMaxKmh: num(d.wind_speed_10m_max?.[i]),
        windGustMaxKmh: num(d.wind_gusts_10m_max?.[i]),
        windDir: num(d.wind_direction_10m_dominant?.[i]),
        sunrise: d.sunrise?.[i] ?? '',
        sunset: d.sunset?.[i] ?? '',
        daylightSec: num(d.daylight_duration?.[i]),
        sunshineSec: num(d.sunshine_duration?.[i]),
    }));
}

/**
 * Slice the hourly series to `FORECAST_HOURS` entries starting at the
 * location's current wall-clock hour. ISO strings sort lexicographically, so
 * comparing the `yyyy-mm-ddThh` prefix as text is timezone-safe.
 *
 * We slice defensively even though the request asks for `forecast_hours`:
 * whether that window begins at the current hour or at midnight is the API's
 * choice, and getting "Now" wrong by up to 23 hours is not a subtle bug.
 */
export function parseHourly(h: HourlyRaw | undefined, nowLocal: string): HourlyForecast[] {
    if (!h?.time?.length) return [];
    const cursor = nowLocal.slice(0, 13);
    let start = h.time.findIndex((t) => t.slice(0, 13) >= cursor);
    if (start < 0) start = 0;

    return h.time.slice(start, start + FORECAST_HOURS).map((time, i) => {
        const idx = start + i;
        return {
            time,
            tempC: num(h.temperature_2m?.[idx]),
            feelsLikeC: num(h.apparent_temperature?.[idx]),
            code: num(h.weather_code?.[idx]),
            isDay: num(h.is_day?.[idx], 1) === 1,
            precipProb: num(h.precipitation_probability?.[idx]),
            precipMm: num(h.precipitation?.[idx]),
            humidity: num(h.relative_humidity_2m?.[idx]),
            dewPointC: num(h.dew_point_2m?.[idx]),
            cloudCover: num(h.cloud_cover?.[idx]),
            pressureHpa: num(h.pressure_msl?.[idx]),
            visibilityM: num(h.visibility?.[idx], MAX_VISIBILITY_M),
            windKmh: num(h.wind_speed_10m?.[idx]),
            windGustKmh: num(h.wind_gusts_10m?.[idx]),
            windDir: num(h.wind_direction_10m?.[idx]),
            uvIndex: num(h.uv_index?.[idx]),
        };
    });
}
