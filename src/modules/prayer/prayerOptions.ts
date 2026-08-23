import type { GeoPlace } from '../../services/geocode';
import type { ZenithSettings } from '../../store/settingsSlice';
import { isRamadan } from './hijri';
import type { PrayerCalcOptions } from './prayerTimes';

/**
 * Settings → calculation input.
 *
 * Shared by the React hooks and the reminder service, which is the whole point:
 * a notification that fired at a different minute than the widget showed would
 * be worse than no notification.
 */

/**
 * Where to compute for: the prayer module's own place, else whatever the
 * weather module already resolved. Null means the user hasn't said yet, and
 * every surface then asks rather than guessing.
 */
export function prayerPlaceOf(
    settings: Pick<ZenithSettings, 'prayerPlace' | 'weatherPlace'>
): GeoPlace | null {
    return settings.prayerPlace ?? settings.weatherPlace ?? null;
}

/**
 * Exactly the settings the calculation reads.
 *
 * Stated as a `Pick` rather than the whole object so the hook can hand over the
 * seven fields it subscribed to without a cast — and so adding a field here is
 * a compile error at every call site instead of a silent `undefined`.
 */
export type PrayerCalcSettings = Pick<
    ZenithSettings,
    | 'prayerMethod'
    | 'prayerFajrAngle'
    | 'prayerIshaAngle'
    | 'prayerAsrMadhab'
    | 'prayerHighLatRule'
    | 'prayerAdjustments'
    | 'prayerHijriOffset'
>;

export function prayerCalcOptions(settings: PrayerCalcSettings, date: Date): PrayerCalcOptions {
    return {
        method: settings.prayerMethod,
        fajrAngle: settings.prayerFajrAngle,
        ishaAngle: settings.prayerIshaAngle,
        asrMadhab: settings.prayerAsrMadhab,
        highLatRule: settings.prayerHighLatRule,
        adjustments: settings.prayerAdjustments,
        isRamadan: isRamadan(date, settings.prayerHijriOffset),
    };
}
