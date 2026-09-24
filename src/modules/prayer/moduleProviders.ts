import { guardedAsync } from '../../core/extensions/health';
import { extensions, type PrayerProviderEntry } from '../../core/extensions/registry';
import { ALADHAN, unwrapDay, type PrayerProvider, type YearDays } from './prayerProvider';

/**
 * A module's timetable as one of the prayer module's table providers — so it
 * is fetched a year at a time, cached on the device and refreshed exactly
 * like Aladhan's, and a failure falls back the same way.
 */
export function moduleTableProvider(entry: PrayerProviderEntry): PrayerProvider {
    return {
        id: `module_${entry.moduleId}_${entry.id}`,
        host: `module:${entry.moduleId}`,
        // The module decides its own method; nothing in Zenith's options
        // changes its answer.
        shape: () => 'module',
        async fetchYear(place, year) {
            const raw = await guardedAsync(
                entry.moduleId,
                `prayer provider "${entry.id}"`,
                () => entry.year(year, place),
                null
            );
            if (!raw || typeof raw !== 'object') return null;
            const days: YearDays = {};
            for (const [date, times] of Object.entries(raw)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !times) continue;
                const day = unwrapDay({
                    Fajr: times.fajr,
                    Sunrise: times.sunrise,
                    Dhuhr: times.dhuhr,
                    Asr: times.asr,
                    Sunset: times.maghrib,
                    Maghrib: times.maghrib,
                    Isha: times.isha,
                });
                if (day) days[date] = day;
            }
            return Object.keys(days).length ? days : null;
        },
    };
}

/** `<module>:<id>` of a registered provider — what the setting stores. */
export const providerKey = (entry: PrayerProviderEntry) => `${entry.moduleId}:${entry.id}`;

/** The provider the setting names, or Aladhan when it names none that is here. */
export function resolveTableProvider(providerId: string): PrayerProvider {
    if (!providerId) return ALADHAN;
    const entry = extensions.prayerProviders.list().find((p) => providerKey(p) === providerId);
    return entry ? moduleTableProvider(entry) : ALADHAN;
}
