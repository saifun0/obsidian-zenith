import { requestUrl } from 'obsidian';
import { TIME_IDS, type GeoPoint, type PrayerTimeId } from './prayerTimes';

/**
 * Where a published prayer table comes from.
 *
 * The local calculation is correct astronomy, and it will still disagree with
 * the mosque down the road: every muftiate rounds, pads and prints its own
 * table, and matching *that* is what a person actually wants from a prayer
 * tracker. A provider is anything that can hand over such a table — a year at
 * a time, because a year is one request, is small once trimmed, and is what
 * lets the module work for months without a network.
 *
 * Only Aladhan is offered today. The contract is here so that another source —
 * a muftiate's own API, a timetable kept in the vault — is a new object, not a
 * new code path through every surface.
 *
 * Failure is never thrown: everything resolves to null, and the caller falls
 * back to what it already has.
 */

/** One day's published times: minutes from local midnight, unclamped. */
export type DayMinutes = Record<PrayerTimeId, number>;

/** A year of them, keyed by `YYYY-MM-DD`. */
export type YearDays = Record<string, DayMinutes>;

/** Where the middle of the night is measured to. */
export type ApiMidnight = 'toFajr' | 'toSunrise';

export interface PrayerApiOptions {
    /** Our method id, e.g. `russia`. */
    method: string;
    /** Only read when the method is `custom`. */
    fajrAngle?: number;
    ishaAngle?: number;
    /** Hanafi asr. */
    hanafi: boolean;
    highLatRule: string;
    midnight: ApiMidnight;
    /** IANA zone to report times on. Defaults to the device's. */
    timezone?: string;
}

export interface PrayerProvider {
    id: string;
    /** The host that receives the (rounded) coordinates — named in the privacy notes. */
    host: string;
    /** Everything in the options that changes this provider's answer, for the cache key. */
    shape(opts: PrayerApiOptions): string;
    fetchYear(place: GeoPoint, year: number, opts: PrayerApiOptions): Promise<YearDays | null>;
}

/**
 * Coordinates as they leave the device: two decimals, about a kilometre.
 *
 * Far below the minute a timetable is printed to — the sun takes four seconds
 * to cross a kilometre of longitude — and far above a street address.
 */
export function roundedPlace(place: GeoPoint): GeoPoint {
    const round = (n: number) => Math.round(n * 100) / 100;
    return { lat: round(place.lat), lon: round(place.lon) };
}

export function deviceZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

// ── Aladhan ──────────────────────────────────────────
//
// Two decisions worth keeping:
//
// **The device's clock.** `timezonestring` is sent as the machine's own zone,
// not the location's, so the times land on the same clock the local
// calculation uses and the same clock "now" is read from — daylight saving
// included, which the service applies per day.
//
// **No `tune`.** The per-prayer offsets are applied by the caller instead, from
// the same setting, so a mosque adjustment means one thing in both modes and
// nothing depends on the provider's parameter order.

const ALADHAN_BASE = 'https://api.aladhan.com/v1/calendar';

/** Obsidian's `requestUrl` takes no AbortSignal, so this only frees the slot. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Our method ids against Aladhan's numbers.
 *
 * `russia` maps to 14 — the Spiritual Administration's own entry. Anything
 * unlisted falls through to 99, the custom method, carrying our own angles
 * (checked against the live service: it honours `methodSettings`).
 */
export const ALADHAN_METHOD: Readonly<Record<string, number>> = {
    jafari: 0,
    karachi: 1,
    isna: 2,
    mwl: 3,
    makkah: 4,
    egypt: 5,
    tehran: 7,
    kuwait: 9,
    qatar: 10,
    singapore: 11,
    turkey: 13,
    russia: 14,
    dubai: 16,
};

/** Aladhan's custom-method number. Takes `methodSettings` with our angles. */
const METHOD_CUSTOM = 99;

/** `latitudeAdjustmentMethod`. `none` is omitted — the service has no such option. */
const ALADHAN_HIGH_LAT: Readonly<Record<string, number>> = {
    middleOfNight: 1,
    seventhOfNight: 2,
    angleBased: 3,
};

/** `"03:57 (+03)"` → 237. NaN when the service said something else. */
function clockToMinutes(raw: unknown): number {
    if (typeof raw !== 'string') return NaN;
    const match = /^\s*(\d{1,2}):(\d{2})/.exec(raw);
    if (!match) return NaN;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
}

/** `"01-08-2026"` → `"2026-08-01"`. Empty when it isn't a date. */
function gregorianToIso(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw.trim());
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

/** Which key of Aladhan's `timings` each of our times comes from. */
const TIMING_FIELD: Record<PrayerTimeId, string> = {
    fajr: 'Fajr',
    sunrise: 'Sunrise',
    dhuhr: 'Dhuhr',
    asr: 'Asr',
    sunset: 'Sunset',
    maghrib: 'Maghrib',
    isha: 'Isha',
    midnight: 'Midnight',
    lastThird: 'Lastthird',
};

/**
 * Wall-clock times → this module's unclamped minutes.
 *
 * The service prints a clock, so an isha at half past midnight comes back as 30
 * and the last third as 130 — both of which sort before that afternoon's asr.
 * Walking the day in order and pushing anything that went backwards into the
 * next day restores the convention the rest of the module counts on, where
 * "after midnight" is a number above 1440 rather than a small one.
 */
export function unwrapDay(timings: Record<string, unknown>): DayMinutes | null {
    const out = {} as DayMinutes;
    let previous = -Infinity;
    let known = 0;

    for (const id of TIME_IDS) {
        const minutes = clockToMinutes(timings[TIMING_FIELD[id]]);
        if (!Number.isFinite(minutes)) {
            out[id] = NaN;
            continue;
        }
        // One day, at most once: the service prints a 24-hour clock, so a time
        // that went backwards did it by crossing midnight exactly once.
        const value = minutes < previous ? minutes + 1440 : minutes;
        out[id] = value;
        previous = value;
        known += 1;
    }

    // `sunset` is not one of TIME_IDS — it is read for the timeline rather than
    // shown as a step of the day — so it is filled in afterwards, on whichever
    // day maghrib ended up on, since the two are minutes apart.
    const sunset = clockToMinutes(timings[TIMING_FIELD.sunset]);
    const maghribDay = Number.isFinite(out.maghrib) ? Math.floor(out.maghrib / 1440) * 1440 : 0;
    out.sunset = Number.isFinite(sunset) ? sunset + maghribDay : NaN;

    // A response that parsed into nothing is a failure wearing a 200.
    return known >= 5 ? out : null;
}

/** A list of the service's day entries → days by ISO date. */
function parseDays(entries: unknown[], into: YearDays): void {
    for (const entry of entries) {
        const day = entry as {
            timings?: Record<string, unknown>;
            date?: { gregorian?: { date?: unknown } };
        };
        const iso = gregorianToIso(day?.date?.gregorian?.date);
        if (!iso || !day.timings) continue;
        const parsed = unwrapDay(day.timings);
        if (parsed) into[iso] = parsed;
    }
}

/**
 * The annual calendar: `data` keyed by month number, each a list of days. A
 * plain list is read as well, which is what a single month looks like — and
 * what some deployments return for the year.
 */
function parseYear(payload: unknown): YearDays | null {
    const data = (payload as { data?: unknown })?.data;
    const days: YearDays = {};
    if (Array.isArray(data)) {
        parseDays(data, days);
    } else if (data && typeof data === 'object') {
        for (const month of Object.values(data as Record<string, unknown>)) {
            if (Array.isArray(month)) parseDays(month, days);
            // Keyed by day of the month rather than listed.
            else if (month && typeof month === 'object') parseDays(Object.values(month), days);
        }
    }
    return Object.keys(days).length ? days : null;
}

function buildYearUrl(place: GeoPoint, year: number, opts: PrayerApiOptions): string {
    const sent = roundedPlace(place);
    const params = new URLSearchParams({
        latitude: String(sent.lat),
        longitude: String(sent.lon),
        school: opts.hanafi ? '1' : '0',
        // 0 = mid sunset→sunrise, 1 = mid sunset→fajr. The local calculation
        // divides the night that is actually being prayed through, so `toFajr`
        // is what makes the two modes agree about tahajjud.
        midnightMode: opts.midnight === 'toFajr' ? '1' : '0',
    });

    const known = ALADHAN_METHOD[opts.method];
    if (known === undefined) {
        params.set('method', String(METHOD_CUSTOM));
        // fajr, maghrib, isha — maghrib left to the service's own figure.
        params.set('methodSettings', `${opts.fajrAngle ?? 18},null,${opts.ishaAngle ?? 17}`);
    } else {
        params.set('method', String(known));
    }

    const highLat = ALADHAN_HIGH_LAT[opts.highLatRule];
    if (highLat !== undefined) params.set('latitudeAdjustmentMethod', String(highLat));

    const zone = opts.timezone ?? deviceZone();
    if (zone) params.set('timezonestring', zone);

    return `${ALADHAN_BASE}/${year}?${params.toString()}`;
}

/** Resolve to null if the request outruns the deadline. */
function withTimeout<T>(work: Promise<T>): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS);
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

export const ALADHAN: PrayerProvider = {
    id: 'aladhan',
    host: 'api.aladhan.com',
    shape(opts) {
        return [
            opts.method === 'custom'
                ? `custom@${opts.fajrAngle ?? ''}_${opts.ishaAngle ?? ''}`
                : opts.method,
            opts.hanafi ? 'h' : 's',
            opts.highLatRule,
            opts.midnight,
            opts.timezone ?? deviceZone(),
        ].join('-');
    },
    async fetchYear(place, year, opts) {
        const response = await withTimeout(
            requestUrl({ url: buildYearUrl(place, year, opts), throw: false })
        );
        if (!response || response.status !== 200) return null;
        try {
            return parseYear(response.json);
        } catch {
            return null;
        }
    },
};

export const __testing = { clockToMinutes, gregorianToIso, unwrapDay, parseYear, buildYearUrl };
