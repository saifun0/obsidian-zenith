import type { TranslationTable } from '../../core/i18n';

/**
 * Navigation — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const navigatorTranslations: TranslationTable = {
    en: {
        'module.navigator.name': 'Navigation',
        'module.navigator.desc': 'A launcher on the dashboard with a button for every Zenith view.',
    },
    ru: {
        'module.navigator.name': 'Навигация',
        'module.navigator.desc': 'Панель запуска на дашборде: кнопка на каждый экран Zenith.',
    },
};
