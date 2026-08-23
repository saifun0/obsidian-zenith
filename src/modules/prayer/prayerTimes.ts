import {
    ASR_SHADOW_FACTOR,
    findMethod,
    PRAYERS,
    type AsrMadhab,
    type HighLatRule,
    type PrayerId,
} from './prayerConfig';

/**
 * Prayer times, computed locally.
 *
 * No network: the sun's position is a solved problem, and a tracker that needs
 * a request to tell you when maghrib is would be useless on a phone in a
 * basement. The algorithm is the standard one (Meeus' low-precision solar
 * position, as arranged by PrayTimes.org) — sun angle for fajr and isha, shadow
 * length for asr, transit for dhuhr.
 *
 * Everything here is a pure function of (place, date, options), which is what
 * makes it testable: given the same three, the same minute comes out on any
 * device, at any hour of the day.
 *
 * Times come back as **minutes from local midnight**, deliberately unclamped —
 * an isha that falls after midnight is 1470, not 30, because "half past one,
 * tomorrow" and "half past one, this morning" order differently against now.
 */

// ── Degree-based trigonometry ────────────────────────
// The formulas below are published in degrees. Converting at every call site
// instead would be four conversions per term and one transcription error.

const DEG = Math.PI / 180;
const dsin = (d: number): number => Math.sin(d * DEG);
const dcos = (d: number): number => Math.cos(d * DEG);
const dtan = (d: number): number => Math.tan(d * DEG);
const darcsin = (x: number): number => Math.asin(x) / DEG;
const darccos = (x: number): number => Math.acos(x) / DEG;
const darctan2 = (y: number, x: number): number => Math.atan2(y, x) / DEG;
const darccot = (x: number): number => Math.atan(1 / x) / DEG;

/** Fold a value into `[0, range)`, keeping negatives positive. */
function wrap(value: number, range: number): number {
    const v = value - range * Math.floor(value / range);
    return v < 0 ? v + range : v;
}

const fixAngle = (a: number): number => wrap(a, 360);
const fixHour = (h: number): number => wrap(h, 24);

/**
 * Sun altitude at sunrise/sunset: half a degree of disc plus the usual
 * refraction figure. The same angle defines maghrib for every method that
 * doesn't wait for deeper twilight.
 */
const RISE_SET_ANGLE = 0.833;

export type PrayerTimeId = PrayerId | 'sunrise' | 'sunset' | 'midnight' | 'lastThird';

/** Display order across a day. */
export const TIME_IDS: readonly PrayerTimeId[] = [
    'fajr',
    'sunrise',
    'dhuhr',
    'asr',
    'maghrib',
    'isha',
    'midnight',
    'lastThird',
] as const;

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface PrayerCalcOptions {
    /** Method id from `PRAYER_METHODS`. */
    method: string;
    /** Used only by the `custom` method. */
    fajrAngle?: number;
    ishaAngle?: number;
    asrMadhab: AsrMadhab;
    highLatRule: HighLatRule;
    /** ±minutes per time, applied last. For matching a specific mosque. */
    adjustments?: Partial<Record<PrayerTimeId, number>>;
    /** Umm al-Qura pushes isha 30 minutes later during Ramadan. */
    isRamadan?: boolean;
    /**
     * Minutes east of UTC. Defaults to the **device's** offset at noon on the
     * given date, which is right for the overwhelmingly common case of a person
     * standing where their device is, and handles daylight saving by reading
     * the offset for that specific day.
     */
    tzOffsetMinutes?: number;
}

export interface DayTimes {
    /** Local calendar date the times were computed for, `YYYY-MM-DD`. */
    date: string;
    /** Minutes from local midnight. `NaN` where the time doesn't exist. */
    times: Record<PrayerTimeId, number>;
    /** Times that couldn't be computed even after the high-latitude rule. */
    invalid: PrayerTimeId[];
}

interface Ctx {
    /** Julian day at local midnight, shifted by longitude. */
    jDate: number;
    lat: number;
}

/** Julian day number for a civil date at 0h UT. */
function julianDay(year: number, month: number, day: number): number {
    let y = year;
    let m = month;
    if (m <= 2) {
        y -= 1;
        m += 12;
    }
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** The sun's declination and the equation of time, both for instant `jd`. */
function sunPosition(jd: number): { decl: number; eqt: number } {
    const d = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * d);
    const q = fixAngle(280.459 + 0.98564736 * d);
    const l = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));
    const e = 23.439 - 0.00000036 * d;
    const ra = fixHour(darctan2(dcos(e) * dsin(l), dcos(l)) / 15);
    const decl = darcsin(dsin(e) * dsin(l));
    // Folded into ±12 h. `q/15` and `ra` are each folded into [0, 24), so their
    // raw difference jumps by a whole day whenever one wraps and the other has
    // not — a correction of a quarter of an hour would arrive as −23¾.
    const eqt = fixHour(q / 15 - ra + 12) - 12;
    return { decl, eqt };
}

/** Local solar noon, in hours. */
function midDay(ctx: Ctx, t: number): number {
    return fixHour(12 - sunPosition(ctx.jDate + t).eqt);
}

/**
 * When the sun sits `angle` degrees below the horizon, in hours.
 *
 * NaN when it never gets there — a fact about the latitude and the season, not
 * an error, and the high-latitude rule is what decides on the substitute.
 */
function sunAngleTime(ctx: Ctx, angle: number, t: number, ccw: boolean): number {
    const { decl } = sunPosition(ctx.jDate + t);
    const noon = midDay(ctx, t);
    const arg = (-dsin(angle) - dsin(decl) * dsin(ctx.lat)) / (dcos(decl) * dcos(ctx.lat));
    if (!(arg >= -1 && arg <= 1)) return NaN;
    const hourAngle = darccos(arg) / 15;
    return ccw ? noon - hourAngle : noon + hourAngle;
}

/** When an object's shadow reaches `factor` times its length, plus noon shadow. */
function asrTime(ctx: Ctx, factor: number, t: number): number {
    const { decl } = sunPosition(ctx.jDate + t);
    const angle = -darccot(factor + dtan(Math.abs(ctx.lat - decl)));
    return sunAngleTime(ctx, angle, t, false);
}

/** The share of the night a high-latitude substitute is placed at. */
function nightPortion(rule: HighLatRule, angle: number, night: number): number {
    if (rule === 'angleBased') return (angle / 60) * night;
    if (rule === 'seventhOfNight') return night / 7;
    return night / 2;
}

/**
 * Replace a time the sun never reached with one derived from the night's length.
 *
 * Also applies when the time *does* exist but sits absurdly far from its base —
 * that's the case just below the polar circle, where fajr creeps to within
 * minutes of midnight and the published calendars stop following the sun too.
 */
function adjustHighLat(
    time: number,
    base: number,
    angle: number,
    night: number,
    rule: HighLatRule,
    ccw: boolean
): number {
    if (rule === 'none' || !Number.isFinite(night)) return time;
    const portion = nightPortion(rule, angle, night);
    const diff = Number.isFinite(time) ? (ccw ? fixHour(base - time) : fixHour(time - base)) : Infinity;
    if (diff > portion) return ccw ? base - portion : base + portion;
    return time;
}

/** The device's UTC offset in minutes at noon on a date (DST-correct). */
function deviceOffsetMinutes(year: number, month: number, day: number): number {
    return -new Date(year, month - 1, day, 12).getTimezoneOffset();
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` from a Date's local calendar fields. */
function localIso(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Every time for one day at one place.
 *
 * The computation runs twice: each time is first estimated from a rough hour,
 * then recomputed with the sun's position taken at its own instant. One pass is
 * out by up to a minute at the solstices, which is exactly when someone would
 * notice.
 */
export function prayerTimes(place: GeoPoint, date: Date, opts: PrayerCalcOptions): DayTimes {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const method = findMethod(opts.method);
    const custom = method.id === 'custom';
    const fajrAngle = custom ? (opts.fajrAngle ?? method.fajrAngle) : method.fajrAngle;
    const ishaAngle =
        custom
            ? (opts.ishaAngle ?? 17)
            : method.isha.kind === 'angle'
              ? method.isha.angle
              : 0;
    const maghribAngle = method.maghribAngle ?? RISE_SET_ANGLE;
    const shadowFactor = ASR_SHADOW_FACTOR[opts.asrMadhab] ?? 1;
    const ishaByAngle = custom || method.isha.kind === 'angle';

    const ctx: Ctx = { jDate: julianDay(year, month, day) - place.lon / (15 * 24), lat: place.lat };

    // Rough starting hours; two refinement passes settle them to the minute.
    let h = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
    const at = (value: number, fallback: number): number =>
        (Number.isFinite(value) ? value : fallback) / 24;

    for (let pass = 0; pass < 2; pass++) {
        h = {
            fajr: sunAngleTime(ctx, fajrAngle, at(h.fajr, 5), true),
            sunrise: sunAngleTime(ctx, RISE_SET_ANGLE, at(h.sunrise, 6), true),
            dhuhr: midDay(ctx, at(h.dhuhr, 12)),
            asr: asrTime(ctx, shadowFactor, at(h.asr, 13)),
            sunset: sunAngleTime(ctx, RISE_SET_ANGLE, at(h.sunset, 18), false),
            maghrib: sunAngleTime(ctx, maghribAngle, at(h.maghrib, 18), false),
            isha: ishaByAngle
                ? sunAngleTime(ctx, ishaAngle, at(h.isha, 18), false)
                : at(h.isha, 18) * 24,
        };
    }

    // Length of the night, for both the high-latitude fallbacks and the
    // tahajjud marks. Taken sunset→sunrise: those two exist on every day that
    // has any sun at all, whereas fajr may be exactly what's missing.
    const night = fixHour(h.sunrise - h.sunset);

    h.fajr = adjustHighLat(h.fajr, h.sunrise, fajrAngle, night, opts.highLatRule, true);
    h.maghrib = adjustHighLat(h.maghrib, h.sunset, maghribAngle, night, opts.highLatRule, false);
    if (ishaByAngle) {
        h.isha = adjustHighLat(h.isha, h.sunset, ishaAngle, night, opts.highLatRule, false);
    } else if (method.isha.kind === 'minutes') {
        const minutes =
            opts.isRamadan && method.isha.ramadan !== undefined
                ? method.isha.ramadan
                : method.isha.minutes;
        h.isha = h.maghrib + minutes / 60;
    }

    // The night a person praying tahajjud is dividing runs from maghrib to
    // fajr, not to sunrise — the last third has to end when fajr comes in.
    const worshipNight = Number.isFinite(h.fajr) ? fixHour(h.fajr - h.sunset) : night;
    const midnight = h.sunset + worshipNight / 2;
    const lastThird = h.sunset + (worshipNight * 2) / 3;

    const tzHours = (opts.tzOffsetMinutes ?? deviceOffsetMinutes(year, month, day)) / 60;
    const correction = tzHours - place.lon / 15;
    const adjustments = opts.adjustments ?? {};

    const raw: Record<PrayerTimeId, number> = {
        fajr: h.fajr,
        sunrise: h.sunrise,
        dhuhr: h.dhuhr,
        asr: h.asr,
        sunset: h.sunset,
        maghrib: h.maghrib,
        isha: h.isha,
        midnight,
        lastThird,
    };

    const times = {} as Record<PrayerTimeId, number>;
    const invalid: PrayerTimeId[] = [];
    for (const id of Object.keys(raw) as PrayerTimeId[]) {
        const hours = raw[id] + correction;
        if (!Number.isFinite(hours)) {
            times[id] = NaN;
            invalid.push(id);
            continue;
        }
        times[id] = Math.round(hours * 60) + (adjustments[id] ?? 0);
    }

    return { date: localIso(date), times, invalid };
}

// ── Reading the result ───────────────────────────────

/** Minutes from local midnight for a moment. */
export function minutesOfDay(at: Date): number {
    return at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
}

/** A `Date` for `minutes` from midnight on the day of `date`. */
export function dateAtMinutes(date: Date, minutes: number): Date {
    const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    out.setMinutes(Math.round(minutes));
    return out;
}

/** `05:12` — or `5:12 AM` where that's what the locale does. */
export function formatClock(minutes: number, locale: string): string {
    if (!Number.isFinite(minutes)) return '—';
    const at = new Date(2000, 0, 1);
    at.setMinutes(wrap(minutes, 1440));
    return at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * `1 ч 20 мин` / `45 мин` — how long until something, at minute resolution.
 *
 * Units are passed in rather than looked up, so this stays a pure function and
 * the caller's translator decides the language. Rounds **up**: a countdown that
 * reads "0 min" for the last fifty-nine seconds looks stopped.
 */
export function formatCountdown(minutes: number, hourUnit: string, minuteUnit: string): string {
    const total = Math.max(0, Math.ceil(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}${minuteUnit}`;
    if (m === 0) return `${h}${hourUnit}`;
    return `${h}${hourUnit} ${m}${minuteUnit}`;
}

export interface PrayerWindow {
    id: PrayerId;
    /** Minutes from midnight when it comes in. */
    start: number;
    /**
     * When it goes out. For isha this is the next day's fajr, so the value
     * exceeds 1440 — which is the point: the window doesn't end at midnight.
     */
    end: number;
}

/**
 * The five obligatory prayers as windows.
 *
 * Each ends where the next begins, except fajr (which ends at sunrise, not at
 * dhuhr — the hours after sunrise belong to no obligatory prayer) and isha
 * (which runs to the next fajr). Times that don't exist are skipped rather than
 * producing a window with a NaN edge.
 */
export function prayerWindows(times: Record<PrayerTimeId, number>): PrayerWindow[] {
    const ends: Record<PrayerId, PrayerTimeId> = {
        fajr: 'sunrise',
        dhuhr: 'asr',
        asr: 'maghrib',
        maghrib: 'isha',
        isha: 'fajr',
    };

    const windows: PrayerWindow[] = [];
    for (const id of PRAYERS) {
        const start = times[id];
        if (!Number.isFinite(start)) continue;
        const rawEnd = times[ends[id]];
        // Isha closes at tomorrow's fajr; without the day added it would look
        // like a window that ended before it opened.
        const end = id === 'isha' ? rawEnd + 1440 : rawEnd;
        windows.push({ id, start, end: Number.isFinite(end) ? end : start });
    }
    return windows;
}

export interface NextPrayer {
    id: PrayerId;
    /** Minutes from midnight — over 1440 when it's tomorrow's fajr. */
    at: number;
    minutesAway: number;
    tomorrow: boolean;
}

/** The next obligatory prayer after `nowMinutes`, wrapping to tomorrow's fajr. */
export function nextPrayer(
    times: Record<PrayerTimeId, number>,
    nowMinutes: number
): NextPrayer | null {
    for (const id of PRAYERS) {
        const at = times[id];
        if (Number.isFinite(at) && at > nowMinutes) {
            return { id, at, minutesAway: at - nowMinutes, tomorrow: false };
        }
    }
    const fajr = times.fajr;
    if (!Number.isFinite(fajr)) return null;
    const at = fajr + 1440;
    return { id: 'fajr', at, minutesAway: at - nowMinutes, tomorrow: true };
}

/**
 * The prayer whose window is open now, or null before the day's first one.
 *
 * Before fajr the answer is yesterday's isha, whose window is still running —
 * so the caller gets `isha` with `fromYesterday`, and a tap at 01:00 records
 * the prayer the user actually means.
 */
export function currentPrayer(
    times: Record<PrayerTimeId, number>,
    nowMinutes: number
): { id: PrayerId; fromYesterday: boolean } | null {
    let current: PrayerId | null = null;
    for (const id of PRAYERS) {
        if (Number.isFinite(times[id]) && times[id] <= nowMinutes) current = id;
    }
    if (current) return { id: current, fromYesterday: false };
    return Number.isFinite(times.isha) ? { id: 'isha', fromYesterday: true } : null;
}

/** Whether a prayer's time has come in, on a day that is `today`. */
export function hasEntered(
    times: Record<PrayerTimeId, number>,
    id: PrayerId,
    nowMinutes: number
): boolean {
    const at = times[id];
    return Number.isFinite(at) && at <= nowMinutes;
}
