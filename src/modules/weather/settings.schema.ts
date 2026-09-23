import { coreSchema } from '../../settings/schema/types';
import { createPlaceField } from '../../settings/components/PlaceField';

/**
 * Weather settings, as data.
 *
 * `coreSchema` is an identity function whose only job is to make TypeScript
 * check every `key` against `ZenithSettings` at the definition site — a typo
 * here would otherwise be a setting that renders fine and never persists.
 *
 * The location picker is the one `custom` field: it debounces a geocoding
 * request, shows candidates and talks to the device's geolocation, none of
 * which a generic control can express.
 */
export const weatherSettingsSchema = coreSchema({
    moduleId: 'weather',
    groups: [
        {
            id: 'location',
            fields: [
                {
                    type: 'custom',
                    key: 'weatherPlace',
                    row: true,
                    render: createPlaceField({
                        settingsKey: 'weatherPlace',
                        labelKey: 'settings.weatherPlace',
                        descKey: 'settings.weatherPlace.desc',
                        // Clearing the legacy key stops the widget's one-time
                        // migration from re-resolving the old free-text city
                        // over this choice.
                        extraPatch: { weatherCity: '' },
                        inheritsGlobal: true,
                    }),
                },
                {
                    type: 'toggle',
                    key: 'weatherAllowIpLookup',
                    labelKey: 'settings.weatherIpLookup',
                    descKey: 'settings.weatherIpLookup.desc',
                    default: false,
                    // Only reachable when nothing else can answer, so it stays
                    // out of the way until the user is actually relying on
                    // automatic location.
                    showIf: (v) => !v.weatherPlace,
                },
            ],
        },
        {
            id: 'units',
            titleKey: 'settings.weatherUnitsGroup',
            fields: [
                {
                    type: 'segmented',
                    key: 'weatherUnit',
                    labelKey: 'settings.weatherUnit',
                    default: 'c',
                    options: [
                        { value: 'c', label: '°C' },
                        { value: 'f', label: '°F' },
                    ],
                },
            ],
        },
        {
            id: 'sections',
            titleKey: 'settings.weatherSectionsGroup',
            fields: [
                {
                    type: 'select',
                    key: 'weatherForecastDays',
                    labelKey: 'settings.weatherForecast',
                    descKey: 'settings.weatherForecast.desc',
                    default: 10,
                    numeric: true,
                    options: [
                        { value: '0', labelKey: 'settings.weatherForecast.off' },
                        { value: '5', label: '5' },
                        { value: '7', label: '7' },
                        { value: '10', label: '10' },
                    ],
                },
                // The weather's features stay with the forecast they share a
                // card with, rather than in a list of their own above it.
                { type: 'feature', key: 'weather.hourly' },
                { type: 'feature', key: 'weather.sun' },
                { type: 'feature', key: 'weather.air', noteKey: 'settings.weatherPrivacy' },
            ],
        },
    ],
});
