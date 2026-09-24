/**
 * Content strings added with re-reads and the yearly challenge, merged into the
 * dictionary in `core/i18n.ts`.
 */
export const CONTENT_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'feature.content.readings': 'Re-reads',
        'feature.content.readings.desc':
            'Starting a finished item again keeps the earlier reading, so each one counts for itself — in the history and in the reading time.',
        'content.stats.reread': 'Read more than once',
        'content.detail.readings': 'Readings',
        'content.detail.readingOpen': 'since {date}',
        'content.detail.readingSpan': '{from} → {to}',
    },
    ru: {
        'feature.content.readings': 'Повторные прочтения',
        'feature.content.readings.desc':
            'Если начать завершённое заново, прежнее прочтение сохраняется, и каждое считается само по себе — в истории и во времени прочтения.',
        'content.stats.reread': 'Больше одного раза',
        'content.detail.readings': 'Прочтения',
        'content.detail.readingOpen': 'с {date}',
        'content.detail.readingSpan': '{from} → {to}',
    },
};
