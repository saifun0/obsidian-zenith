import type { TranslationTable } from '../../core/i18n';

/**
 * Weather — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
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
