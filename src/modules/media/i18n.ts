import type { TranslationTable } from '../../core/i18n';

/**
 * Media Banner — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const mediaTranslations: TranslationTable = {
    en: {
        'module.media.name': 'Media Banner',
        'module.media.desc': 'Show a GIF or image above the file explorer, with an easy picker.',
    },
    ru: {
        'module.media.name': 'Медиа-баннер',
        'module.media.desc': 'GIF или картинка над проводником файлов, с удобным выбором.',
    },
};
