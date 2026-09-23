import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_TASKS } from '../../core/constants';
import { TasksView } from './TasksView';
import { TasksWidget } from './components/TasksWidget';
import { watchFeature } from '../../core/useFeature';
import { TimerService } from './services/timerService';
import { tasksSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { tasksTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * TasksModule — manages the Tasks view and related commands.
 */
export class TasksModule extends BaseModule {
    readonly id = 'tasks';
    readonly name = 'Tasks';
    readonly description = 'Manage your tasks, projects, and daily to-dos.';
    readonly icon = 'check-square';

    getTranslations(): TranslationTable {
        return tasksTranslations;
    }

    private disposers: Array<() => void> = [];
    private timer: TimerService | null = null;

    async onload(): Promise<void> {
        // Register the Tasks view
        this.registerView(
            VIEW_TYPE_TASKS,
            (leaf) => new TasksView(leaf, this.plugin)
        );

        // The timer outlives the view: you start one, go to the note you are
        // working in, and the countdown still has to reach you.
        // Only while the feature is on: switched off, nothing ticks, and a
        // timer left running is stopped with its time written to the task —
        // there is no button left to stop it with.
        const timer = new TimerService(this.plugin.app);
        this.timer = timer;
        this.disposers.push(
            watchFeature('tasks.timer', (on) => {
                if (on) {
                    timer.start();
                    return;
                }
                timer.stop();
                void timer.stopRunning();
            })
        );
        this.disposers.push(() => timer.stop());

        // Register command to open Tasks
        this.addCommand({
            id: 'open-tasks',
            name: 'Open Tasks',
            callback: () => this.activateView(),
        });

        // Contribute the Tasks widget to the dashboard.
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'tasks.overview',
                feature: 'tasks.widget',
                title: 'Tasks',
                titleKey: 'widget.tasks',
                description: 'What’s due, overdue and in progress, with quick add.',
                icon: 'check-square',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'lg',
                order: 30,
                component: TasksWidget,
            })
        );

        // And a button on the dashboard's launcher.
        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'tasks.view',
                labelKey: 'nav.tasks',
                descriptionKey: 'nav.tasks.desc',
                icon: 'check-square',
                order: 20,
                viewType: VIEW_TYPE_TASKS,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        // NOTE: intentionally NOT detaching leaves here. Obsidian guidelines
        // advise against closing the user's open leaves on unload — the view is
        // torn down by Obsidian, and detaching drops the user's layout on
        // disable/enable or app reload.
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_TASKS);
    }

    getSettingsSchema(): SettingsSchema {
        return tasksSettingsSchema;
    }
}
