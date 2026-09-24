/**
 * Strings added with module API v2 — permissions, safe mode, the activity
 * log and the extension points in built-in views — merged into the
 * dictionary in `core/i18n.ts`.
 */
export const MODULE_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'permission.tasks.read': 'Read your tasks',
        'permission.tasks.write':
            'Change your tasks (status, dates, tags) — through Zenith’s own writer',
        'permission.journal.read': 'Read your daily notes and trackers',
        'permission.journal.write': 'Record values in your daily notes',
        'permission.content.read': 'Read your library',
        'permission.content.write': 'Change items in your library (status, progress)',
        'permission.content.metadata': 'Offer to fill in library items from an outside source',
        'permission.calendar.layers': 'Show its own events on the calendar (read-only)',
        'permission.prayer.provider': 'Offer its own prayer timetable',
        'permission.ui.slots': 'Draw inside Zenith’s views, in the places made for it',
        'permission.features': 'Add switches of its own to Features and profiles',
        'permission.settings': 'Add a section to the settings of “{module}”',
        'permission.network': 'Send requests to {host}',

        'consent.permissions': 'It asks to:',
        'consent.permissions.none':
            'It asks for no access to your Zenith data — only to add views, widgets and commands of its own.',
        'consent.permissions.new': 'new',
        'consent.permissions.honest':
            'This list is an agreement, not a lock: like any plugin, the module could reach further. Zenith gives it only these parts of its API and logs what it writes through them.',
        'consent.permissionsChanged':
            'This module now asks for different permissions than you agreed to.',

        'modules.manifest.badPermission':
            '“{permission}” in manifest.json is not a permission Zenith knows.',
        'modules.problem.safeMode': 'Safe mode is on — no third-party module runs.',
        'modules.problem.disabled': 'Switched off after failing repeatedly: {error}',
        'modules.disabledNotice':
            'Zenith switched off “{name}”: it kept failing. Switch it back on in Settings → Modules.',
        'modules.safeMode.on': 'Safe mode: third-party modules are stopped.',
        'modules.safeMode.off': 'Safe mode is off: third-party modules run again.',
        'modules.details': 'Permissions and activity',
        'modules.permissions': 'Permissions',
        'modules.activity': 'What it wrote',
        'modules.activity.none': 'Nothing yet.',
        'settings.safeMode': 'Safe mode',
        'settings.safeMode.desc':
            'Run no third-party module on this device. They stay installed and enabled, and start again when this is off. Also a command: “Toggle safe mode”.',

        'tasks.moduleActions': 'More — from modules',
        'tasks.filter.moduleAll': 'All tasks',
        'calendar.layers': 'Events from modules',
        'content.form.lookup': 'Fill from {name}',
        'content.form.lookupNone': 'Nothing found.',
        'settings.prayerProvider': 'Timetable from',
        'settings.prayerProvider.desc':
            'Aladhan, or a timetable a module provides — a muftiate’s own, for example.',
    },
    ru: {
        'permission.tasks.read': 'Читать ваши задачи',
        'permission.tasks.write':
            'Менять ваши задачи (статус, даты, теги) — через собственный писатель Zenith',
        'permission.journal.read': 'Читать заметки дня и трекеры',
        'permission.journal.write': 'Записывать значения в заметки дня',
        'permission.content.read': 'Читать вашу библиотеку',
        'permission.content.write': 'Менять записи библиотеки (статус, прогресс)',
        'permission.content.metadata':
            'Предлагать заполнить запись библиотеки из внешнего источника',
        'permission.calendar.layers': 'Показывать свои события в календаре (только чтение)',
        'permission.prayer.provider': 'Предлагать свою таблицу времени намаза',
        'permission.ui.slots': 'Рисовать внутри видов Zenith, в отведённых для этого местах',
        'permission.features': 'Добавлять свои переключатели в «Функции» и профили',
        'permission.settings': 'Добавить раздел в настройки модуля «{module}»',
        'permission.network': 'Отправлять запросы на {host}',

        'consent.permissions': 'Он просит:',
        'consent.permissions.none':
            'Он не просит доступа к вашим данным в Zenith — только добавить свои виды, виджеты и команды.',
        'consent.permissions.new': 'новое',
        'consent.permissions.honest':
            'Этот список — договорённость, а не замок: как любой плагин, модуль может дотянуться дальше. Zenith даёт ему только эти части своего API и записывает, что он через них изменил.',
        'consent.permissionsChanged':
            'Модуль теперь просит другие разрешения, чем те, на которые вы соглашались.',

        'modules.manifest.badPermission':
            '«{permission}» в manifest.json — не разрешение, известное Zenith.',
        'modules.problem.safeMode': 'Включён безопасный режим — сторонние модули не запускаются.',
        'modules.problem.disabled': 'Выключен после повторяющихся сбоев: {error}',
        'modules.disabledNotice':
            'Zenith выключил «{name}»: модуль раз за разом давал сбой. Включить обратно — Настройки → Модули.',
        'modules.safeMode.on': 'Безопасный режим: сторонние модули остановлены.',
        'modules.safeMode.off': 'Безопасный режим выключен: сторонние модули снова работают.',
        'modules.details': 'Разрешения и действия',
        'modules.permissions': 'Разрешения',
        'modules.activity': 'Что он записал',
        'modules.activity.none': 'Пока ничего.',
        'settings.safeMode': 'Безопасный режим',
        'settings.safeMode.desc':
            'Не запускать сторонние модули на этом устройстве. Они остаются установленными и включёнными и снова запускаются, когда режим выключен. Есть и команда: «Toggle safe mode».',

        'tasks.moduleActions': 'Ещё — от модулей',
        'tasks.filter.moduleAll': 'Все задачи',
        'calendar.layers': 'События модулей',
        'content.form.lookup': 'Заполнить из {name}',
        'content.form.lookupNone': 'Ничего не найдено.',
        'settings.prayerProvider': 'Таблица от',
        'settings.prayerProvider.desc':
            'Aladhan или таблица, которую даёт модуль, — например, собственная таблица муфтията.',
    },
};
