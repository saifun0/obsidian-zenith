import { useMemo } from 'react';
import { useZenithStore } from '../../store';
import { useNow } from '../../core/useNow';
import { isoToDate } from '../journal/services/journalDates';
import type { GeoPlace } from '../../services/geocode';
import { hijriDate, type HijriDate } from './hijri';
import { prayerCalcOptions, prayerPlaceOf } from './prayerOptions';
import { prayerDaysByDate, type PrayerDay } from './prayerStats';
import {
    minutesOfDay,
    prayerTimes,
    type DayTimes,
    type PrayerCalcOptions,
} from './prayerTimes';

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
 * Where to compute for: the prayer module's own place, else whatever the
 * weather module already resolved, else nothing.
 *
 * Borrowing the weather location means the common case needs no setup at all —
 * and the two can still be set apart, which matters for anyone who watches the
 * forecast somewhere they aren't.
 */
export function usePrayerPlace(): GeoPlace | null {
    const prayerPlace = useZenithStore((s) => s.settings.prayerPlace);
    const weatherPlace = useZenithStore((s) => s.settings.weatherPlace);
    return prayerPlaceOf({ prayerPlace, weatherPlace });
}

/**
 * Calculation options as configured, for a given day.
 *
 * The fields are selected one by one rather than taking `settings` whole: this
 * hook feeds a memo that recomputes the whole day, and subscribing to the
 * settings object would redo it every time an unrelated preference changed.
 */
export function usePrayerOptions(iso: string): PrayerCalcOptions {
    const method = useZenithStore((s) => s.settings.prayerMethod);
    const fajrAngle = useZenithStore((s) => s.settings.prayerFajrAngle);
    const ishaAngle = useZenithStore((s) => s.settings.prayerIshaAngle);
    const asrMadhab = useZenithStore((s) => s.settings.prayerAsrMadhab);
    const highLatRule = useZenithStore((s) => s.settings.prayerHighLatRule);
    const adjustments = useZenithStore((s) => s.settings.prayerAdjustments);
    const hijriOffset = useZenithStore((s) => s.settings.prayerHijriOffset);

    return useMemo(
        () =>
            prayerCalcOptions(
                {
                    prayerMethod: method,
                    prayerFajrAngle: fajrAngle,
                    prayerIshaAngle: ishaAngle,
                    prayerAsrMadhab: asrMadhab,
                    prayerHighLatRule: highLatRule,
                    prayerAdjustments: adjustments,
                    prayerHijriOffset: hijriOffset,
                },
                isoToDate(iso)
            ),
        [method, fajrAngle, ishaAngle, asrMadhab, highLatRule, adjustments, hijriOffset, iso]
    );
}

/** Times for one day, or null when there's nowhere to compute them for. */
export function useDayTimes(iso: string): DayTimes | null {
    const place = usePrayerPlace();
    const options = usePrayerOptions(iso);

    return useMemo(() => {
        if (!place) return null;
        return prayerTimes(place, isoToDate(iso), options);
    }, [place, iso, options]);
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

/** Voluntary prayers the user has switched on, in canonical order. */
export function usePrayerExtras(): string[] {
    return useZenithStore((s) => s.settings.prayerExtras);
}
