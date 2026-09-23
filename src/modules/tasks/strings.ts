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
    },
};
