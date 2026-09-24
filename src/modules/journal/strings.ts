/**
 * Journal strings added with goals, quitting, the year in pixels, the daily
 * prompt and the rituals, merged into the dictionary in `core/i18n.ts`.
 */
export const JOURNAL_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'feature.journal.goals': 'Weekly goals and limits',
        'feature.journal.goals.desc':
            '“Three times a week”, “two coffees at most”, and days of rest (`sport: rest`) that neither break a streak nor add to it.',
        'feature.journal.quitHabits': 'Habits to quit',
        'feature.journal.quitHabits.desc':
            'A tracker for something you are giving up, counted over the days you recorded: “12 of 15 recorded days without it”.',

        'settings.journalTrackers.period': 'Goal',
        'settings.journalTrackers.period.day': 'Every day',
        'settings.journalTrackers.period.week': 'Days a week',
        'settings.journalTrackers.count': 'Days',
        'settings.journalTrackers.direction': 'Target is',
        'settings.journalTrackers.direction.atLeast': 'At least',
        'settings.journalTrackers.direction.atMost': 'At most',
        'settings.journalTrackers.mode': 'Habit',
        'settings.journalTrackers.mode.build': 'To keep',
        'settings.journalTrackers.mode.quit': 'To quit',
        'settings.journalTrackers.goalKept':
            'Days before today keep the goal they had — changing it does not rewrite the past.',

        'journal.quit.basis': '{kept} of {recorded} recorded days without {label}',
        'journal.goals.weekBasis.one': 'this week · {count} week kept in a row',
        'journal.goals.weekBasis.other': 'this week · {count} weeks kept in a row',
        'habits.rest': 'Rest day',

        'feature.journal.yearPixels': 'Year in pixels',
        'feature.journal.yearPixels.desc':
            'The whole year as squares, one a day, coloured by the mood or another tracker.',
        'journal.year.open': 'The year in pixels',
        'journal.year.month': 'Back to the month',
        'journal.year.prev': 'Previous year',
        'journal.year.next': 'Next year',
        'journal.year.this': 'This year',
        'journal.year.by': 'Coloured by',
        'journal.year.neutral': 'Grey: nothing recorded',

        'feature.journal.dailyPrompt': 'Question of the day',
        'feature.journal.dailyPrompt.desc':
            'One question a day in the check-in block, and in the template as {{prompt}}. Written into the note only when you ask.',
        'settings.journalPrompt': 'Questions',
        'settings.journalPrompt.desc':
            'A note with one question a line. Empty: a small built-in set in the interface language.',
        'settings.journalPrompt.placeholder': 'Templates/Questions.md',
        'journal.prompt.insert': 'Write it into the note',
    },
    ru: {
        'feature.journal.goals': 'Цели на неделю и пределы',
        'feature.journal.goals.desc':
            '«Три раза в неделю», «не больше двух кофе» и дни отдыха (`sport: rest`), которые не рвут серию и не продлевают её.',
        'feature.journal.quitHabits': 'Привычки «бросить»',
        'feature.journal.quitHabits.desc':
            'Трекер для того, от чего отказываетесь, считается по записанным дням: «12 из 15 записанных дней без него».',

        'settings.journalTrackers.period': 'Цель',
        'settings.journalTrackers.period.day': 'Каждый день',
        'settings.journalTrackers.period.week': 'Дней в неделю',
        'settings.journalTrackers.count': 'Дней',
        'settings.journalTrackers.direction': 'Цель —',
        'settings.journalTrackers.direction.atLeast': 'не меньше',
        'settings.journalTrackers.direction.atMost': 'не больше',
        'settings.journalTrackers.mode': 'Привычка',
        'settings.journalTrackers.mode.build': 'Завести',
        'settings.journalTrackers.mode.quit': 'Бросить',
        'settings.journalTrackers.goalKept':
            'Дни до сегодняшнего остаются при прежней цели — её смена не переписывает прошлое.',

        'journal.quit.basis': '{kept} из {recorded} записанных дней без «{label}»',
        'journal.goals.weekBasis.one': 'эта неделя · {count} неделя подряд',
        'journal.goals.weekBasis.few': 'эта неделя · {count} недели подряд',
        'journal.goals.weekBasis.many': 'эта неделя · {count} недель подряд',
        'habits.rest': 'День отдыха',

        'feature.journal.yearPixels': 'Год в пикселях',
        'feature.journal.yearPixels.desc':
            'Весь год квадратиками, по одному на день, в цвет настроения или другого трекера.',
        'journal.year.open': 'Год в пикселях',
        'journal.year.month': 'Назад к месяцу',
        'journal.year.prev': 'Предыдущий год',
        'journal.year.next': 'Следующий год',
        'journal.year.this': 'Этот год',
        'journal.year.by': 'Цвет по',
        'journal.year.neutral': 'Серое — ничего не записано',

        'feature.journal.dailyPrompt': 'Вопрос дня',
        'feature.journal.dailyPrompt.desc':
            'Один вопрос в день в блоке отметок и в шаблоне как {{prompt}}. В заметку пишется только по вашей просьбе.',
        'settings.journalPrompt': 'Вопросы',
        'settings.journalPrompt.desc':
            'Заметка с вопросами, по одному в строке. Пусто — небольшой встроенный набор на языке интерфейса.',
        'settings.journalPrompt.placeholder': 'Шаблоны/Вопросы.md',
        'journal.prompt.insert': 'Записать в заметку',
    },
};
