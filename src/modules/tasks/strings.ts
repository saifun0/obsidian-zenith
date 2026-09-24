/**
 * Task strings added with natural input, URI capture and task reminders,
 * merged into the dictionary in `core/i18n.ts`.
 */
export const TASK_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'feature.tasks.naturalInput': 'Natural input',
        'feature.tasks.naturalInput.desc':
            '“Call mom tomorrow at 6pm !” fills in the date, the time and the priority.',

        'tasks.quickAdd.placeholderNatural': 'Call mom tomorrow at 6pm !',
        'tasks.quickAdd.understood': 'Understood from the text',
        'tasks.quickAdd.keepWords': 'Keep “{text}” as words',
        'tasks.quickAdd.today': 'today',
        'tasks.quickAdd.tagSuggestions': 'Tags in use',

        'feature.tasks.uriCapture': 'Capture from links',
        'feature.tasks.uriCapture.desc':
            'obsidian://zenith links — from a phone shortcut, say — add tasks and log today’s trackers. Any web page can open such a link, so this stays off until you switch it on.',
        'uri.off':
            'Zenith: a link asked to add something, but capture from links is off (Tasks → Features).',
        'uri.tooMany': 'Zenith: too many requests from links — ignoring them for a minute.',
        'uri.failed': 'Zenith: the link’s request failed — see the console.',
        'uri.added': 'Added from a link: {title}',
        'uri.logged': 'Logged from a link: {tracker} → {value}',
        'uri.undo': 'Undo',
        'uri.undone': 'Undone.',
        'uri.undoFailed': 'Could not undo: the note has changed since.',
        'uri.error.unknown-action':
            'Zenith: a link asked for something it cannot do. Use do=add-task, do=log or do=open.',
        'uri.error.missing-text': 'Zenith: the link has no task text (text=…).',
        'uri.error.missing-tracker': 'Zenith: the link names no tracker (tracker=…).',
        'uri.error.bad-value': 'Zenith: the link’s value does not fit that tracker.',
        'uri.error.unknown-view': 'Zenith: the link asks for a view that does not exist.',
        'uri.error.unknown-tracker': 'Zenith: there is no tracker “{tracker}”.',
        'uri.error.module-off': 'Zenith: the link needs a module that is switched off.',

        'feature.tasks.reminders': 'Reminders',
        'feature.tasks.reminders.desc':
            'At a task’s ⏰ time, and a morning summary of the day’s tasks without one. In the notification center; only while Obsidian is open.',
        'settings.taskRemindGroup': 'Reminders',
        'settings.taskRemind.note':
            'Only while Obsidian is running — a plugin cannot wake a sleeping phone. What came while it was closed waits in the notification center.',
        'settings.taskRemindBefore': 'Warn before',
        'settings.taskRemindBefore.desc':
            'Minutes before a task’s ⏰ time. Zero reminds at the time itself.',
        'settings.taskDigestHour': 'Morning summary',
        'settings.taskDigestHour.desc':
            'Today’s tasks that have no time, and how many are overdue — the ones no reminder would mention.',
        'settings.taskDigest.off': 'None',
        'settings.taskReminderPlugin':
            'The Reminder plugin is on too. Tasks it also reads may be reminded twice.',
        'tasks.remind.at': 'Due at {time}',
        'tasks.remind.in': 'In {minutes} min · {time}',
        'tasks.digest.title': 'Today’s tasks',
        'tasks.digest.today.one': '{count} task for today',
        'tasks.digest.today.other': '{count} tasks for today',
        'tasks.digest.overdue.one': '{count} overdue',
        'tasks.digest.overdue.other': '{count} overdue',

        'feature.calendar.dragSchedule': 'Move on the hour grid',
        'feature.calendar.dragSchedule.desc':
            'Drag a task to another hour or day, stretch it by its foot, drop an all-day task onto an hour. A tap on an empty slot gives one of that day’s tasks an hour; the arrow keys move a focused one.',
        'calendar.drag.moveDue': 'Move the deadline to {date}?',
        'calendar.drag.moveDueBody': '“{title}” is due on its day — this changes its 📅.',
        'calendar.drag.moveDueConfirm': 'Move',
        'calendar.drag.failed':
            'Zenith: the task could not be moved — its note has changed. Try again.',
        'calendar.drag.nothingToPlace': 'No tasks without a time on this day.',
        'calendar.drag.pick': 'Which task goes at {time}?',
    },
    ru: {
        'feature.tasks.naturalInput': 'Ввод обычной фразой',
        'feature.tasks.naturalInput.desc':
            '«Позвонить маме завтра в 18 !» — дата, время и приоритет заполнятся сами.',

        'tasks.quickAdd.placeholderNatural': 'Позвонить маме завтра в 18 !',
        'tasks.quickAdd.understood': 'Понято из текста',
        'tasks.quickAdd.keepWords': 'Оставить «{text}» словами',
        'tasks.quickAdd.today': 'сегодня',
        'tasks.quickAdd.tagSuggestions': 'Теги, которые уже есть',

        'feature.tasks.uriCapture': 'Захват по ссылкам',
        'feature.tasks.uriCapture.desc':
            'Ссылки obsidian://zenith — например, из быстрой команды на телефоне — добавляют задачи и отмечают трекеры за сегодня. Такую ссылку может открыть любая веб-страница, поэтому это выключено, пока вы не включите.',
        'uri.off':
            'Zenith: ссылка попросила что-то добавить, но захват по ссылкам выключен (Задачи → Функции).',
        'uri.tooMany': 'Zenith: слишком много запросов по ссылкам — минуту они не принимаются.',
        'uri.failed': 'Zenith: запрос по ссылке не выполнился — подробности в консоли.',
        'uri.added': 'Добавлено по ссылке: {title}',
        'uri.logged': 'Отмечено по ссылке: {tracker} → {value}',
        'uri.undo': 'Отменить',
        'uri.undone': 'Отменено.',
        'uri.undoFailed': 'Не удалось отменить: заметку с тех пор изменили.',
        'uri.error.unknown-action':
            'Zenith: ссылка просит то, чего он не умеет. Используйте do=add-task, do=log или do=open.',
        'uri.error.missing-text': 'Zenith: в ссылке нет текста задачи (text=…).',
        'uri.error.missing-tracker': 'Zenith: в ссылке не указан трекер (tracker=…).',
        'uri.error.bad-value': 'Zenith: значение из ссылки не подходит этому трекеру.',
        'uri.error.unknown-view': 'Zenith: ссылка просит вид, которого нет.',
        'uri.error.unknown-tracker': 'Zenith: трекера «{tracker}» нет.',
        'uri.error.module-off': 'Zenith: ссылке нужен модуль, который выключен.',

        'feature.tasks.reminders': 'Напоминания',
        'feature.tasks.reminders.desc':
            'В ⏰-время задачи и утренняя сводка задач дня без времени. В центре уведомлений; только пока Obsidian открыт.',
        'settings.taskRemindGroup': 'Напоминания',
        'settings.taskRemind.note':
            'Только пока Obsidian запущен — плагин не может разбудить спящий телефон. То, что пришлось на время, когда он был закрыт, ждёт в центре уведомлений.',
        'settings.taskRemindBefore': 'Предупреждать за',
        'settings.taskRemindBefore.desc': 'Минут до ⏰-времени задачи. Ноль — ровно в срок.',
        'settings.taskDigestHour': 'Утренняя сводка',
        'settings.taskDigestHour.desc':
            'Задачи на сегодня без времени и сколько просрочено — то, о чём ни одно напоминание не скажет.',
        'settings.taskDigest.off': 'Нет',
        'settings.taskReminderPlugin':
            'Плагин Reminder тоже включён. Задачи, которые читает и он, могут напоминаться дважды.',
        'tasks.remind.at': 'Срок в {time}',
        'tasks.remind.in': 'Через {minutes} мин · {time}',
        'tasks.digest.title': 'Задачи на сегодня',
        'tasks.digest.today.one': '{count} задача на сегодня',
        'tasks.digest.today.few': '{count} задачи на сегодня',
        'tasks.digest.today.many': '{count} задач на сегодня',
        'tasks.digest.overdue.one': '{count} просрочена',
        'tasks.digest.overdue.few': '{count} просрочены',
        'tasks.digest.overdue.many': '{count} просрочено',

        'feature.calendar.dragSchedule': 'Перенос по часовой сетке',
        'feature.calendar.dragSchedule.desc':
            'Перетащите задачу на другой час или день, растяните за нижний край, бросьте задачу без времени на час. Касание пустого слота даёт время одной из задач дня; стрелки двигают выбранную.',
        'calendar.drag.moveDue': 'Перенести срок на {date}?',
        'calendar.drag.moveDueBody': '«{title}» — срок в этот день, перенос изменит её 📅.',
        'calendar.drag.moveDueConfirm': 'Перенести',
        'calendar.drag.failed':
            'Zenith: задачу не удалось перенести — заметка изменилась. Попробуйте ещё раз.',
        'calendar.drag.nothingToPlace': 'В этот день нет задач без времени.',
        'calendar.drag.pick': 'Какую задачу поставить на {time}?',
    },
};
