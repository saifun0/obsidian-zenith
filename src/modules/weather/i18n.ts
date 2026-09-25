import type { TranslationTable } from '../../core/i18n';

/**
 * Weather — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const weatherTranslations: TranslationTable = {
    en: {
        'module.weather.name': 'Weather',
        'module.weather.desc': 'A weather widget with hourly, 10-day forecast, sunrise/sunset and °C/°F.',
    },
    ru: {
        'module.weather.name': 'Погода',
        'module.weather.desc': 'Виджет погоды: по часам, прогноз на 10 дней, восход и закат, °C/°F.',
    },
};
