/**
 * Prayer strings added with the offline year table and "Match my app", merged
 * into the dictionary in `core/i18n.ts`.
 */
export const PRAYER_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'prayer.rounding.nearest': 'Nearest minute',
        'prayer.rounding.floor': 'Seconds dropped',
        'settings.prayerRounding': 'Rounding',
        'settings.prayerRounding.desc':
            'Timetables lose the seconds in one of two ways. A time that is always a minute out is usually this.',

        'settings.prayerMatch': 'Match my app',
        'settings.prayerMatch.desc':
            'Type the times from the app or mosque timetable you trust, and Zenith finds the calculation that gives them.',
        'settings.prayerMatch.button': 'Match…',

        'prayer.match.title': 'Match my app',
        'prayer.match.lead':
            'Type the times your app or mosque shows. Zenith tries every method, madhab and rounding and finds the one that gives the same times.',
        'prayer.match.day': 'Day',
        'prayer.match.addDay': 'Add a day',
        'prayer.match.addDayHint':
            'A day in another season tells more: winter and summer bring out different rules.',
        'prayer.match.removeDay': 'Remove this day',
        'prayer.match.find': 'Find',
        'prayer.match.needTimes': 'Type at least two times.',
        'prayer.match.noPlace': 'Set a location first — times are only right for a place.',
        'prayer.match.best': 'Closest match',
        'prayer.match.others': 'Also close',
        'prayer.match.custom': 'Own angles: fajr {fajr}°, isha {isha}°',
        'prayer.match.asr': 'Asr',
        'prayer.match.madhabHint':
            'Which madhab to follow is your decision. The times show which one your app uses.',
        'prayer.match.exact': 'matches',
        'prayer.match.off': '{value} min off',
        'prayer.match.correction': 'correction {value} min',
        'prayer.match.allMatch': 'Every time you typed matches.',
        'prayer.match.worst': 'Still off by up to {value} min.',
        'prayer.match.errorOther': '{value} min in total',
        'prayer.match.none':
            'Nothing comes within an hour. Check the times, and that the location is right.',
        'prayer.match.apply': 'Use this',
        'prayer.match.applied': 'Prayer times now follow: {method}.',
        'prayer.match.apiNote':
            'Times will come from the calendar service, which rounds on its own: a minute can still differ.',

        'prayer.choose.title': 'How are your prayer times calculated?',
        'prayer.choose.lead':
            'Methods and madhabs differ by up to an hour. Choose the ones your mosque or app uses, or let Zenith match your app.',
        'prayer.choose.method': 'Method',
        'prayer.choose.confirm': 'Use these',
        'prayer.choose.match': 'Match my app…',
        'prayer.choose.widget': 'Choose how times are calculated',
    },
    ru: {
        'prayer.rounding.nearest': 'До ближайшей минуты',
        'prayer.rounding.floor': 'Секунды отбрасываются',
        'settings.prayerRounding': 'Округление',
        'settings.prayerRounding.desc':
            'Расписания теряют секунды одним из двух способов. Время, которое всегда отличается на минуту, — обычно это.',

        'settings.prayerMatch': 'Подобрать под моё приложение',
        'settings.prayerMatch.desc':
            'Введите времена из приложения или расписания мечети, которому вы доверяете, — Zenith найдёт расчёт, который их даёт.',
        'settings.prayerMatch.button': 'Подобрать…',

        'prayer.match.title': 'Подобрать под моё приложение',
        'prayer.match.lead':
            'Введите времена, которые показывает ваше приложение или мечеть. Zenith переберёт методы, мазхабы и округление и найдёт то, что даёт те же времена.',
        'prayer.match.day': 'День',
        'prayer.match.addDay': 'Добавить день',
        'prayer.match.addDayHint':
            'День в другое время года скажет больше: зимой и летом проявляются разные правила.',
        'prayer.match.removeDay': 'Убрать этот день',
        'prayer.match.find': 'Подобрать',
        'prayer.match.needTimes': 'Введите хотя бы два времени.',
        'prayer.match.noPlace': 'Сначала укажите место — время верно только для места.',
        'prayer.match.best': 'Лучшее совпадение',
        'prayer.match.others': 'Тоже близко',
        'prayer.match.custom': 'Свои углы: фаджр {fajr}°, иша {isha}°',
        'prayer.match.asr': 'Аср',
        'prayer.match.madhabHint':
            'Какой мазхаб — решать вам. По временам видно, какой использует ваше приложение.',
        'prayer.match.exact': 'совпадает',
        'prayer.match.off': 'расходится на {value} мин',
        'prayer.match.correction': 'поправка {value} мин',
        'prayer.match.allMatch': 'Все введённые времена совпадают.',
        'prayer.match.worst': 'Остаётся расхождение до {value} мин.',
        'prayer.match.errorOther': 'всего {value} мин',
        'prayer.match.none': 'Ничего не подходит даже в пределах часа. Проверьте времена и место.',
        'prayer.match.apply': 'Применить',
        'prayer.match.applied': 'Время намаза теперь считается так: {method}.',
        'prayer.match.apiNote':
            'Времена будут приходить из сервиса-календаря, а он округляет по-своему: минута ещё может отличаться.',

        'prayer.choose.title': 'Как считать время намаза?',
        'prayer.choose.lead':
            'Методы и мазхабы расходятся на время до часа. Выберите те, что у вашей мечети или приложения, — или дайте Zenith подобрать под приложение.',
        'prayer.choose.method': 'Метод',
        'prayer.choose.confirm': 'Выбрать',
        'prayer.choose.match': 'Подобрать под приложение…',
        'prayer.choose.widget': 'Выберите, как считать время',
    },
};
