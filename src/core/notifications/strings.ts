/** The notification center's words, merged into the dictionary in `i18n.ts`. */
export const NOTIFY_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'settings.notifications': 'Notifications',
        'settings.notifications.desc': 'Reminders, quiet hours and the notification center',
        'settings.notify.delivery': 'How they reach you',
        'settings.notify.delivery.desc':
            'Reminders appear while Obsidian is open. On a phone they can only appear inside Obsidian — a plugin cannot use the phone’s notifications. Whatever you miss waits in the center.',
        'settings.notifySystem': 'System notifications',
        'settings.notifySystem.desc':
            'Also show the computer’s own notification, so it reaches you in another window. On this device only.',
        'settings.notifyQuietFrom': 'Quiet hours from',
        'settings.notifyQuietFrom.desc':
            'Nothing pops up in these hours; reminders wait in the center instead.',
        'settings.notifyQuietTo': 'Quiet hours until',
        'settings.notifyQuiet.off': 'Off',
        'settings.notifyMuted': 'Only in the center',
        'settings.notifyMuted.desc': 'These never pop up, and are still recorded.',

        'notify.title': 'Notifications',
        'notify.empty': 'Nothing here yet.',
        'notify.today': 'Today',
        'notify.earlier': 'Earlier',
        'notify.missed': 'missed',
        'notify.open': 'Open',
        'notify.complete': 'Mark done',
        'notify.completeFailed': 'Could not mark it done — the note may have changed.',
        'notify.snooze': 'Remind me later',
        'notify.snooze.10m': 'In 10 minutes',
        'notify.snooze.1h': 'In an hour',
        'notify.snooze.tomorrow': 'Tomorrow',
        'notify.dismiss': 'Remove',
        'notify.markAllRead': 'Mark all read',
        'notify.clearRead': 'Clear read',
        'notify.source.prayer': 'Prayer reminders',

        'prayer.notice.at': '{prayer} — {time}',
    },
    ru: {
        'settings.notifications': 'Уведомления',
        'settings.notifications.desc': 'Напоминания, тихие часы и центр уведомлений',
        'settings.notify.delivery': 'Как они до вас доходят',
        'settings.notify.delivery.desc':
            'Напоминания появляются, пока Obsidian открыт. На телефоне — только внутри Obsidian: плагину недоступны уведомления телефона. Всё пропущенное ждёт в центре.',
        'settings.notifySystem': 'Системные уведомления',
        'settings.notifySystem.desc':
            'Показывать и уведомление самого компьютера, чтобы оно дошло и в другом окне. Только на этом устройстве.',
        'settings.notifyQuietFrom': 'Тихие часы с',
        'settings.notifyQuietFrom.desc':
            'В эти часы ничего не всплывает — напоминания ждут в центре.',
        'settings.notifyQuietTo': 'Тихие часы до',
        'settings.notifyQuiet.off': 'Выключены',
        'settings.notifyMuted': 'Только в центре',
        'settings.notifyMuted.desc': 'Эти не всплывают, но записываются.',

        'notify.title': 'Уведомления',
        'notify.empty': 'Пока пусто.',
        'notify.today': 'Сегодня',
        'notify.earlier': 'Раньше',
        'notify.missed': 'пропущено',
        'notify.open': 'Открыть',
        'notify.complete': 'Отметить выполненным',
        'notify.completeFailed': 'Не удалось отметить — возможно, заметка изменилась.',
        'notify.snooze': 'Напомнить позже',
        'notify.snooze.10m': 'Через 10 минут',
        'notify.snooze.1h': 'Через час',
        'notify.snooze.tomorrow': 'Завтра',
        'notify.dismiss': 'Убрать',
        'notify.markAllRead': 'Прочитать все',
        'notify.clearRead': 'Убрать прочитанные',
        'notify.source.prayer': 'Напоминания о намазе',

        'prayer.notice.at': '{prayer} — {time}',
    },
};
