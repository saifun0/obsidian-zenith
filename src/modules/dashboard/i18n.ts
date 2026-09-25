import type { TranslationTable } from '../../core/i18n';

/**
 * Dashboard — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
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
