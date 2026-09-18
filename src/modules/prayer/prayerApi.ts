import { requestUrl } from 'obsidian';
import { TIME_IDS, type DayTimes, type GeoPoint, type PrayerTimeId } from './prayerTimes';

/**
 * Prayer times from a published calendar, rather than from our own arithmetic.
 *
 * The local calculation is correct astronomy, and it will still disagree with
 * the mosque down the road: every muftiate rounds, pads and prints its own
 * table, and matching *that* is what a person actually wants from a prayer
 * tracker. So this asks Aladhan, which is the service those tables are usually
 * generated from, and which needs no key and no account.
 *
 * Three decisions worth keeping:
 *
 * **A month per request.** Every surface here browses days — the week strip,
 * the statistics, yesterday's missed isha — and a request per day would be
 * thirty requests to draw one screen. One call covers the whole month and every
 * one of those reads is then a cache hit.
 *
 * **The device's clock.** `timezonestring` is sent as the machine's own zone,
 * not the location's, so the times land on the same clock the local calculation
 * uses and the same clock "now" is read from. Without it a place in another
 * zone would come back correct and compare wrong.
 *
 * **No `tune`.** The per-prayer offsets are applied by the caller instead, from
 * the same setting, so a mosque adjustment means one thing in both modes and
 * nothing depends on the provider's parameter order.
 *
 * Failure is never thrown: everything resolves to null, and the caller falls
 * back to computing the day itself. A prayer tracker that shows nothing without
 * a network would be worse than one that never asked.
 */

const API_BASE = 'https://api.aladhan.com/v1/calendar';

const CACHE_PREFIX = 'zenith:prayerapi:v1';

/**
 * A month's table is a published fact, so it is only refetched to pick up a
 * provider correction. The cache key already carries every setting that changes
 * the answer, which is what a shorter TTL would otherwise be for.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Obsidian's `requestUrl` takes no AbortSignal, so this only frees the slot. */
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Our method ids against Aladhan's numbers.
 *
 * `russia` maps to 14 — the Spiritual Administration's own entry — which is the
 * whole reason this mode is worth having here. Anything unlisted falls through
 * to 99, the custom method, carrying our own angles.
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

/** Where the middle of the night is measured to. */
export type ApiMidnight = 'toFajr' | 'toSunrise';

export interface PrayerApiOptions {
    /** Our method id, e.g. `russia`. */
    method: string;
    /** Only read when the method is `custom`. */
    fajrAngle?: number;
    ishaAngle?: number;
    /** Hanafi asr asks the service for `school=1`. */
    hanafi: boolean;
    highLatRule: string;
    midnight: ApiMidnight;
    /** IANA zone to report times on. Defaults to the device's. */
    timezone?: string;
}

/** One fetched month: ISO date → minutes from local midnight, per time. */
type MonthTimes = Record<string, Record<PrayerTimeId, number>>;

interface CachedMonth {
    times: MonthTimes;
    fetchedAt: number;
}

export type ApiState = 'idle' | 'loading' | 'ok' | 'error';

const memory = new Map<string, CachedMonth>();
const inFlight = new Map<string, Promise<CachedMonth | null>>();
const states = new Map<string, ApiState>();

// ── Change notification ──────────────────────────────
// A month landing has to repaint whatever is on screen, and the surfaces that
// need it are React hooks, the reminder timer and a command. One revision
// counter serves all three without any of them knowing about the others.

let revision = 0;
const listeners = new Set<() => void>();

export function subscribeApi(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function apiRevision(): number {
    return revision;
}

function bumpRevision(): void {
    revision += 1;
    for (const listener of listeners) listener();
}

// ── Keys ─────────────────────────────────────────────

/**
 * Everything that changes the answer, in one string.
 *
 * Coordinates are rounded to three decimals — about a hundred metres, which is
 * far below the minute the times are published at — so nudging a pin does not
 * orphan a month of cache.
 */
function monthKey(place: GeoPoint, year: number, month: number, opts: PrayerApiOptions): string {
    const at = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    const shape = [
        opts.method,
        opts.method === 'custom' ? `${opts.fajrAngle ?? ''}/${opts.ishaAngle ?? ''}` : '',
        opts.hanafi ? 'h' : 's',
        opts.highLatRule,
        opts.midnight,
        opts.timezone ?? deviceZone(),
    ].join('|');
    return `${at}|${year}-${String(month).padStart(2, '0')}|${shape}`;
}

function deviceZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

// ── Persistence ──────────────────────────────────────

function readPersisted(key: string): CachedMonth | null {
    try {
        const raw = window.localStorage.getItem(`${CACHE_PREFIX}:${key}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedMonth;
        if (!parsed?.times || typeof parsed.fetchedAt !== 'number') return null;
        return parsed;
    } catch {
        return null;
    }
}

function writePersisted(key: string, value: CachedMonth): void {
    try {
        window.localStorage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify(value));
    } catch {
        /* quota, or a platform without localStorage */
    }
}

/** Drop every cached month. The refresh button's whole job. */
export function clearApiCache(): void {
    memory.clear();
    states.clear();
    try {
        const stale: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key?.startsWith(CACHE_PREFIX)) stale.push(key);
        }
        for (const key of stale) window.localStorage.removeItem(key);
    } catch {
        /* nothing to clear */
    }
    bumpRevision();
}

// ── Parsing ──────────────────────────────────────────

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
function unwrapDay(timings: Record<string, unknown>): Record<PrayerTimeId, number> | null {
    const out = {} as Record<PrayerTimeId, number>;
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

function parseMonth(payload: unknown): MonthTimes | null {
    const data = (payload as { data?: unknown })?.data;
    // v1 returns an array; some deployments key it by day-of-month instead.
    const days = Array.isArray(data)
        ? data
        : data && typeof data === 'object'
          ? Object.values(data as Record<string, unknown>)
          : null;
    if (!days?.length) return null;

    const times: MonthTimes = {};
    for (const entry of days) {
        const day = entry as { timings?: Record<string, unknown>; date?: { gregorian?: { date?: unknown } } };
        const iso = gregorianToIso(day?.date?.gregorian?.date);
        if (!iso || !day.timings) continue;
        const parsed = unwrapDay(day.timings);
        if (parsed) times[iso] = parsed;
    }
    return Object.keys(times).length ? times : null;
}

// ── Fetching ─────────────────────────────────────────

function buildUrl(place: GeoPoint, year: number, month: number, opts: PrayerApiOptions): string {
    const params = new URLSearchParams({
        latitude: String(place.lat),
        longitude: String(place.lon),
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

    return `${API_BASE}/${year}/${month}?${params.toString()}`;
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

async function fetchMonth(
    key: string,
    place: GeoPoint,
    year: number,
    month: number,
    opts: PrayerApiOptions
): Promise<CachedMonth | null> {
    const response = await withTimeout(
        requestUrl({ url: buildUrl(place, year, month, opts), throw: false })
    );
    if (!response || response.status !== 200) return null;

    let times: MonthTimes | null = null;
    try {
        times = parseMonth(response.json);
    } catch {
        times = null;
    }
    if (!times) return null;

    const cached: CachedMonth = { times, fetchedAt: Date.now() };
    memory.set(key, cached);
    writePersisted(key, cached);
    return cached;
}

/** A cached month, from memory or from the last session, if it is still fresh. */
function cachedMonth(key: string): CachedMonth | null {
    const held = memory.get(key) ?? readPersisted(key);
    if (!held) return null;
    memory.set(key, held);
    // Stale is still served: a table printed last month is right for the days
    // it covers. Freshness only decides whether to spend another request.
    return held;
}

/**
 * Whether a month is stale enough to be worth asking about again. Stale data is
 * still served — a table from last year is right for the day it covers — so
 * this only decides whether to spend a request.
 */
function isStale(held: CachedMonth | null): boolean {
    return !held || Date.now() - held.fetchedAt > TTL_MS;
}

/**
 * Make sure the month containing `date` is on its way, and say nothing.
 *
 * Safe to call on every render: a month already held, or already being fetched,
 * costs a map lookup.
 */
export function ensureApiMonth(place: GeoPoint, date: Date, opts: PrayerApiOptions): void {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = monthKey(place, year, month, opts);

    if (inFlight.has(key)) return;
    if (!isStale(cachedMonth(key))) {
        states.set(key, 'ok');
        return;
    }

    states.set(key, 'loading');
    const pending = fetchMonth(key, place, year, month, opts).finally(() => {
        inFlight.delete(key);
    });
    inFlight.set(key, pending);
    void pending.then((result) => {
        states.set(key, result ? 'ok' : 'error');
        bumpRevision();
    });
}

/**
 * The service's times for one day, or null when they aren't held.
 *
 * Synchronous on purpose: every caller can paint immediately from whatever is
 * cached and re-read when `subscribeApi` fires, which is what keeps the local
 * calculation available as a first frame rather than a spinner.
 */
export function apiDayTimes(
    place: GeoPoint,
    date: Date,
    opts: PrayerApiOptions
): Record<PrayerTimeId, number> | null {
    const key = monthKey(place, date.getFullYear(), date.getMonth() + 1, opts);
    const held = cachedMonth(key);
    if (!held) return null;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')}`;
    return held.times[iso] ?? null;
}

/** What the last attempt at this month came to. */
export function apiState(place: GeoPoint, date: Date, opts: PrayerApiOptions): ApiState {
    const key = monthKey(place, date.getFullYear(), date.getMonth() + 1, opts);
    if (inFlight.has(key)) return 'loading';
    if (cachedMonth(key)) return 'ok';
    return states.get(key) ?? 'idle';
}

/**
 * Fetch the month containing `date` and report whether it worked.
 *
 * The settings page's refresh button, which is the one place a person is
 * waiting on the answer rather than reading times that are already on screen.
 */
export async function refreshApiMonth(
    place: GeoPoint,
    date: Date,
    opts: PrayerApiOptions
): Promise<boolean> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = monthKey(place, year, month, opts);
    states.set(key, 'loading');
    const result = await fetchMonth(key, place, year, month, opts);
    states.set(key, result ? 'ok' : 'error');
    bumpRevision();
    return result !== null;
}

/** Everything `DayTimes` needs, for a day the service has answered for. */
export function apiDay(
    place: GeoPoint,
    date: Date,
    opts: PrayerApiOptions,
    iso: string
): DayTimes | null {
    const times = apiDayTimes(place, date, opts);
    if (!times) return null;
    const invalid = (Object.keys(times) as PrayerTimeId[]).filter((id) => !Number.isFinite(times[id]));
    return { date: iso, times, invalid };
}

export const __testing = { clockToMinutes, gregorianToIso, unwrapDay, parseMonth, buildUrl };
