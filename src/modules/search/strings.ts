/**
 * Search strings, merged into the dictionary in `core/i18n.ts`. The module's
 * name and description are in its own chunk, `i18n.ts`.
 *
 * `command.<id>` names Zenith's commands in Zenith's language. Obsidian shows
 * them in English only, in its own palette; Search shows them translated and
 * finds them by either name. A module can also name its own in its chunk, as
 * `module.<its id>.command.<command id>`.
 */
export const SEARCH_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'search.placeholder': 'Find in Zenith, or type to add a task…',
        'search.empty': 'Nothing found.',
        'search.recent': 'Recent',
        'search.group.views': 'Views',
        'search.group.actions': 'Actions',
        'search.create.task': 'Task',
        'search.create.project': 'New project',
        'search.create.journal': 'Journal entry',
        'search.created.content': 'Zenith: “{title}” added to the library.',
        'search.created.journal': 'Zenith: written to today’s note.',
        'search.journal.note': 'Note for {date}',
        'search.done': 'Done',
        'search.hint.move': 'to move',
        'search.hint.open': 'to open',
        'search.hint.create': 'to create',
        'search.hint.done': 'done',
        'search.hint.note': 'the note',
        'search.hint.close': 'to close',
        'search.ribbon': 'Search Zenith',

        'settings.searchHotkey': 'Hotkey',
        'settings.searchHotkey.desc':
            'Opens Search from anywhere. None is set to begin with, so it cannot clash with another plugin’s.',
        'settings.searchHotkey.none': 'Not set',
        'settings.searchHotkey.set': 'Set…',
        'settings.searchHotkey.phone':
            'On a phone: the magnifier in Obsidian’s menu, or pin “Zenith: Search” to the toolbar.',

        'command.quick-add-task': 'Quick add task',
        'command.open-notifications': 'Open notifications',
        'command.open-week-note': 'Open this week’s note',
        'command.open-month-note': 'Open this month’s note',
        'command.open-quarter-note': 'Open this quarter’s note',
        'command.open-year-note': 'Open this year’s note',
        'command.year-in-review': 'Year in review',
        'command.ritual-morning': 'Morning ritual',
        'command.ritual-evening': 'Evening review',
        'command.mark-current-prayer': 'Mark the current prayer as prayed',
        'command.prayer-times-today': 'Show today’s prayer times',
        'command.new-project': 'New project',
        'command.study-import': 'Paste a timetable',
        'command.study-edit': 'Edit the timetable',
        'command.study-edit-json': 'Edit the timetable as JSON',
        'command.study-copy-prompt': 'Copy the AI prompt for a timetable',
        'command.sync-now': 'Sync settings now',
        'command.sync-files-now': 'Sync note files now',
    },
    ru: {
        'search.placeholder': 'Найти в Zenith или написать задачу…',
        'search.empty': 'Ничего не нашлось.',
        'search.recent': 'Недавнее',
        'search.group.views': 'Виды',
        'search.group.actions': 'Действия',
        'search.create.task': 'Задача',
        'search.create.project': 'Новый проект',
        'search.create.journal': 'Запись в дневник',
        'search.created.content': 'Zenith: «{title}» добавлено в библиотеку.',
        'search.created.journal': 'Zenith: записано в заметку дня.',
        'search.journal.note': 'Заметка за {date}',
        'search.done': 'Выполнено',
        'search.hint.move': 'выбрать',
        'search.hint.open': 'открыть',
        'search.hint.create': 'создать',
        'search.hint.done': 'выполнено',
        'search.hint.note': 'заметка',
        'search.hint.close': 'закрыть',
        'search.ribbon': 'Поиск по Zenith',

        'settings.searchHotkey': 'Горячая клавиша',
        'settings.searchHotkey.desc':
            'Открывает Search откуда угодно. Сначала не назначена, чтобы не столкнуться с клавишей другого плагина.',
        'settings.searchHotkey.none': 'Не назначена',
        'settings.searchHotkey.set': 'Назначить…',
        'settings.searchHotkey.phone':
            'На телефоне — лупа в меню Obsidian, или закрепите «Zenith: Search» в панели инструментов.',

        'command.quick-add-task': 'Быстро добавить задачу',
        'command.open-notifications': 'Открыть уведомления',
        'command.open-week-note': 'Заметка этой недели',
        'command.open-month-note': 'Заметка этого месяца',
        'command.open-quarter-note': 'Заметка этого квартала',
        'command.open-year-note': 'Заметка этого года',
        'command.year-in-review': 'Итоги года',
        'command.ritual-morning': 'Утренний ритуал',
        'command.ritual-evening': 'Итог дня',
        'command.mark-current-prayer': 'Отметить текущий намаз',
        'command.prayer-times-today': 'Время намазов на сегодня',
        'command.new-project': 'Новый проект',
        'command.study-import': 'Вставить расписание',
        'command.study-edit': 'Изменить расписание',
        'command.study-edit-json': 'Изменить расписание в JSON',
        'command.study-copy-prompt': 'Скопировать промпт для расписания',
        'command.sync-now': 'Синхронизировать настройки',
        'command.sync-files-now': 'Синхронизировать файлы заметок',
    },
};
