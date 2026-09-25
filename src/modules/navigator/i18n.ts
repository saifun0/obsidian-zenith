import type { TranslationTable } from '../../core/i18n';

/**
 * Navigation — the strings the module brings with it.
 *
 * Its name and description live here rather than in Zenith's own dictionary,
 * so a module's strings are registered with the module and go with it.
 *
 * `module.<id>.name` and `module.<id>.desc` are the two keys every list of
 * modules looks for.
 */
export const navigatorTranslations: TranslationTable = {
    en: {
        'module.navigator.name': 'Navigation',
        'module.navigator.desc':
            'A launcher on the dashboard and a side panel, with a button for every Zenith view.',
        'module.navigator.command.open-side-panel': 'Open the side panel',

        'navigator.panel.edit': 'Arrange the panel',
        'navigator.panel.done': 'Done',
        'navigator.panel.editing': 'Arranging',
        'navigator.panel.buttons': 'Buttons',
        'navigator.panel.views': 'Views',
        'navigator.panel.add': 'Add a command',
        'navigator.panel.pick': 'A command to make a button of…',
        'navigator.panel.move': 'Move: drag, or ↑ ↓',
        'navigator.panel.icon': 'Change the icon',
        'navigator.panel.label': 'Name on the button',
        'navigator.panel.remove': 'Remove',
        'navigator.panel.hide': 'Hide',
        'navigator.panel.show': 'Show',
        'navigator.panel.moduleOff': 'Its module is off, so the button is hidden.',
        'navigator.panel.missing': 'Obsidian has no such command now. Its plugin may be off.',
        'navigator.panel.shared':
            "The order and the hidden views are the same in the dashboard's Navigation card.",
        'navigator.panel.unavailable': "That command can't run here.",
        'navigator.panel.off':
            "Navigation is off. Switch it on in Zenith's settings, in the list of modules.",
        'navigator.panel.empty': 'Nothing here yet. The pencil above adds buttons.',

        // A button's own name, for Zenith's commands: a word or two where the
        // palette's full sentence would wrap onto three lines.
        'navigator.short.quick-add-task': 'New task',
        'navigator.short.search': 'Search',
        'navigator.short.mark-current-prayer': 'Mark prayer',
        'navigator.short.prayer-times-today': 'Prayer times',
        'navigator.short.sync-files-now': 'Sync notes',
        'navigator.short.new-project': 'New project',
        'navigator.short.ritual-morning': 'Morning',
        'navigator.short.ritual-evening': 'Evening',
        'navigator.short.open-notifications': 'Notifications',
        'navigator.short.year-in-review': 'Year in review',
        'navigator.short.open-week-note': 'This week',
        'navigator.short.open-month-note': 'This month',
        'navigator.short.open-quarter-note': 'This quarter',
        'navigator.short.open-year-note': 'This year',
        'navigator.short.open-today-note': 'Today',
        'navigator.short.open-dashboard': 'Dashboard',
        'navigator.short.open-tasks': 'Tasks',
        'navigator.short.open-tasks-calendar': 'Calendar',
        'navigator.short.open-projects': 'Projects',
        'navigator.short.open-content': 'Content',
        'navigator.short.open-journal': 'Journal',
        'navigator.short.open-prayer': 'Prayer',
        'navigator.short.open-study': 'Study',
        'navigator.short.open-sync': 'Sync',
        'navigator.short.open-media-picker': 'Image picker',
    },
    ru: {
        'module.navigator.name': 'Навигация',
        'module.navigator.desc':
            'Панель запуска на дашборде и боковая панель: кнопка на каждый экран Zenith.',
        'module.navigator.command.open-side-panel': 'Открыть боковую панель',

        'navigator.panel.edit': 'Настроить панель',
        'navigator.panel.done': 'Готово',
        'navigator.panel.editing': 'Настройка',
        'navigator.panel.buttons': 'Кнопки',
        'navigator.panel.views': 'Разделы',
        'navigator.panel.add': 'Добавить команду',
        'navigator.panel.pick': 'Команда для новой кнопки…',
        'navigator.panel.move': 'Переместить: перетащите или ↑ ↓',
        'navigator.panel.icon': 'Сменить иконку',
        'navigator.panel.label': 'Название на кнопке',
        'navigator.panel.remove': 'Убрать',
        'navigator.panel.hide': 'Скрыть',
        'navigator.panel.show': 'Показать',
        'navigator.panel.moduleOff': 'Её модуль выключен, поэтому кнопка скрыта.',
        'navigator.panel.missing': 'Такой команды сейчас нет. Возможно, её плагин выключен.',
        'navigator.panel.shared':
            'Порядок и скрытые разделы те же, что в карточке «Навигация» на дашборде.',
        'navigator.panel.unavailable': 'Эту команду здесь нельзя выполнить.',
        'navigator.panel.off':
            'Навигация выключена. Включите её в настройках Zenith, в списке модулей.',
        'navigator.panel.empty': 'Пока пусто. Карандаш сверху добавляет кнопки.',

        'navigator.short.quick-add-task': 'Новая задача',
        'navigator.short.search': 'Поиск',
        'navigator.short.mark-current-prayer': 'Отметить намаз',
        'navigator.short.prayer-times-today': 'Время намазов',
        'navigator.short.sync-files-now': 'Синхронизировать',
        'navigator.short.new-project': 'Новый проект',
        'navigator.short.ritual-morning': 'Утро',
        'navigator.short.ritual-evening': 'Итог дня',
        'navigator.short.open-notifications': 'Уведомления',
        'navigator.short.year-in-review': 'Итоги года',
        'navigator.short.open-week-note': 'Неделя',
        'navigator.short.open-month-note': 'Месяц',
        'navigator.short.open-quarter-note': 'Квартал',
        'navigator.short.open-year-note': 'Год',
        'navigator.short.open-today-note': 'Сегодня',
        'navigator.short.open-dashboard': 'Дашборд',
        'navigator.short.open-tasks': 'Задачи',
        'navigator.short.open-tasks-calendar': 'Календарь',
        'navigator.short.open-projects': 'Проекты',
        'navigator.short.open-content': 'Контент',
        'navigator.short.open-journal': 'Дневник',
        'navigator.short.open-prayer': 'Намаз',
        'navigator.short.open-study': 'Учёба',
        'navigator.short.open-sync': 'Синхронизация',
        'navigator.short.open-media-picker': 'Выбор изображения',
    },
};
