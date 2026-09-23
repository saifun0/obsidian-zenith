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
    },
};
