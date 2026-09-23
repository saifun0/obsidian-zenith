import type { ZenithSettings } from '../../store/settingsSlice';
import {
    apiDay,
    apiState,
    clearApiCache,
    ensureApiMonth,
    refreshApiMonth,
    type ApiMidnight,
    type PrayerApiOptions,
} from './prayerApi';
import { prayerCalcOptions } from './prayerOptions';
import { prayerTimes, type DayTimes, type GeoPoint, type PrayerTimeId } from './prayerTimes';

/**
 * Which of the two engines answers, and what happens when the first one can't.
 *
 * The module computed times locally and only locally, and said so proudly: the
 * sun is a solved problem and a tracker that needs a request to say when
 * maghrib is would be useless in a basement. That reasoning still holds — it is
 * why this file exists rather than a plain `await`.
 *
 * So the service is the source and the arithmetic is the floor. Every surface
 * reads synchronously, gets the local answer on the first frame, and is told to
 * repaint when the month lands. Offline, mid-flight, or against a service
 * having a bad day, the times are the ones this device worked out — which are
 * right, just not necessarily the ones the local calendar prints.
 *
 * The per-prayer adjustments are applied here for both engines rather than
 * being sent along as the service's own `tune`, so "maghrib, two minutes later"
 * means one thing regardless of where the numbers came from.
 */

/** Which engine a day's times actually came from. */
export type TimesOrigin = 'local' | 'api' | 'fallback';

export interface ResolvedTimes {
    times: DayTimes;
    /** `fallback` means the service was asked for and the arithmetic answered. */
    origin: TimesOrigin;
}

/**
 * Everything either engine reads.
 *
 * A `Pick` rather than the whole settings object, for the reason the calculation
 * options already are: adding a field that changes the times is then a compile
 * error at every caller instead of a silent `undefined` at one of them.
 */
export type PrayerSourceSettings = Pick<
    ZenithSettings,
    | 'prayerSource'
    | 'prayerApiMidnight'
    | 'prayerMethod'
    | 'prayerFajrAngle'
    | 'prayerIshaAngle'
    | 'prayerAsrMadhab'
    | 'prayerHighLatRule'
    | 'prayerAdjustments'
    | 'prayerHijriOffset'
    | 'prayerRounding'
>;

export function prayerApiOptionsOf(settings: PrayerSourceSettings): PrayerApiOptions {
    return {
        method: settings.prayerMethod,
        fajrAngle: settings.prayerFajrAngle,
        ishaAngle: settings.prayerIshaAngle,
        hanafi: settings.prayerAsrMadhab === 'hanafi',
        highLatRule: settings.prayerHighLatRule,
        midnight: settings.prayerApiMidnight as ApiMidnight,
    };
}

/** `YYYY-MM-DD` from a Date's local calendar fields. */
function localIso(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The mosque offsets, applied to whatever the engine produced. */
function withAdjustments(
    times: Record<PrayerTimeId, number>,
    adjustments: Record<string, number> | undefined
): Record<PrayerTimeId, number> {
    if (!adjustments || !Object.keys(adjustments).length) return times;
    const out = { ...times };
    for (const id of Object.keys(out) as PrayerTimeId[]) {
        const delta = adjustments[id];
        if (delta && Number.isFinite(out[id])) out[id] += delta;
    }
    return out;
}

/**
 * Start whatever fetching this day needs, and say nothing.
 *
 * Cheap to call on every render — a month already held, or already in flight,
 * costs a lookup — and a no-op in local mode, which is what keeps a user who
 * chose the arithmetic from making a single request.
 */
export function ensurePrayerDay(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): void {
    if (!place || settings.prayerSource !== 'api') return;
    ensureApiMonth(place, date, prayerApiOptionsOf(settings));
}

/**
 * One day's times, from the configured source, falling back to the arithmetic.
 *
 * Synchronous by design: see the note at the top of the file.
 */
export function resolveDayTimes(
    place: GeoPoint,
    date: Date,
    settings: PrayerSourceSettings
): ResolvedTimes {
    const adjustments = settings.prayerAdjustments;

    if (settings.prayerSource === 'api') {
        const opts = prayerApiOptionsOf(settings);
        const fromApi = apiDay(place, date, opts, localIso(date));
        if (fromApi) {
            const times = withAdjustments(fromApi.times, adjustments);
            return {
                times: { ...fromApi, times, invalid: fromApi.invalid },
                origin: 'api',
            };
        }
    }

    // `prayerCalcOptions` applies the adjustments itself, so they are not
    // reapplied here — doing both would double every offset.
    const local = prayerTimes(place, date, prayerCalcOptions(settings, date));
    return { times: local, origin: settings.prayerSource === 'api' ? 'fallback' : 'local' };
}

/** Times only, for the callers that don't care where they came from. */
export function dayTimesFor(
    place: GeoPoint,
    date: Date,
    settings: PrayerSourceSettings
): DayTimes {
    return resolveDayTimes(place, date, settings).times;
}

/**
 * Whether the service is still being waited on for this day.
 *
 * Separate from the origin, because "showing local times while the month is in
 * flight" and "showing local times because the request failed" look identical
 * on screen and only the second one is worth telling anyone about.
 */
export function prayerApiPending(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): boolean {
    if (!place || settings.prayerSource !== 'api') return false;
    const state = apiState(place, date, prayerApiOptionsOf(settings));
    return state === 'loading' || state === 'idle';
}

/**
 * Throw away every cached month and ask again for the one `date` falls in.
 *
 * The settings page's button. Only this month is refetched — the rest arrive on
 * their own as days are browsed, and fetching a year to satisfy a button press
 * would be a dozen requests nobody asked for.
 *
 * Returns whether the service answered, so the caller can say so.
 */
export async function refreshPrayerTimes(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): Promise<boolean> {
    clearApiCache();
    if (!place || settings.prayerSource !== 'api') return false;
    return refreshApiMonth(place, date, prayerApiOptionsOf(settings));
}
