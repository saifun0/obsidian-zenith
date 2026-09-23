import { preferredPlace, type GeoPlace } from '../../services/geocode';
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
 * Where to compute for: the module's own override, else the plugin-wide
 * location. Null means the user hasn't said yet, and every surface then asks
 * rather than guessing.
 *
 * This used to fall through to the *weather* module's place, which was a
 * stand-in for a setting that did not exist yet — and meant a prayer tracker
 * could only find your city when the weather widget happened to be configured.
 */
export function prayerPlaceOf(
    settings: Pick<ZenithSettings, 'prayerPlace' | 'location'>
): GeoPlace | null {
    return preferredPlace(settings.prayerPlace, settings.location);
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
    | 'prayerRounding'
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
        rounding: settings.prayerRounding,
    };
}
