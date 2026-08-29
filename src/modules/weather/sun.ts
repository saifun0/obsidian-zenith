/**
 * Where the sun is, and where day turns into night.
 *
 * The card used to shade night from Open-Meteo's per-hour `is_day` flag, which
 * has two problems. It quantises to whole hours, so the boundary could sit up
 * to 30 minutes from the real sunset — while the exact sunrise/sunset times
 * were being fetched all along and used only as text. And it shaded *night*
 * with a wash built from the text colour, which on a dark theme is near-white:
 * night rendered lighter than day, exactly backwards.
 *
 * So this module works from the real times instead, in fractional positions
 * rather than hour indices, and hands back a gradient whose stops the CSS can
 * colour per theme.
 *
 * All times here are the **location's** wall clock. Open-Meteo is queried with
 * `timezone=auto`, so every string it returns — hourly stamps, sunrise, sunset —
 * shares one clock, and comparing them to each other is always valid. Comparing
 * them to the device's clock is not, which is what `locationNowMs` is for.
 */

import type { DailyForecast, WeatherData } from './weatherTypes';

/** How long the sky takes to turn, either side of the horizon crossing. */
const TWILIGHT_MS = 30 * 60 * 1000;

const MS_PER_MINUTE = 60_000;

/**
 * A wall-clock ISO string as a comparable number.
 *
 * `2025-06-15T05:05` carries no zone designator, so it parses as local time.
 * That is deliberate: it makes every value from one response land on a single
 * consistent scale, which is all the comparisons here need.
 */
export function wallClockMs(iso: string): number {
    if (!iso) return NaN;
    return new Date(iso).getTime();
}

/**
 * "Now" on the location's wall clock.
 *
 * `hourly[0]` is the top of the current hour *there*, so adding however far the
 * device is into its own hour gives the right instant on the right clock —
 * without needing to know either time zone. Falls back to the device clock when
 * there's no series to anchor to.
 */
export function locationNowMs(data: WeatherData, now: Date): number {
    const anchor = wallClockMs(data.hourly[0]?.time ?? '');
    if (!Number.isFinite(anchor)) return now.getTime();
    return anchor + now.getMinutes() * MS_PER_MINUTE + now.getSeconds() * 1000;
}

/** `2025-06-15T05:05` → `05:05`. Empty when there's no time to show. */
export function clockLabel(iso: string): string {
    return iso.length >= 16 ? iso.slice(11, 16) : '';
}

/**
 * Seconds → `14h 25m`. Used for day length and sunshine hours, where the point
 * is comparing one day against another, so the minutes have to survive.
 */
export function formatDuration(seconds: number, hourUnit: string, minuteUnit: string): string {
    const total = Math.max(0, Math.round(seconds / 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}${minuteUnit}`;
    return `${h}${hourUnit} ${m}${minuteUnit}`;
}

export interface SkyStop {
    /** Position across the window, 0–1. */
    offset: number;
    /** Whether the sky is lit at this stop. */
    day: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Gradient stops describing daylight across a time window.
 *
 * Every horizon crossing becomes a pair of stops half an hour apart, so the
 * band ramps through twilight instead of switching on a hard edge — which is
 * both what the sky does and what stops the boundary from reading as a data
 * artefact. Returns an empty list when the days carry no sun times at all
 * (polar summer, or a response that omitted them), and callers then draw no
 * band rather than a wrong one.
 */
export function skyStops(startMs: number, endMs: number, days: DailyForecast[]): SkyStop[] {
    const span = endMs - startMs;
    if (!(span > 0)) return [];

    const events = days
        .flatMap((d) => [
            { at: wallClockMs(d.sunrise), day: true },
            { at: wallClockMs(d.sunset), day: false },
        ])
        .filter((e) => Number.isFinite(e.at))
        .sort((a, b) => a.at - b.at);

    if (!events.length) return [];

    // State at the window's start: whatever the last crossing before it made it.
    // With no earlier crossing, the first one tells us by implication — if the
    // sun is about to set, it is currently up.
    const earlier = events.filter((e) => e.at <= startMs);
    let state = earlier.length ? earlier[earlier.length - 1].day : !events[0].day;

    const stops: SkyStop[] = [{ offset: 0, day: state }];
    for (const e of events) {
        if (e.day === state) continue;
        if (e.at + TWILIGHT_MS <= startMs || e.at - TWILIGHT_MS >= endMs) continue;
        stops.push({ offset: clamp01((e.at - TWILIGHT_MS - startMs) / span), day: state });
        state = e.day;
        stops.push({ offset: clamp01((e.at + TWILIGHT_MS - startMs) / span), day: state });
    }
    stops.push({ offset: 1, day: state });
    return stops;
}

/**
 * Where a moment sits across a window, 0–1 — or null when it falls outside.
 * Used to place the sunrise and sunset markers, which must simply not render
 * when the window doesn't contain them.
 */
export function windowOffset(iso: string, startMs: number, endMs: number): number | null {
    const at = wallClockMs(iso);
    if (!Number.isFinite(at) || endMs <= startMs) return null;
    if (at < startMs || at > endMs) return null;
    return (at - startMs) / (endMs - startMs);
}

export interface SunArc {
    /** How far through the day the sun is, 0–1. Null before dawn / after dusk. */
    progress: number | null;
    /** Whether the sun is currently up. */
    isUp: boolean;
    /** Seconds until the next horizon crossing. */
    untilNextSec: number;
    /** Which crossing that is. */
    next: 'sunrise' | 'sunset';
}

/**
 * The sun's progress across today's arc, plus how long is left of it.
 *
 * `progress` is null outside daylight so the arc can draw the sun parked at the
 * horizon rather than extrapolating it below ground.
 */
export function sunArc(data: WeatherData, nowMs: number): SunArc | null {
    const today = data.daily[0];
    if (!today?.sunrise || !today?.sunset) return null;

    const rise = wallClockMs(today.sunrise);
    const set = wallClockMs(today.sunset);
    if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return null;

    if (nowMs < rise) {
        return {
            progress: null,
            isUp: false,
            untilNextSec: Math.round((rise - nowMs) / 1000),
            next: 'sunrise',
        };
    }
    if (nowMs > set) {
        // After sunset the next crossing is tomorrow's sunrise, when we have it.
        const tomorrow = wallClockMs(data.daily[1]?.sunrise ?? '');
        return {
            progress: null,
            isUp: false,
            untilNextSec: Number.isFinite(tomorrow) ? Math.round((tomorrow - nowMs) / 1000) : 0,
            next: 'sunrise',
        };
    }
    return {
        progress: (nowMs - rise) / (set - rise),
        isUp: true,
        untilNextSec: Math.round((set - nowMs) / 1000),
        next: 'sunset',
    };
}

/**
 * Solar noon, on the location's wall clock.
 *
 * The midpoint between sunrise and sunset *is* solar noon — the sun's path is
 * symmetric about it, and the only thing that breaks the symmetry is the
 * declination drifting over the course of one day, which moves the midpoint by
 * a few seconds. So this needs no ephemeris, and it is exact enough that the
 * minute it prints is the minute the sun is highest.
 */
export function solarNoonMs(day: DailyForecast | undefined): number | null {
    const rise = wallClockMs(day?.sunrise ?? '');
    const set = wallClockMs(day?.sunset ?? '');
    if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return null;
    return rise + (set - rise) / 2;
}

/** `HH:MM` for a wall-clock instant, the round trip of `wallClockMs`. */
export function clockFromMs(ms: number): string {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Which sky the location is under right now. */
export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface SkyLook {
    phase: SkyPhase;
    /**
     * How dark it is, 0–1. Full day is 0, deep night is 1, and the horizon
     * crossing is exactly halfway — so the stars can fade in over twilight
     * rather than switching on at sunset.
     */
    nightness: number;
}

/**
 * The colour of the sky over the location, as a phase and a continuous darkness.
 *
 * Both come off one number: the signed distance to the nearer horizon crossing,
 * positive while the sun is up. `Math.min` of "since sunrise" and "until
 * sunset" gives it for free — during the day both are positive and the smaller
 * one is the nearer crossing; outside it exactly one is negative, and that one
 * is the distance to the horizon.
 */
export function skyLook(data: WeatherData, nowMs: number): SkyLook {
    const today = data.daily[0];
    const rise = wallClockMs(today?.sunrise ?? '');
    const set = wallClockMs(today?.sunset ?? '');
    // No sun times at all — polar, or a truncated response. Draw a plain day
    // rather than a night the data never claimed.
    if (!Number.isFinite(rise) || !Number.isFinite(set)) return { phase: 'day', nightness: 0 };

    const sinceRise = nowMs - rise;
    const untilSet = set - nowMs;
    const toHorizon = Math.min(sinceRise, untilSet);

    const nightness = clamp01(0.5 - toHorizon / (2 * TWILIGHT_MS));
    if (nightness <= 0) return { phase: 'day', nightness: 0 };
    if (nightness >= 1) return { phase: 'night', nightness: 1 };
    // Mid-twilight: whichever crossing is nearer names it.
    const dawn = Math.abs(sinceRise) <= Math.abs(untilSet);
    return { phase: dawn ? 'dawn' : 'dusk', nightness };
}
