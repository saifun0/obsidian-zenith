import type { TranslationTable } from '../../core/i18n';

/**
 * Prayer — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const prayerTranslations: TranslationTable = {
    en: {
        'module.prayer.name': 'Prayer',
        'module.prayer.desc': 'Prayer times, from a published calendar or computed here, and a record of what you prayed.',
    },
    ru: {
        'module.prayer.name': 'Намаз',
        'module.prayer.desc': 'Время намаза — из календаря или расчётом на устройстве — и учёт прочитанного.',
    },
};
