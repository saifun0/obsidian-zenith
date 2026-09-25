import type { TranslationTable } from '../../core/i18n';

/**
 * Tasks — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
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
