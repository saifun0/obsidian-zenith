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
    zh: {
        'module.journal.name': '日记',
        'module.journal.desc': '带日历的每日笔记，可追踪习惯、评分和数字。',
    },
};
