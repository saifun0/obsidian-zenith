import type { TranslationTable } from '../../core/i18n';

/**
 * Sync — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const syncTranslations: TranslationTable = {
    en: {
        'module.sync.name': 'Sync',
        'module.sync.desc': 'Merge settings across your devices instead of overwriting them.',
    },
    ru: {
        'module.sync.name': 'Синхронизация',
        'module.sync.desc': 'Настройки объединяются между устройствами, а не перезаписываются.',
    },
};
