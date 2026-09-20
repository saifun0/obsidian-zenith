import { BaseModule } from '../../core/IModule';
import { projectsSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { VIEW_TYPE_PROJECTS } from '../../core/constants';
import { ProjectsView } from './ProjectsView';
import { ProjectFormModal } from './ProjectFormModal';
import { ProjectsWidget } from './components/ProjectsWidget';
import type ZenithPlugin from '../../main';
import { projectsTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * ProjectsModule — Project management, task aggregation and progress tracking.
 */
export class ProjectsModule extends BaseModule {
    readonly id = 'projects';
    readonly name = 'Projects';
    readonly description = 'Project management, task aggregation, progress tracking and deadlines.';
    readonly icon = 'folder-kanban';

    getTranslations(): TranslationTable {
        return projectsTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.registerView(VIEW_TYPE_PROJECTS, (leaf) => new ProjectsView(leaf, this.plugin));

        this.addCommand({
            id: 'open-projects',
            name: 'Open Projects',
            callback: () => this.activateView(),
        });

        // Reachable without the view, the way a task is: the form is where a
        // project is described, and wanting to describe one does not imply
        // wanting to look at the other six first.
        this.addCommand({
            id: 'new-project',
            name: 'New project',
            callback: () => new ProjectFormModal(this.plugin.app, this.plugin).open(),
        });

        // Register Projects widget on the dashboard
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'projects.overview',
                title: 'Projects',
                titleKey: 'widget.projects',
                description: 'Overview of your active projects and task progress.',
                icon: 'folder-kanban',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 35,
                component: ProjectsWidget,
            })
        );

        // Register Projects navigation action in the Navigator
        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'projects.view',
                labelKey: 'nav.projects',
                descriptionKey: 'nav.projects.desc',
                icon: 'folder-kanban',
                order: 35,
                viewType: VIEW_TYPE_PROJECTS,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_PROJECTS);
    }

    getSettingsSchema(): SettingsSchema {
        return projectsSettingsSchema;
    }
}
