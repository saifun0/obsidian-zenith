import type { TranslationTable } from '../../core/i18n';

/**
 * Dashboard — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const dashboardTranslations: TranslationTable = {
    en: {
        'module.dashboard.name': 'Dashboard',
        'module.dashboard.desc': 'Central hub for an overview of your Zenith data.',
    },
    ru: {
        'module.dashboard.name': 'Дашборд',
        'module.dashboard.desc': 'Главный экран: обзор всех данных Zenith.',
    },
};
