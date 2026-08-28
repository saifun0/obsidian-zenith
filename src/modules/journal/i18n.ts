import type { TranslationTable } from '../../core/i18n';

/**
 * Journal — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
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
