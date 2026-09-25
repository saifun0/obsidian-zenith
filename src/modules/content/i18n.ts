import type { TranslationTable } from '../../core/i18n';

/**
 * Content — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
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
