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

        'feature.content.challenge': 'Yearly challenge',
        'feature.content.challenge.desc':
            '“24 books this year”: a goal per type, with how the pace is keeping up. Card on the dashboard and in the statistics.',
        'widget.challenge': 'Challenge',
        'content.challenge.label': '{type} · {year}',
        'content.challenge.done': 'Done — well read.',
        'content.challenge.ahead': '{count} ahead of pace',
        'content.challenge.behind': '{count} behind pace',
        'content.challenge.onTrack': 'On pace',
        'content.challenge.none': 'No goal for this year yet — set one in Settings → Content.',
        'settings.contentChallenge': 'Goals for {year}',
        'settings.contentChallenge.desc':
            'How many of each type to finish this year. Empty is no goal. Next year starts empty; this year’s goals stay with this year.',
        'settings.contentChallengeRereads': 'Count re-reads',
        'settings.contentChallengeRereads.desc':
            'On: every reading finished this year counts. Off: only what is finished for the first time.',
    },
    ru: {
        'feature.content.readings': 'Повторные прочтения',
        'feature.content.readings.desc':
            'Если начать завершённое заново, прежнее прочтение сохраняется, и каждое считается само по себе — в истории и во времени прочтения.',
        'content.stats.reread': 'Больше одного раза',
        'content.detail.readings': 'Прочтения',
        'content.detail.readingOpen': 'с {date}',
        'content.detail.readingSpan': '{from} → {to}',

        'feature.content.challenge': 'Годовой челлендж',
        'feature.content.challenge.desc':
            '«24 книги за год»: цель по каждому типу и то, успевает ли темп. Карточка на дашборде и в статистике.',
        'widget.challenge': 'Челлендж',
        'content.challenge.label': '{type} · {year}',
        'content.challenge.done': 'Готово — отлично прочитано.',
        'content.challenge.ahead': 'на {count} впереди темпа',
        'content.challenge.behind': 'на {count} позади темпа',
        'content.challenge.onTrack': 'В темпе',
        'content.challenge.none': 'Цели на этот год пока нет — задайте её в Настройки → Контент.',
        'settings.contentChallenge': 'Цели на {year}',
        'settings.contentChallenge.desc':
            'Сколько каждого типа закончить в этом году. Пусто — без цели. Следующий год начнётся пустым; цели этого года останутся при нём.',
        'settings.contentChallengeRereads': 'Считать повторы',
        'settings.contentChallengeRereads.desc':
            'Вкл.: считается каждое прочтение, законченное в этом году. Выкл.: только прочитанное впервые.',
    },
};
