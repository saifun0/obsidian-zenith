import type { TranslationTable } from '../../core/i18n';

/**
 * Journal — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const journalTranslations: TranslationTable = {
    en: {
        'module.journal.name': 'Journal',
        'module.journal.desc': 'Daily notes with a calendar, habit, scale and number tracking.',
    },
    ru: {
        'module.journal.name': 'Дневник',
        'module.journal.desc': 'Ежедневные заметки с календарём и трекерами привычек, шкал и чисел.',
    },
};
