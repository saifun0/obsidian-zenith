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
    },
};
