import type { ZenithSettings } from '../../store/settingsSlice';
import { prayerCalcOptions } from './prayerOptions';
import type { PrayerApiOptions } from './prayerProvider';
import { ensureTable, refreshTable, tableDay, tableState } from './prayerTable';
import {
    prayerTimes,
    TIME_IDS,
    type DayTimes,
    type GeoPoint,
    type PrayerTimeId,
} from './prayerTimes';

/**
 * Which of the two engines answers, and what happens when the first one can't.
 *
 * The module computed times locally and only locally, and said so proudly: the
 * sun is a solved problem and a tracker that needs a request to say when
 * maghrib is would be useless in a basement. That reasoning still holds — it is
 * why this file exists rather than a plain `await`.
 *
 * So the published table is the source and the arithmetic is the floor —
 * unless the user would rather see a dash than a time the table might not
 * print. Every surface reads synchronously, gets an answer on the first frame,
 * and is told to repaint when the year lands.
 *
 * The per-prayer adjustments are applied here for both engines rather than
 * being sent along as the service's own `tune`, so "maghrib, two minutes later"
 * means one thing regardless of where the numbers came from.
 */

/**
 * Which engine a day's times actually came from. `fallback` means the table was
 * asked for and the arithmetic answered; `missing`, that it was asked for and
 * nothing is shown in its place.
 */
export type TimesOrigin = 'local' | 'api' | 'fallback' | 'missing';

export interface ResolvedTimes {
    times: DayTimes;
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
    | 'prayerFallback'
>;

export function prayerApiOptionsOf(settings: PrayerSourceSettings): PrayerApiOptions {
    return {
        method: settings.prayerMethod,
        fajrAngle: settings.prayerFajrAngle,
        ishaAngle: settings.prayerIshaAngle,
        hanafi: settings.prayerAsrMadhab === 'hanafi',
        highLatRule: settings.prayerHighLatRule,
        midnight: settings.prayerApiMidnight,
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

/** A day with no times at all: every surface already draws those as a dash. */
function emptyDay(iso: string): DayTimes {
    const times = { sunset: NaN } as Record<PrayerTimeId, number>;
    for (const id of TIME_IDS) times[id] = NaN;
    return { date: iso, times, invalid: [...TIME_IDS, 'sunset'] };
}

/**
 * Start whatever fetching this day needs, and say nothing.
 *
 * Cheap to call on every render — a year already held, or already in flight,
 * costs a lookup — and a no-op in local mode, which is what keeps a user who
 * chose the arithmetic from making a single request.
 */
export function ensurePrayerDay(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): void {
    if (!place || settings.prayerSource !== 'api') return;
    ensureTable(place, date, prayerApiOptionsOf(settings));
}

/**
 * One day's times, from the configured source, falling back to the arithmetic
 * or to nothing, as chosen.
 *
 * Synchronous by design: see the note at the top of the file.
 */
export function resolveDayTimes(
    place: GeoPoint,
    date: Date,
    settings: PrayerSourceSettings
): ResolvedTimes {
    if (settings.prayerSource === 'api') {
        const published = tableDay(place, date, prayerApiOptionsOf(settings));
        if (published) {
            const times = withAdjustments(published, settings.prayerAdjustments);
            const invalid = (Object.keys(times) as PrayerTimeId[]).filter(
                (id) => !Number.isFinite(times[id])
            );
            return { times: { date: localIso(date), times, invalid }, origin: 'api' };
        }
        if (settings.prayerFallback === 'none') {
            return { times: emptyDay(localIso(date)), origin: 'missing' };
        }
    }

    // `prayerCalcOptions` applies the adjustments itself, so they are not
    // reapplied here — doing both would double every offset.
    const local = prayerTimes(place, date, prayerCalcOptions(settings, date));
    return { times: local, origin: settings.prayerSource === 'api' ? 'fallback' : 'local' };
}

/** Times only, for the callers that don't care where they came from. */
export function dayTimesFor(place: GeoPoint, date: Date, settings: PrayerSourceSettings): DayTimes {
    return resolveDayTimes(place, date, settings).times;
}

/**
 * Whether the table is still being waited on for this day.
 *
 * Separate from the origin, because "not loaded yet" and "could not be loaded"
 * look identical on screen and deserve different words.
 */
export function prayerTablePending(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): boolean {
    if (!place || settings.prayerSource !== 'api') return false;
    const state = tableState(place, date, prayerApiOptionsOf(settings));
    return state === 'loading' || state === 'idle';
}

/**
 * Fetch this year's table again, now. The settings page's button.
 *
 * Returns whether the service answered, so the caller can say so.
 */
export async function refreshPrayerTimes(
    place: GeoPoint | null,
    date: Date,
    settings: PrayerSourceSettings
): Promise<boolean> {
    if (!place || settings.prayerSource !== 'api') return false;
    return refreshTable(place, date, prayerApiOptionsOf(settings));
}
