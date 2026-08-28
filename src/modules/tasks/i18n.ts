import type { TranslationTable } from '../../core/i18n';

/**
 * Tasks — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary
 * because this is the door a third-party module has to use, and a door only
 * built-in modules can open is one that quietly stops working.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const tasksTranslations: TranslationTable = {
    en: {
        'module.tasks.name': 'Tasks',
        'module.tasks.desc': 'Manage your tasks, projects, and daily to-dos.',
    },
    ru: {
        'module.tasks.name': 'Задачи',
        'module.tasks.desc': 'Задачи, проекты и дела на каждый день.',
    },
};
