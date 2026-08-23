/**
 * Turning "where am I" into coordinates.
 *
 * The old code asked ipapi.co first, which meant every user's IP went to a
 * third party on every cold start, for a city-level guess that is frequently
 * wrong on mobile networks — and on a free tier capped at 1000 requests a day
 * per IP. So the order is inverted here: an explicitly chosen place wins, then
 * the device's own geolocation, and the IP service is only consulted when the
 * user has opted into it.
 *
 * Search returns several candidates rather than silently taking the first. With
 * `count=1` a query like "Ставрополь" resolved to whatever Open-Meteo ranked
 * highest, with no way to tell it was the wrong Stavropol.
 *
 * This lives in `services/` rather than inside the weather module because a
 * second module now needs it: prayer times are a function of latitude and
 * longitude, and a prayer tracker that could only find a city when the weather
 * module happened to be switched on would be an odd thing to explain.
 */

import { requestUrl } from 'obsidian';

/**
 * A resolved location. Persisted in settings, so keep it small and JSON-safe.
 */
export interface GeoPlace {
    lat: number;
    lon: number;
    /** Display name, already localised when it came from geocoding. */
    name: string;
    /** Region / state, when the provider knows one. */
    admin1?: string;
    /** ISO-3166 alpha-2. */
    country?: string;
    /** IANA zone the place sits in, e.g. `Europe/Moscow`. */
    timezone?: string;
}

/** How long the browser may hand back a previously acquired fix. */
const GEO_MAX_AGE_MS = 30 * 60 * 1000;
const GEO_TIMEOUT_MS = 8000;

/** Candidates shown in the city picker. More is noise, fewer is guesswork. */
const SEARCH_RESULTS = 5;

interface GeocodeHit {
    name?: string;
    admin1?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    population?: number;
}

/** `Stavropol, Stavropol Kray, RU` — skipping the parts the provider didn't know. */
export function placeLabel(place: GeoPlace): string {
    return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

/**
 * A stable cache key for a place. Rounded to ~100 m: a GPS fix jitters between
 * calls, and without rounding every refresh would miss the cache and refetch.
 */
export function placeKey(place: GeoPlace | null | undefined): string {
    if (!place) return 'auto';
    return `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

function toPlace(hit: GeocodeHit): GeoPlace | null {
    if (typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return null;
    return {
        lat: hit.latitude,
        lon: hit.longitude,
        name: hit.name ?? 'Unknown',
        admin1: hit.admin1 || undefined,
        country: hit.country_code || undefined,
        timezone: hit.timezone || undefined,
    };
}

/**
 * Search for a place by name. `lang` localises the results, so a Russian UI
 * gets "Ставрополь" rather than "Stavropol" — the old call hardcoded `en`,
 * which also made Cyrillic queries match poorly.
 */
export async function searchPlaces(query: string, lang = 'en'): Promise<GeoPlace[]> {
    const name = query.trim();
    if (!name) return [];
    try {
        const res = await requestUrl({
            url:
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
                `&count=${SEARCH_RESULTS}&language=${encodeURIComponent(lang)}&format=json`,
        });
        const results: GeocodeHit[] = res.json?.results ?? [];
        return results.map(toPlace).filter((p): p is GeoPlace => p !== null);
    } catch {
        return [];
    }
}

/**
 * Name the coordinates a device fix gave us. Keyless, and the only step here
 * that isn't Open-Meteo — they publish no reverse endpoint. A failure is not
 * fatal: an unnamed place still forecasts correctly, it just reads as coordinates.
 */
export async function reverseGeocode(
    lat: number,
    lon: number,
    lang = 'en'
): Promise<Partial<GeoPlace>> {
    try {
        const res = await requestUrl({
            url:
                `https://api.bigdatacloud.net/data/reverse-geocode-client` +
                `?latitude=${lat}&longitude=${lon}&localityLanguage=${encodeURIComponent(lang)}`,
        });
        const j = res.json ?? {};
        const name: string | undefined = j.city || j.locality || j.principalSubdivision;
        return {
            name: name || undefined,
            admin1: j.principalSubdivision || undefined,
            country: j.countryCode || undefined,
        };
    } catch {
        return {};
    }
}

/** The device's own position. Resolves to null on denial, timeout or no support. */
export function devicePosition(): Promise<{ lat: number; lon: number } | null> {
    return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null),
            { timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS }
        );
    });
}

/**
 * City-level guess from the IP address. Opt-in only: calling this hands the
 * user's IP to a third party, which is a privacy cost the widget should never
 * incur without being asked.
 */
export async function ipPlace(): Promise<GeoPlace | null> {
    try {
        const res = await requestUrl({ url: 'https://ipapi.co/json/' });
        const j = res.json;
        if (typeof j?.latitude !== 'number' || typeof j?.longitude !== 'number') return null;
        return {
            lat: j.latitude,
            lon: j.longitude,
            name: j.city || 'Current location',
            admin1: j.region || undefined,
            country: j.country_code || undefined,
            timezone: j.timezone || undefined,
        };
    } catch {
        return null;
    }
}

export interface ResolveOptions {
    /** Consult ipapi.co when the device won't say where it is. */
    allowIpLookup: boolean;
    /** Language for place names. */
    lang: string;
}

/**
 * Best available location: the user's explicit choice, else the device, else
 * (only with consent) the IP. Returns null when nothing worked, which callers
 * treat as "keep showing stale data" rather than as an error.
 */
export async function resolvePlace(
    saved: GeoPlace | null | undefined,
    opts: ResolveOptions
): Promise<GeoPlace | null> {
    if (saved) return saved;

    const fix = await devicePosition();
    if (fix) {
        const named = await reverseGeocode(fix.lat, fix.lon, opts.lang);
        return { lat: fix.lat, lon: fix.lon, name: 'Current location', ...named };
    }

    return opts.allowIpLookup ? ipPlace() : null;
}
