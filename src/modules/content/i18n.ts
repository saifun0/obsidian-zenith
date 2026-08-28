import type { TranslationTable } from '../../core/i18n';

/**
 * Content — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const contentTranslations: TranslationTable = {
    en: {
        'module.content.name': 'Content',
        'module.content.desc': 'Manage your articles, notes, and long-form content.',
    },
    ru: {
        'module.content.name': 'Контент',
        'module.content.desc': 'Статьи, заметки и длинные тексты в одном месте.',
    },
};
