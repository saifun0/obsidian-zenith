import { requestUrl, type App } from 'obsidian';
import { fetchAirQuality } from './airQuality';
import { placeKey, placeLabel, resolvePlace } from '../../services/geocode';
import {
    FORECAST_HOURS,
    num as n,
    parseDaily,
    parseHourly,
    type DailyRaw,
    type HourlyRaw,
} from './weatherParse';
import type { WeatherData, WeatherPlace } from './weatherTypes';

/**
 * WeatherService — real forecasts from Open-Meteo, with no API key anywhere.
 *
 * Open-Meteo is the provider precisely because it asks for nothing and gives
 * everything: this file requests ~35 variables across current/hourly/daily, and
 * `airQuality.ts` adds pollutants and pollen from its sibling endpoint. Location
 * resolution lives in `geocode.ts`.
 *
 * Results are cached in memory and in Obsidian's local storage so the widget paints
 * instantly on reopen and degrades to stale-but-real data offline. All network
 * access is best-effort — every failure path resolves to `null` or to whatever
 * was cached, never to a thrown error.
 */

export type {
    AirQuality,
    DailyForecast,
    HourlyForecast,
    PollenCounts,
    WeatherData,
    WeatherPlace,
} from './weatherTypes';

const CACHE_PREFIX = 'zenith:weather:v2';
const TTL_MS = 30 * 60 * 1000; // 30 min

/**
 * Give up on a request after this long. Obsidian's `requestUrl` takes no
 * AbortSignal, so this can't actually cancel the socket — it releases the
 * in-flight slot and lets the caller fall back to cache, and the orphaned
 * response is discarded when it eventually lands.
 */
const REQUEST_TIMEOUT_MS = 12_000;

/** Days of daily detail. The setting caps what's *shown*; the cache holds the lot. */
const FORECAST_DAYS = 10;

/** Per-location in-memory cache, keyed by rounded coordinates (or 'auto'). */
const memoryCache = new Map<string, WeatherData>();

/**
 * Fetches currently running, keyed the same way. Two weather widgets on one
 * dashboard, or a card that re-mounts mid-request, used to fire a full
 * geocode+forecast pair each; now they share one promise.
 */
const inFlight = new Map<string, Promise<WeatherData | null>>();

function cacheKey(key: string): string {
    return `${CACHE_PREFIX}:${key}`;
}

/**
 * Where the last forecast for each place is kept between sessions: Obsidian's
 * local storage, which is this device's and this vault's. Set by the weather
 * module while it runs; without it the cache lives in memory only.
 */
let persisted: App | null = null;

export function setWeatherPersistence(app: App | null): void {
    persisted = app;
}

function readPersisted(key: string): WeatherData | null {
    try {
        const raw: unknown = persisted?.loadLocalStorage(cacheKey(key));
        // Read back as written, but not trusted to be: a forecast has a fetch time.
        return raw && typeof raw === 'object' && typeof (raw as WeatherData).fetchedAt === 'number'
            ? (raw as WeatherData)
            : null;
    } catch {
        return null;
    }
}

function writePersisted(key: string, data: WeatherData): void {
    try {
        persisted?.saveLocalStorage(cacheKey(key), data);
    } catch {
        /* ignore quota / unavailability */
    }
}

/** Resolve to null if `work` outruns the deadline. */
function withTimeout<T>(work: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(null), ms);
        work.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            () => {
                window.clearTimeout(timer);
                resolve(null);
            }
        );
    });
}

// ── Request shape ────────────────────────────────────

const CURRENT_VARS = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'cloud_cover',
    'pressure_msl',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'is_day',
].join(',');

const HOURLY_VARS = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'dew_point_2m',
    'precipitation_probability',
    'precipitation',
    'weather_code',
    'cloud_cover',
    'pressure_msl',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
    'wind_direction_10m',
    'uv_index',
    'is_day',
].join(',');

const DAILY_VARS = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'apparent_temperature_max',
    'apparent_temperature_min',
    'sunrise',
    'sunset',
    'daylight_duration',
    'sunshine_duration',
    'uv_index_max',
    'precipitation_sum',
    'rain_sum',
    'snowfall_sum',
    'precipitation_hours',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'wind_gusts_10m_max',
    'wind_direction_10m_dominant',
].join(',');

/** The parts of Open-Meteo's forecast answer read here. None of them is trusted to be there. */
interface ForecastResponse {
    current?: Record<string, unknown>;
    daily?: DailyRaw;
    hourly?: HourlyRaw;
    timezone?: string;
}

async function fetchForecast(place: WeatherPlace): Promise<WeatherData | null> {
    const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
        `&current=${CURRENT_VARS}&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
        `&forecast_days=${FORECAST_DAYS}&forecast_hours=${FORECAST_HOURS}&timezone=auto`;

    const res = await requestUrl({ url });
    const json = res.json as ForecastResponse | undefined;
    const c = json?.current;
    if (!c) return null;

    const daily = parseDaily(json?.daily);
    const hourly = parseHourly(json?.hourly, typeof c.time === 'string' ? c.time : '');
    // Dew point, visibility and UV have no `current` equivalent, so the current
    // hour of the series stands in for them.
    const nowHour = hourly[0];
    const resolved: WeatherPlace = { ...place, timezone: json?.timezone ?? place.timezone };

    return {
        tempC: n(c.temperature_2m),
        feelsLikeC: n(c.apparent_temperature),
        humidity: n(c.relative_humidity_2m),
        windKmh: n(c.wind_speed_10m),
        windGustKmh: n(c.wind_gusts_10m),
        windDir: n(c.wind_direction_10m),
        code: n(c.weather_code),
        isDay: n(c.is_day, 1) === 1,
        pressureHpa: n(c.pressure_msl),
        cloudCover: n(c.cloud_cover),
        precipMm: n(c.precipitation),
        dewPointC: nowHour?.dewPointC ?? 0,
        visibilityM: nowHour?.visibilityM ?? 24000,
        uvIndex: nowHour?.uvIndex ?? 0,

        place: resolved,
        location: placeLabel(resolved),
        timezone: json?.timezone ?? '',
        fetchedAt: Date.now(),

        sunrise: daily[0]?.sunrise ?? '',
        sunset: daily[0]?.sunset ?? '',
        daily,
        hourly,
    };
}

// ── Public API ───────────────────────────────────────

export interface WeatherRequest {
    /** The user's chosen place. Null asks `geocode` to work it out. */
    place: WeatherPlace | null;
    /** Fall back to the IP geolocation service. Off unless the user opted in. */
    allowIpLookup: boolean;
    /** UI language, for localised place names. */
    lang: string;
    /** Spend a second request on pollutants and pollen. */
    includeAir: boolean;
    /** Refetch even when the cache is still fresh. */
    force?: boolean;
}

async function load(req: WeatherRequest, key: string): Promise<WeatherData | null> {
    const cached = memoryCache.get(key) ?? readPersisted(key);

    const place = await resolvePlace(req.place, {
        allowIpLookup: req.allowIpLookup,
        lang: req.lang,
    });
    // Offline, denied, or nothing configured — stale real data beats an error.
    if (!place) return cached ?? null;

    let data = await withTimeout(fetchForecast(place));
    // One retry: the common failure here is a flaky mobile connection dropping a
    // single request, not the endpoint being down.
    if (!data) data = await withTimeout(fetchForecast(place));
    if (!data) return cached ?? null;

    if (req.includeAir) {
        const air = await withTimeout(fetchAirQuality(place.lat, place.lon));
        // Keep the previous reading rather than blanking the panel on one miss.
        if (air) data.air = air;
        else if (cached?.air) data.air = cached.air;
    }

    // A GPS-resolved place lands under 'auto' *and* its own coordinates, so the
    // next cold start can paint from cache before geolocation has answered.
    const resolvedKey = placeKey(place);
    for (const k of new Set([key, resolvedKey])) {
        memoryCache.set(k, data);
        writePersisted(k, data);
    }
    return data;
}

/**
 * Weather for the requested place. Serves fresh cache when it has some,
 * otherwise fetches — and concurrent callers share one request.
 */
export function getWeather(req: WeatherRequest): Promise<WeatherData | null> {
    const key = placeKey(req.place);

    const cached = memoryCache.get(key) ?? readPersisted(key);
    if (cached) memoryCache.set(key, cached);
    if (cached && !req.force && Date.now() - cached.fetchedAt < TTL_MS) {
        // Air quality was switched on since this was cached: fetch rather than
        // serve a payload missing the section the user just asked for.
        if (!req.includeAir || cached.air) return Promise.resolve(cached);
    }

    const running = inFlight.get(key);
    if (running) return running;

    const pending = load(req, key).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
}

/** Immediately-available cached value (no network), for first paint. */
export function getCachedWeather(place: WeatherPlace | null): WeatherData | null {
    const key = placeKey(place);
    const existing = memoryCache.get(key) ?? readPersisted(key);
    if (existing) memoryCache.set(key, existing);
    return existing ?? null;
}

/** Which animated hero glyph a condition draws. */
export type WeatherGlyphKind =
    | 'sun'
    | 'moon'
    | 'cloud-sun'
    | 'cloud-moon'
    | 'cloud'
    | 'fog'
    | 'drizzle'
    | 'rain'
    | 'showers'
    | 'snow'
    | 'thunder';

export interface WeatherLook {
    /**
     * Translation key for the condition. A key rather than the word itself,
     * because this used to hand back English prose and the card then printed
     * "Overcast" in the middle of an otherwise Russian interface.
     */
    labelKey: string;
    /** Lucide name — the small icons in the hourly strip and the day list. */
    icon: string;
    /** The moving one, drawn by `WeatherGlyph` for the hero. */
    glyph: WeatherGlyphKind;
}

/** Map a WMO weather code to a label key, a lucide icon and a hero glyph. */
export function describeWeather(code: number, isDay: boolean): WeatherLook {
    const key = (name: string) => `weather.code.${name}`;
    if (code === 0)
        return {
            labelKey: key('clear'),
            icon: isDay ? 'sun' : 'moon',
            glyph: isDay ? 'sun' : 'moon',
        };
    if (code === 1)
        return {
            labelKey: key('mainlyClear'),
            icon: isDay ? 'sun' : 'moon',
            glyph: isDay ? 'sun' : 'moon',
        };
    if (code === 2)
        return {
            labelKey: key('partlyCloudy'),
            icon: isDay ? 'cloud-sun' : 'cloud-moon',
            glyph: isDay ? 'cloud-sun' : 'cloud-moon',
        };
    if (code === 3) return { labelKey: key('overcast'), icon: 'cloud', glyph: 'cloud' };
    if (code === 45 || code === 48)
        return { labelKey: key('fog'), icon: 'cloud-fog', glyph: 'fog' };
    if (code >= 51 && code <= 57)
        return { labelKey: key('drizzle'), icon: 'cloud-drizzle', glyph: 'drizzle' };
    if (code >= 61 && code <= 67)
        return { labelKey: key('rain'), icon: 'cloud-rain', glyph: 'rain' };
    if (code >= 71 && code <= 77)
        return { labelKey: key('snow'), icon: 'cloud-snow', glyph: 'snow' };
    if (code >= 80 && code <= 82)
        return { labelKey: key('showers'), icon: 'cloud-rain-wind', glyph: 'showers' };
    if (code === 85 || code === 86)
        return { labelKey: key('snowShowers'), icon: 'cloud-snow', glyph: 'snow' };
    if (code >= 95)
        return { labelKey: key('thunderstorm'), icon: 'cloud-lightning', glyph: 'thunder' };
    return { labelKey: key('unknown'), icon: 'cloud', glyph: 'cloud' };
}
