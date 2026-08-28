import type { TranslationTable } from '../../core/i18n';

/**
 * Prayer — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const prayerTranslations: TranslationTable = {
    en: {
        'module.prayer.name': 'Prayer',
        'module.prayer.desc': 'Prayer times, computed locally, and a record of what you prayed.',
    },
    ru: {
        'module.prayer.name': 'Намаз',
        'module.prayer.desc': 'Время намаза, рассчитанное на устройстве, и учёт прочитанного.',
    },
};
