/**
 * Shapes for the weather module.
 *
 * Everything is stored in **metric** regardless of what the user has chosen to
 * see: a cached payload has to survive a unit change in settings, and the
 * temperature→colour mapping is defined on a fixed Celsius domain so that one
 * hue always means one physical temperature. Conversion happens at render.
 *
 * Values are kept unrounded here too. The old service rounded at parse time and
 * the widget then converted to °F on top of that, so an already-lossy Celsius
 * integer was scaled by 9/5 — visibly wrong by up to a degree.
 */

import type { GeoPlace } from '../../services/geocode';

/**
 * A resolved location.
 *
 * The type itself lives with the geocoder in `services/`, now that the prayer
 * module needs the same coordinates; this alias stays so the weather code (and
 * the settings key it has always written) keeps reading in its own vocabulary.
 */
export type WeatherPlace = GeoPlace;

export interface HourlyForecast {
    /** Location-local wall clock, `yyyy-mm-ddThh:mm`. */
    time: string;
    tempC: number;
    feelsLikeC: number;
    code: number;
    isDay: boolean;
    /** 0–100. */
    precipProb: number;
    /** Millimetres in this hour. */
    precipMm: number;
    /** 0–100. */
    humidity: number;
    dewPointC: number;
    /** 0–100. */
    cloudCover: number;
    /** Mean sea-level pressure, hPa. Carried hourly so a trend can be derived. */
    pressureHpa: number;
    /** Metres. Open-Meteo saturates at 24 000. */
    visibilityM: number;
    windKmh: number;
    windGustKmh: number;
    /** Degrees the wind blows *from*, 0 = north. */
    windDir: number;
    uvIndex: number;
}

export interface DailyForecast {
    /** Local calendar date, `yyyy-mm-dd`. */
    date: string;
    code: number;
    tempMaxC: number;
    tempMinC: number;
    feelsMaxC: number;
    feelsMinC: number;
    /** Max precipitation probability for the day, 0–100. */
    precipProb: number;
    precipMm: number;
    rainMm: number;
    /** Centimetres — Open-Meteo reports snowfall in cm, not mm. */
    snowCm: number;
    /** Hours with measurable precipitation. */
    precipHours: number;
    uvIndexMax: number;
    windMaxKmh: number;
    windGustMaxKmh: number;
    windDir: number;
    /** Local wall clock, `yyyy-mm-ddThh:mm`. Empty in the polar edge cases. */
    sunrise: string;
    sunset: string;
    /** Seconds between sunrise and sunset. */
    daylightSec: number;
    /** Seconds of actual sunshine — always ≤ daylight, and lower under cloud. */
    sunshineSec: number;
}

/**
 * Air quality, from Open-Meteo's separate (also key-free) endpoint. Every field
 * is nullable: coverage is patchy outside Europe, and a missing pollutant must
 * render as "no data" rather than as zero.
 */
export interface AirQuality {
    /** 0–100+, lower is better. Europe's own scale. */
    europeanAqi: number | null;
    /** 0–500, the US EPA scale. Not comparable to the European one. */
    usAqi: number | null;
    /** µg/m³. */
    pm2_5: number | null;
    pm10: number | null;
    ozone: number | null;
    nitrogenDioxide: number | null;
    sulphurDioxide: number | null;
    carbonMonoxide: number | null;
    /**
     * Grains/m³ from the CAMS model — **Europe only**. Null everywhere else,
     * which is why the pollen section has to be able to disappear entirely.
     */
    pollen: PollenCounts | null;
    fetchedAt: number;
}

export interface PollenCounts {
    alder: number | null;
    birch: number | null;
    grass: number | null;
    mugwort: number | null;
    olive: number | null;
    ragweed: number | null;
}

export interface WeatherData {
    // ── Current conditions ──
    tempC: number;
    feelsLikeC: number;
    /** 0–100. */
    humidity: number;
    windKmh: number;
    windGustKmh: number;
    windDir: number;
    code: number;
    isDay: boolean;
    /** Mean sea-level pressure, hPa. */
    pressureHpa: number;
    /** 0–100. */
    cloudCover: number;
    /** Millimetres in the current hour. */
    precipMm: number;
    /**
     * Derived from the current hour of `hourly` — Open-Meteo's `current` block
     * offers neither of these, but the hourly series does.
     */
    dewPointC: number;
    visibilityM: number;
    uvIndex: number;

    // ── Where and when ──
    place: WeatherPlace;
    /** Pre-joined display string, e.g. `Stavropol, Stavropol Kray, RU`. */
    location: string;
    timezone: string;
    fetchedAt: number;

    // ── Today's sun, hoisted for convenience ──
    sunrise: string;
    sunset: string;

    // ── Series ──
    /** Up to 10 days, starting today. */
    daily: DailyForecast[];
    /** Up to 48 hours, starting at the current hour. */
    hourly: HourlyForecast[];

    /** Only present when the user has switched air quality on. */
    air?: AirQuality;
}
