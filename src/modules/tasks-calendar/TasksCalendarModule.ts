import { BaseModule } from '../../core/IModule';
import { tasksCalendarSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { VIEW_TYPE_TASKS_CALENDAR } from '../../core/constants';
import { TasksCalendarView } from './TasksCalendarView';
import { CalendarWidget } from './components/CalendarWidget';
import { tasksCalendarTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * TasksCalendarModule — the tasks you already track, laid out on a calendar.
 *
 * Reads the same task store the Tasks module fills, so there's nothing to
 * configure: turn it on and every dated task appears on its day. Works with the
 * journal module switched off; with it on, undated tasks captured in a daily
 * note land on that note's date and day numbers open the note.
 */
export class TasksCalendarModule extends BaseModule {
    readonly id = 'tasks-calendar';
    readonly name = 'Tasks Calendar';
    readonly description = 'See your tasks on a month, week or agenda calendar.';
    readonly icon = 'calendar-days';

    getTranslations(): TranslationTable {
        return tasksCalendarTranslations;
    }

    private disposers: Array<() => void> = [];

    async onload(): Promise<void> {
        this.registerView(
            VIEW_TYPE_TASKS_CALENDAR,
            (leaf) => new TasksCalendarView(leaf, this.plugin)
        );

        this.addCommand({
            id: 'open-tasks-calendar',
            name: 'Open Tasks Calendar',
            callback: () => this.activateView(),
        });

        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'tasks-calendar.week',
                title: 'Week ahead',
                titleKey: 'widget.week',
                description: 'Task load for the next seven days, and what lands first.',
                icon: 'calendar-days',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 35,
                component: CalendarWidget,
            })
        );

        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'tasks-calendar.view',
                labelKey: 'nav.calendar',
                descriptionKey: 'nav.calendar.desc',
                icon: 'calendar-range',
                order: 30,
                viewType: VIEW_TYPE_TASKS_CALENDAR,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        // Leaves are intentionally left open — see TasksModule for why.
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_TASKS_CALENDAR);
    }

    getSettingsSchema(): SettingsSchema {
        return tasksCalendarSettingsSchema;
    }
}
