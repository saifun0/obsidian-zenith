/**
 * The words for the feature registry — see `features.ts`.
 *
 * Kept beside the registry rather than scattered through the dictionary: a
 * feature added there is one that needs a name here, and the two lists are
 * easiest to keep in step when they are read side by side. A description is
 * optional — a switch whose name says it all gets none, which is most of them.
 */
export const FEATURE_STRINGS: { en: Record<string, string>; ru: Record<string, string> } = {
    en: {
        'settings.features': 'Features',
        'settings.features.needsModule': 'Needs the {name} module',
        'settings.features.needsFeature': 'Needs “{name}”',

        'feature.core.folderIcons': 'Folder icons',
        'feature.core.folderIcons.desc':
            'Icons beside folders and notes in the file explorer, set from their menu.',
        'feature.core.vaultScaffold': 'Vault structure',
        'feature.core.vaultScaffold.desc': 'A button that creates Zenith’s folders in one go.',

        'feature.dashboard.date': 'Today’s date',
        'feature.dashboard.background': 'Wallpaper',
        'feature.dashboard.background.desc': 'A picture behind the cards, with dimming and blur.',
        'feature.dashboard.presets': 'Saved layouts',
        'feature.dashboard.presets.desc': 'Keep several arrangements of the board and switch between them.',

        'feature.tasks.captureDaily': 'Capture into the daily note',
        'feature.tasks.captureDaily.desc':
            'New tasks go into today’s note. Off, they go to the tasks folder instead — both are always read.',
        'feature.tasks.subtasks': 'Subtasks',
        'feature.tasks.attachments': 'Attachments',
        'feature.tasks.attachments.desc': 'Pictures, notes and links under a task.',
        'feature.tasks.timer': 'Timer',
        'feature.tasks.timer.desc': 'Time a task and keep the total on its line.',
        'feature.tasks.dragDrop': 'Drag and drop',
        'feature.tasks.dragDrop.desc': 'Reorder tasks, and move them between groups by dragging.',
        'feature.tasks.smartGroups': 'Group by date',
        'feature.tasks.smartGroups.desc': 'Overdue, today, later, done — as groups in the list.',
        'feature.tasks.fileGroups': 'Group by note',
        'feature.tasks.stats': 'Statistics',
        'feature.tasks.heatmap': 'Activity heatmap',
        'feature.tasks.widget': 'Dashboard widget',

        'feature.calendar.timeViews': 'Week and day views',
        'feature.calendar.allHours': 'All 24 hours',
        'feature.calendar.allHours.desc': 'A switch to show the night in the week and day views.',
        'feature.calendar.agenda': 'Agenda',
        'feature.calendar.agenda.desc': 'The month as a list.',
        'feature.calendar.spans': 'Start-to-due bars',
        'feature.calendar.spans.desc': 'A task with 🛫 and 📅 drawn across every day between them.',
        'feature.calendar.dailyNotes': 'Tasks from daily notes',
        'feature.calendar.dailyNotes.desc': 'Undated tasks placed on the day of the note they are in.',
        'feature.calendar.spotlight': 'Highlight on hover',
        'feature.calendar.spotlight.desc': 'Pointing at a task lights up every piece of it.',
        'feature.calendar.widget': 'Week ahead widget',
        'feature.calendar.overdue': 'Overdue strip',

        'feature.projects.taskLinks': 'Tasks in projects',
        'feature.projects.taskLinks.desc':
            'Tasks linked to a project, and its progress counted from them.',
        'feature.projects.widget': 'Dashboard widget',

        'feature.journal.dailyBlock': 'Check-in block in the note',
        'feature.journal.dailyBlock.desc':
            'The day’s trackers inside the daily note, in a zenith-daily block.',
        'feature.journal.moodColors': 'Calendar coloured by mood',
        'feature.journal.moodColors.desc': 'Days tinted by your first scale tracker.',
        'feature.journal.habitMonth': 'Habit month',
        'feature.journal.habitMonth.desc': 'Every tracker across the month, in one grid.',
        'feature.journal.wordCount': 'Word count',
        'feature.journal.stats': 'Statistics',
        'feature.journal.stats.desc': 'The last thirty days, and the statistics widget.',
        'feature.journal.widget': 'Check-in widget',

        'feature.content.resume': 'Continue shelf',
        'feature.content.resume.desc': 'What you are partway through, above the library.',
        'feature.content.quickIncrement': '“+1” button',
        'feature.content.quickIncrement.desc': 'Move progress on by one without opening the item.',
        'feature.content.multiSelect': 'Select several',
        'feature.content.multiSelect.desc': 'Change the status of, or delete, many items at once.',
        'feature.content.genreFilter': 'Filter by genre',
        'feature.content.import': 'Import',
        'feature.content.import.desc': 'From MyAnimeList, Goodreads or Letterboxd exports.',
        'feature.content.stats': 'Statistics',
        'feature.content.widget': 'Dashboard widget',

        'feature.prayer.sunrise': 'Sunrise',
        'feature.prayer.sunrise.desc': 'Show sunrise — it’s the end of fajr’s window, not a prayer.',
        'feature.prayer.extras': 'Voluntary prayers',
        'feature.prayer.extras.desc': 'Witr, tahajjud, duha — ticked alongside the five.',
        'feature.prayer.hijri': 'Hijri date',
        'feature.prayer.weekStrip': 'Week strip',
        'feature.prayer.weekStrip.desc': 'The last seven days on the widget.',
        'feature.prayer.stats': 'Statistics',
        'feature.prayer.reminders': 'Notify at prayer time',
        'feature.prayer.widget': 'Dashboard widget',

        'feature.weather.hourly': 'Hourly forecast',
        'feature.weather.sun': 'Sunrise & sunset',
        'feature.weather.air': 'Air quality',
        'feature.weather.air.desc':
            'Pollutants, AQI and (in Europe) pollen. Costs one extra request per refresh.',

        'journal.block.off': 'The check-in block is switched off in Zenith’s journal settings.',
        'journal.widget.written': 'Written',
    },
    ru: {
        'settings.features': 'Функции',
        'settings.features.needsModule': 'Нужен модуль «{name}»',
        'settings.features.needsFeature': 'Нужна функция «{name}»',

        'feature.core.folderIcons': 'Иконки папок',
        'feature.core.folderIcons.desc':
            'Значки у папок и заметок в проводнике — ставятся из их меню.',
        'feature.core.vaultScaffold': 'Заготовка хранилища',
        'feature.core.vaultScaffold.desc': 'Кнопка, которая одним нажатием создаёт папки Zenith.',

        'feature.dashboard.date': 'Сегодняшняя дата',
        'feature.dashboard.background': 'Фон',
        'feature.dashboard.background.desc': 'Картинка под карточками, с затемнением и размытием.',
        'feature.dashboard.presets': 'Сохранённые раскладки',
        'feature.dashboard.presets.desc': 'Несколько расстановок доски и переключение между ними.',

        'feature.tasks.captureDaily': 'Писать в ежедневную заметку',
        'feature.tasks.captureDaily.desc':
            'Новые задачи попадают в заметку сегодняшнего дня. Если выключить — в папку задач; читаются в любом случае обе.',
        'feature.tasks.subtasks': 'Подзадачи',
        'feature.tasks.attachments': 'Вложения',
        'feature.tasks.attachments.desc': 'Картинки, заметки и ссылки под задачей.',
        'feature.tasks.timer': 'Таймер',
        'feature.tasks.timer.desc': 'Засекать время на задачу и хранить итог в её строке.',
        'feature.tasks.dragDrop': 'Перетаскивание',
        'feature.tasks.dragDrop.desc': 'Менять порядок задач и переносить их между группами мышью.',
        'feature.tasks.smartGroups': 'Группы по дате',
        'feature.tasks.smartGroups.desc': 'Просрочено, сегодня, позже, сделано — группами в списке.',
        'feature.tasks.fileGroups': 'Группы по заметкам',
        'feature.tasks.stats': 'Статистика',
        'feature.tasks.heatmap': 'Тепловая карта',
        'feature.tasks.widget': 'Виджет на дашборде',

        'feature.calendar.timeViews': 'Неделя и день',
        'feature.calendar.allHours': 'Все 24 часа',
        'feature.calendar.allHours.desc': 'Переключатель, показывающий ночь в видах недели и дня.',
        'feature.calendar.agenda': 'Список',
        'feature.calendar.agenda.desc': 'Месяц в виде списка.',
        'feature.calendar.spans': 'Ленты от начала до срока',
        'feature.calendar.spans.desc': 'Задача с 🛫 и 📅 тянется через все дни между ними.',
        'feature.calendar.dailyNotes': 'Задачи из дневных заметок',
        'feature.calendar.dailyNotes.desc': 'Задачи без даты — в день заметки, где они записаны.',
        'feature.calendar.spotlight': 'Подсветка при наведении',
        'feature.calendar.spotlight.desc': 'Наведение на задачу подсвечивает все её части.',
        'feature.calendar.widget': 'Виджет «Неделя вперёд»',
        'feature.calendar.overdue': 'Полоса просроченных',

        'feature.projects.taskLinks': 'Задачи в проектах',
        'feature.projects.taskLinks.desc':
            'Задачи, связанные с проектом, и его прогресс по ним.',
        'feature.projects.widget': 'Виджет на дашборде',

        'feature.journal.dailyBlock': 'Блок отметок в заметке',
        'feature.journal.dailyBlock.desc':
            'Трекеры дня прямо в дневной заметке, в блоке zenith-daily.',
        'feature.journal.moodColors': 'Цвет календаря по настроению',
        'feature.journal.moodColors.desc': 'Дни окрашены по первому трекеру-шкале.',
        'feature.journal.habitMonth': 'Месяц привычек',
        'feature.journal.habitMonth.desc': 'Все трекеры за месяц одной сеткой.',
        'feature.journal.wordCount': 'Счётчик слов',
        'feature.journal.stats': 'Статистика',
        'feature.journal.stats.desc': 'Последние тридцать дней и виджет статистики.',
        'feature.journal.widget': 'Виджет отметок',

        'feature.content.resume': 'Полка «Продолжить»',
        'feature.content.resume.desc': 'То, что вы читаете или смотрите сейчас, — над библиотекой.',
        'feature.content.quickIncrement': 'Кнопка «+1»',
        'feature.content.quickIncrement.desc': 'Продвинуть прогресс на единицу, не открывая элемент.',
        'feature.content.multiSelect': 'Выбор нескольких',
        'feature.content.multiSelect.desc': 'Сменить статус или удалить сразу много элементов.',
        'feature.content.genreFilter': 'Фильтр по жанру',
        'feature.content.import': 'Импорт',
        'feature.content.import.desc': 'Из выгрузок MyAnimeList, Goodreads или Letterboxd.',
        'feature.content.stats': 'Статистика',
        'feature.content.widget': 'Виджет на дашборде',

        'feature.prayer.sunrise': 'Восход',
        'feature.prayer.sunrise.desc': 'Показывать восход — это конец времени фаджра, а не намаз.',
        'feature.prayer.extras': 'Дополнительные намазы',
        'feature.prayer.extras.desc': 'Витр, тахаджуд, духа — отметки рядом с пятью.',
        'feature.prayer.hijri': 'Дата по хиджре',
        'feature.prayer.weekStrip': 'Полоса недели',
        'feature.prayer.weekStrip.desc': 'Последние семь дней на виджете.',
        'feature.prayer.stats': 'Статистика',
        'feature.prayer.reminders': 'Напоминать о намазе',
        'feature.prayer.widget': 'Виджет на дашборде',

        'feature.weather.hourly': 'Почасовой прогноз',
        'feature.weather.sun': 'Восход и закат',
        'feature.weather.air': 'Качество воздуха',
        'feature.weather.air.desc':
            'Загрязнители, AQI и (в Европе) пыльца. Один дополнительный запрос при обновлении.',

        'journal.block.off': 'Блок отметок выключен в настройках дневника Zenith.',
        'journal.widget.written': 'Записано',
    },
};
