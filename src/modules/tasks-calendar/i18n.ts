import type { TranslationTable } from '../../core/i18n';

/**
 * Tasks Calendar — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const tasksCalendarTranslations: TranslationTable = {
    en: {
        'module.tasks-calendar.name': 'Tasks Calendar',
        'module.tasks-calendar.desc': 'See your tasks on a month, week or agenda calendar.',
    },
    ru: {
        'module.tasks-calendar.name': 'Календарь задач',
        'module.tasks-calendar.desc': 'Задачи на календаре: месяц, неделя или список.',
    },
};
