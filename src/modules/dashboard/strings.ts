/**
 * Dashboard strings added with the countdowns, the period progress, the life
 * in weeks and the startup page, merged into the dictionary in `core/i18n.ts`.
 * Feature names are needed on the settings page while the module is off, which
 * is why they are here rather than in the module's own `getTranslations()`.
 */
export const DASHBOARD_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'feature.dashboard.openOnStartup': 'Open on startup',
        'feature.dashboard.openOnStartup.desc':
            'Show the dashboard when Obsidian starts — the tab from last time if it is still there, never a second one.',
        'feature.dashboard.periodProgress': 'Period progress',
        'feature.dashboard.periodProgress.desc':
            'A card with how far through the day, week, month and year you are — and the Hijri month, if you like.',
        'feature.dashboard.countdowns': 'Countdowns',
        'feature.dashboard.countdowns.desc':
            'A card with the days until your own dates, tasks tagged #countdown, project targets, Ramadan and Eid.',
        'feature.dashboard.lifeWeeks': 'Life in weeks',
        'feature.dashboard.lifeWeeks.desc':
            'A card with your life as a grid of weeks. Needs your birth date; no template ever switches it on.',
        'dashboard.startup.homepage':
            'The Homepage plugin decides what opens at startup. To start on the dashboard, add the “Zenith: Open Dashboard” command in its settings.',

        'widget.periodProgress': 'Progress',
        'widget.countdowns': 'Countdowns',
        'widget.lifeWeeks': 'Life in weeks',

        'period.day': 'Day',
        'period.week': 'Week',
        'period.hijri': 'Hijri month',
        'period.show': 'Show',
        'period.hide': 'Hide',
        'period.hoursLeft.one': '{count} hour left',
        'period.hoursLeft.other': '{count} hours left',
        'period.daysLeft.one': '{count} day left',
        'period.daysLeft.other': '{count} days left',

        'countdown.empty':
            'Nothing to count down to. Add a date on the back of the card, or tag a dated task #countdown.',
        'countdown.today': 'today',
        'countdown.tomorrow': 'tomorrow',
        'countdown.days.one': '{count} day',
        'countdown.days.other': '{count} days',
        'countdown.hijri.ramadan': 'Ramadan',
        'countdown.hijri.eidFitr': 'Eid al-Fitr',
        'countdown.hijri.arafah': 'Day of Arafah',
        'countdown.hijri.eidAdha': 'Eid al-Adha',
        'countdown.sources': 'Count down to',
        'countdown.source.tasks': 'Tasks',
        'countdown.source.projects': 'Projects',
        'countdown.source.hijri': 'Ramadan and Eid',
        'countdown.tag': 'Task tag',
        'countdown.event.title': 'What',
        'countdown.event.yearly': 'Yearly',
        'countdown.event.remove': 'Remove the date',
        'countdown.event.add': 'Add a date',

        'lifeWeeks.empty': 'Set your birth date in Dashboard settings → Life in weeks.',
        'lifeWeeks.of': 'weeks of {total} · {percent}%',
        'lifeWeeks.aria': '{lived} weeks lived of {total}',
        'settings.dashBirthDate': 'Birth date',
        'settings.dashBirthDate.desc':
            'For this card only. Kept in this vault’s settings and synced between your devices — never put in a profile.',
        'settings.dashBirthDate.invalid': 'Write it as YYYY-MM-DD.',
        'settings.dashLifeYears': 'Years in the grid',
    },
    ru: {
        'feature.dashboard.openOnStartup': 'Открывать при запуске',
        'feature.dashboard.openOnStartup.desc':
            'Показывать дашборд при запуске Obsidian — вкладку с прошлого раза, если она осталась, и никогда вторую.',
        'feature.dashboard.periodProgress': 'Прогресс периода',
        'feature.dashboard.periodProgress.desc':
            'Карточка: сколько прошло от дня, недели, месяца и года — и, по желанию, от месяца хиджры.',
        'feature.dashboard.countdowns': 'Обратные отсчёты',
        'feature.dashboard.countdowns.desc':
            'Карточка с днями до ваших дат, задач с тегом #countdown, сроков проектов, Рамадана и Идов.',
        'feature.dashboard.lifeWeeks': 'Жизнь в неделях',
        'feature.dashboard.lifeWeeks.desc':
            'Карточка: жизнь как сетка недель. Нужна дата рождения; ни один шаблон её не включает.',
        'dashboard.startup.homepage':
            'Что открывать при запуске, решает плагин Homepage. Чтобы начинать с дашборда, добавьте в его настройках команду «Zenith: Open Dashboard».',

        'widget.periodProgress': 'Прогресс',
        'widget.countdowns': 'Отсчёты',
        'widget.lifeWeeks': 'Жизнь в неделях',

        'period.day': 'День',
        'period.week': 'Неделя',
        'period.hijri': 'Месяц хиджры',
        'period.show': 'Показывать',
        'period.hide': 'Скрыть',
        'period.hoursLeft.one': 'остался {count} час',
        'period.hoursLeft.few': 'осталось {count} часа',
        'period.hoursLeft.many': 'осталось {count} часов',
        'period.daysLeft.one': 'остался {count} день',
        'period.daysLeft.few': 'осталось {count} дня',
        'period.daysLeft.many': 'осталось {count} дней',

        'countdown.empty':
            'Отсчитывать пока нечего. Добавьте дату на обороте карточки или отметьте задачу со сроком тегом #countdown.',
        'countdown.today': 'сегодня',
        'countdown.tomorrow': 'завтра',
        'countdown.days.one': '{count} день',
        'countdown.days.few': '{count} дня',
        'countdown.days.many': '{count} дней',
        'countdown.hijri.ramadan': 'Рамадан',
        'countdown.hijri.eidFitr': 'Ид аль-Фитр',
        'countdown.hijri.arafah': 'День Арафа',
        'countdown.hijri.eidAdha': 'Ид аль-Адха',
        'countdown.sources': 'Отсчитывать',
        'countdown.source.tasks': 'Задачи',
        'countdown.source.projects': 'Проекты',
        'countdown.source.hijri': 'Рамадан и Иды',
        'countdown.tag': 'Тег задач',
        'countdown.event.title': 'Что',
        'countdown.event.yearly': 'Ежегодно',
        'countdown.event.remove': 'Убрать дату',
        'countdown.event.add': 'Добавить дату',

        'lifeWeeks.empty': 'Укажите дату рождения: настройки дашборда → Жизнь в неделях.',
        'lifeWeeks.of': 'недель из {total} · {percent}%',
        'lifeWeeks.aria': 'Прожито {lived} недель из {total}',
        'settings.dashBirthDate': 'Дата рождения',
        'settings.dashBirthDate.desc':
            'Только для этой карточки. Хранится в настройках хранилища и синхронизируется между вашими устройствами — в профиль не попадает никогда.',
        'settings.dashBirthDate.invalid': 'В формате ГГГГ-ММ-ДД.',
        'settings.dashLifeYears': 'Лет в сетке',
    },
};
