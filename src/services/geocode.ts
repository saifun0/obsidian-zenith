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
import { displayName, matchLevel, nameSkeleton, tidyRegion } from './placeNames';

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
const SEARCH_RESULTS = 6;

/**
 * Candidates asked for, before filtering. Well over what is shown: an airport,
 * an upland and a railway station named after a city all rank alongside it,
 * and they have to be fetched to be thrown away.
 */
const SEARCH_FETCH = 20;

export interface GeocodeHit {
    name?: string;
    admin1?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    population?: number;
    /** GeoNames feature code: `PPLA` a regional capital, `AIRP` an airport… */
    feature_code?: string;
}

/**
 * One suggestion in the city picker: the place as it would be saved, and what
 * helps tell it from its namesakes.
 */
export interface PlaceCandidate {
    place: GeoPlace;
    /** Residents, when the provider knows. What separates a city from a village. */
    population?: number;
}

/**
 * `Stavropol, Stavropol Kray, RU` — skipping the parts the provider didn't
 * know, and a region that only repeats the name: Moscow is its own region, and
 * "Москва, Москва" reads as a stutter.
 */
export function placeLabel(place: GeoPlace): string {
    return [place.name, placeRegion(place), place.country].filter(Boolean).join(', ');
}

/** The region worth printing beside a place's name, if any. */
export function placeRegion(place: GeoPlace): string | undefined {
    return place.admin1 && place.admin1 !== place.name ? place.admin1 : undefined;
}

/**
 * Which place a module should use: its own override, else the one set once for
 * the whole plugin, else nothing.
 *
 * Every module that needs coordinates needs the same coordinates, and asking
 * for them per module meant setting the same city twice and keeping the two in
 * step by hand. The override survives because it answers a real question —
 * watching the forecast somewhere you are not, while praying where you are.
 */
export function preferredPlace(
    override: GeoPlace | null | undefined,
    global: GeoPlace | null | undefined
): GeoPlace | null {
    return override ?? global ?? null;
}

/**
 * A stable cache key for a place. Rounded to ~100 m: a GPS fix jitters between
 * calls, and without rounding every refresh would miss the cache and refetch.
 */
export function placeKey(place: GeoPlace | null | undefined): string {
    if (!place) return 'auto';
    return `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

// ── Choosing what to suggest ─────────────────────────

/**
 * Places people live, by GeoNames class P — minus the historical, abandoned
 * and destroyed ones, which share the name and none of the weather. Everything
 * else (airports, stations, hills, districts of water) is a namesake: typing
 * "Ставрополь" offered the city AND its airport, as two identical rows.
 */
const GONE = new Set(['PPLH', 'PPLQ', 'PPLW', 'PPLCH']);

function isSettlement(code: string | undefined): boolean {
    if (!code) return true;
    if (code === 'STLMT') return true;
    return code.startsWith('PPL') && !GONE.has(code);
}

/** How much of a place it is, before population is even consulted. */
function standing(code: string | undefined): number {
    switch (code) {
        case 'PPLC':
            return 5;
        case 'PPLA':
        case 'PPLG':
            return 4;
        case 'PPLA2':
            return 3;
        case 'PPLA3':
            return 2;
        case 'PPLA4':
            return 1;
        // A district of a city. Real, but rarely what a city search means.
        case 'PPLX':
            return -1;
        default:
            return 0;
    }
}

/** Great-circle distance in km. Only compared against a threshold. */
function distanceKm(a: GeoPlace, b: GeoPlace): number {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

/** Two rows closer than this, with one name and one region, are one place. */
const SAME_PLACE_KM = 15;

interface Ranked extends PlaceCandidate {
    /** 0 the whole name, 1 the start of it, 2 matched some other way. */
    match: number;
    standing: number;
    settlement: boolean;
    order: number;
}

/**
 * The provider's answer, made into suggestions: namesakes that are not
 * settlements dropped, names shown in the query's script, duplicates folded,
 * and the rest ordered by how well they match and how much of a place each is.
 *
 * Match first, so "Краснодар" puts the two places called exactly that above
 * "Краснодарка". Then standing — a capital over a regional centre over a
 * village — then population, then the provider's own order. The match is
 * judged on skeletons, so "Kazan" typed in Latin is an exact match for Казань
 * and not only for the Turkish town that happens to be spelled that way.
 *
 * If nothing left is a settlement — a mountain, say, which is a perfectly
 * good place to want the weather for — the other features are offered rather
 * than nothing.
 */
export function rankHits(hits: GeocodeHit[], query: string): PlaceCandidate[] {
    const all: Ranked[] = [];
    hits.forEach((hit, order) => {
        if (typeof hit.latitude !== 'number' || typeof hit.longitude !== 'number') return;
        const name = displayName(hit.name ?? '', query) || 'Unknown';
        const match = matchLevel(name, query);

        all.push({
            place: {
                lat: hit.latitude,
                lon: hit.longitude,
                name,
                admin1: tidyRegion(hit.admin1 || undefined),
                country: hit.country_code || undefined,
                timezone: hit.timezone || undefined,
            },
            population: hit.population && hit.population > 0 ? hit.population : undefined,
            match,
            standing: standing(hit.feature_code),
            settlement: isSettlement(hit.feature_code),
            order,
        });
    });

    const settled = all.filter((r) => r.settlement);
    const pool = settled.length ? settled : all;

    pool.sort(
        (a, b) =>
            a.match - b.match ||
            b.standing - a.standing ||
            (b.population ?? 0) - (a.population ?? 0) ||
            a.order - b.order
    );

    const kept: Ranked[] = [];
    for (const candidate of pool) {
        const twin = kept.some(
            (k) =>
                nameSkeleton(k.place.name) === nameSkeleton(candidate.place.name) &&
                k.place.admin1 === candidate.place.admin1 &&
                k.place.country === candidate.place.country &&
                distanceKm(k.place, candidate.place) < SAME_PLACE_KM
        );
        if (!twin) kept.push(candidate);
        if (kept.length === SEARCH_RESULTS) break;
    }

    return kept.map(({ place, population }) => ({ place, population }));
}

/**
 * Which script a query is written in, mapped to the language that indexes it.
 *
 * The provider matches names within one language at a time, and it is the
 * *query* that decides which one is right — not the interface. Typing
 * "Махачкала" with `language=en` returns nothing at all, while the same query
 * with `language=ru` finds it immediately; so a person whose Obsidian is in
 * English simply could not type a Russian city name, which is exactly the
 * complaint. Only scripts that are unambiguous about their language are listed:
 * Latin is shared by too many to guess from, so it defers to the interface.
 */
const SCRIPT_LANGUAGES: ReadonlyArray<{ test: RegExp; lang: string }> = [
    { test: /[\u0400-\u04FF]/, lang: 'ru' },
    { test: /[\u4E00-\u9FFF]/, lang: 'zh' },
    { test: /[\u3040-\u30FF]/, lang: 'ja' },
    { test: /[\uAC00-\uD7AF]/, lang: 'ko' },
    { test: /[\u0900-\u097F]/, lang: 'hi' },
];

/**
 * The language to search a query in: the one its script implies, else the
 * interface's.
 */
export function searchLanguage(query: string, uiLang = 'en'): string {
    return SCRIPT_LANGUAGES.find((s) => s.test.test(query))?.lang ?? uiLang;
}

/**
 * One request. Null when it failed, as distinct from an empty answer: "the
 * search is unreachable" and "there is no such place" are different things to
 * tell someone, and only one of them is worth remembering.
 */
async function searchIn(name: string, lang: string): Promise<GeocodeHit[] | null> {
    try {
        const res = await requestUrl({
            url:
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}` +
                `&count=${SEARCH_FETCH}&language=${encodeURIComponent(lang)}&format=json`,
        });
        return res.json?.results ?? [];
    } catch {
        return null;
    }
}

/**
 * Answers already fetched this session, by language and query.
 *
 * Typing is not a straight line: "Ставрополь", a slip, backspace, retype asks
 * for the same prefixes twice, and each was a round trip. Failures are not
 * kept, so a dropped connection is retried the next time the text changes.
 */
const searchCache = new Map<string, PlaceCandidate[]>();
const SEARCH_CACHE_MAX = 60;

/**
 * Search for a place by name, in whatever language it was typed in. Null when
 * the search could not be reached.
 *
 * The script decides which index to ask; `lang` only localises the answers and
 * settles the Latin case. A query that comes back empty is tried once more in
 * the interface's language, which covers the reverse mistake — a Latin
 * transliteration of a name the local index only holds in its own script, and
 * anything the script table is too coarse for.
 */
export async function searchPlaces(query: string, lang = 'en'): Promise<PlaceCandidate[] | null> {
    const name = query.trim();
    if (!name) return [];

    const key = `${lang}|${name.toLowerCase()}`;
    const cached = searchCache.get(key);
    if (cached) return cached;

    const byScript = searchLanguage(name, lang);
    let hits = await searchIn(name, byScript);
    if (hits && !hits.length && byScript !== lang) hits = await searchIn(name, lang);
    if (!hits) return null;

    const ranked = rankHits(hits, name);
    if (searchCache.size >= SEARCH_CACHE_MAX) searchCache.clear();
    searchCache.set(key, ranked);
    return ranked;
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
