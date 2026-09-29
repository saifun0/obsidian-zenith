import type { TranslationTable } from '../../core/i18n';

/**
 * Search — the module's name and description. "Search" is its name in every
 * language, as the views' tab titles are: it is what the command palette
 * calls it, "Zenith: Search", and one name is easier to find than two.
 */
export const searchTranslations: TranslationTable = {
    en: {
        'module.search.name': 'Search',
        'module.search.desc':
            'Find any view, action, task, project or library item, and add a task, straight from one line.',
    },
    ru: {
        'module.search.name': 'Search',
        'module.search.desc':
            'Найти любой вид, действие, задачу, проект или материал и добавить задачу прямо из одной строки.',
    },
    zh: {
        'module.search.name': '搜索',
        'module.search.desc': '在一行中查找任何视图、操作、任务、项目或媒体库条目，并直接添加任务。',
    },
};
