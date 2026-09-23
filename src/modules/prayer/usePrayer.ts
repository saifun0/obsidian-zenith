import { useFeature } from '../../core/useFeature';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useZenithStore } from '../../store';
import { useNow } from '../../core/useNow';
import { isoToDate } from '../journal/services/journalDates';
import type { GeoPlace } from '../../services/geocode';
import { hijriDate, type HijriDate } from './hijri';
import { prayerCalcOptions, prayerPlaceOf } from './prayerOptions';
import { apiRevision, subscribeApi } from './prayerApi';
import {
    dayTimesFor,
    ensurePrayerDay,
    prayerApiPending,
    resolveDayTimes,
    type PrayerSourceSettings,
} from './prayerSource';
import { prayerDaysByDate, type PrayerDay } from './prayerStats';
import { minutesOfDay, type DayTimes, type PrayerCalcOptions } from './prayerTimes';

/**
 * The hooks every prayer surface shares.
 *
 * All three of them — the widget, the view and the code block inside a note —
 * need the same four things: where you are, what today's times are, what has
 * been recorded, and what minute it is. Deriving that in each of them would
 * have them disagreeing within a release.
 *
 * Everything is keyed on the ISO date string rather than on a `Date`, because a
 * `Date` is a new object on every render and would defeat every memo here.
 */

/**
 * Where to compute for: the module's own override, else the plugin-wide
 * location, else nothing.
 *
 * One place, set once, is what the common case needs — and the two can still be
 * set apart, which matters for anyone who watches the forecast somewhere they
 * aren't.
 */
export function usePrayerPlace(): GeoPlace | null {
    const prayerPlace = useZenithStore((s) => s.settings.prayerPlace);
    const location = useZenithStore((s) => s.settings.location);
    return prayerPlaceOf({ prayerPlace, location });
}

/**
 * Everything either engine reads, as one stable object.
 *
 * The fields are selected one by one rather than taking `settings` whole: these
 * feed memos that recompute a whole day, and subscribing to the settings object
 * would redo that every time an unrelated preference changed.
 */
export function usePrayerSourceSettings(): PrayerSourceSettings {
    const source = useZenithStore((s) => s.settings.prayerSource);
    const apiMidnight = useZenithStore((s) => s.settings.prayerApiMidnight);
    const method = useZenithStore((s) => s.settings.prayerMethod);
    const fajrAngle = useZenithStore((s) => s.settings.prayerFajrAngle);
    const ishaAngle = useZenithStore((s) => s.settings.prayerIshaAngle);
    const asrMadhab = useZenithStore((s) => s.settings.prayerAsrMadhab);
    const highLatRule = useZenithStore((s) => s.settings.prayerHighLatRule);
    const adjustments = useZenithStore((s) => s.settings.prayerAdjustments);
    const hijriOffset = useZenithStore((s) => s.settings.prayerHijriOffset);
    const rounding = useZenithStore((s) => s.settings.prayerRounding);

    return useMemo(
        () => ({
            prayerSource: source,
            prayerApiMidnight: apiMidnight,
            prayerMethod: method,
            prayerFajrAngle: fajrAngle,
            prayerIshaAngle: ishaAngle,
            prayerAsrMadhab: asrMadhab,
            prayerHighLatRule: highLatRule,
            prayerAdjustments: adjustments,
            prayerHijriOffset: hijriOffset,
            prayerRounding: rounding,
        }),
        [
            source,
            apiMidnight,
            method,
            fajrAngle,
            ishaAngle,
            asrMadhab,
            highLatRule,
            adjustments,
            hijriOffset,
            rounding,
        ]
    );
}

/** Local calculation options as configured, for a given day. */
export function usePrayerOptions(iso: string): PrayerCalcOptions {
    const settings = usePrayerSourceSettings();
    return useMemo(() => prayerCalcOptions(settings, isoToDate(iso)), [settings, iso]);
}

/**
 * Times for one day, or null when there's nowhere to compute them for.
 *
 * In calendar mode the first frame is still the local calculation — the fetch
 * has not landed yet, and a prayer view that opens empty while a request flies
 * would be a worse trade than showing correct astronomy for a second. The
 * revision counter is what swaps it for the published table when it arrives.
 */
export function useDayTimes(iso: string): DayTimes | null {
    const place = usePrayerPlace();
    const settings = usePrayerSourceSettings();
    const revision = useSyncExternalStore(subscribeApi, apiRevision, apiRevision);

    useEffect(() => {
        ensurePrayerDay(place, isoToDate(iso), settings);
    }, [place, iso, settings]);

    return useMemo(() => {
        if (!place) return null;
        return dayTimesFor(place, isoToDate(iso), settings);
        // `revision` is a dependency without being read: it changes when a
        // month lands, which is what changes the answer `dayTimesFor` finds in
        // the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` invalidates rather than being read — see the comment above it.
    }, [place, iso, settings, revision]);
}

/**
 * Whether this day is showing the arithmetic because the service could not be
 * reached — as opposed to because the user chose it, or because the month is
 * still in flight. Only the first of those is worth a mark on screen.
 */
export function useTimesFallback(iso: string): boolean {
    const place = usePrayerPlace();
    const settings = usePrayerSourceSettings();
    const revision = useSyncExternalStore(subscribeApi, apiRevision, apiRevision);

    return useMemo(() => {
        if (!place || settings.prayerSource !== 'api') return false;
        const date = isoToDate(iso);
        return (
            resolveDayTimes(place, date, settings).origin === 'fallback' &&
            !prayerApiPending(place, date, settings)
        );
        // Same as above: the counter is here to recompute, not to be read.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Same again.
    }, [place, iso, settings, revision]);
}

/** The Hijri date for a day, with the configured offset applied. */
export function useHijri(iso: string): HijriDate | null {
    const offset = useZenithStore((s) => s.settings.prayerHijriOffset);
    return useMemo(() => hijriDate(isoToDate(iso), offset), [iso, offset]);
}

/** Every recorded day, from the daily notes the store already holds. */
export function usePrayerDays(): Map<string, PrayerDay> {
    const entries = useZenithStore((s) => s.journalEntries);
    return useMemo(() => prayerDaysByDate(entries), [entries]);
}

/**
 * Minutes into the current day, re-rendering once a minute.
 *
 * A minute is the resolution prayer times are published at, so a second-hand
 * ticker would only buy a smoother progress bar in exchange for re-rendering
 * the dashboard sixty times as often.
 */
export function useNowMinutes(): number {
    return minutesOfDay(useNow(60_000));
}

const NO_EXTRAS: string[] = [];

/**
 * Voluntary prayers the user has switched on, in canonical order — none at
 * all while the feature is off, which keeps the chosen list for its return.
 */
export function usePrayerExtras(): string[] {
    const on = useFeature('prayer.extras');
    const extras = useZenithStore((s) => s.settings.prayerExtras);
    return on ? extras : NO_EXTRAS;
}
