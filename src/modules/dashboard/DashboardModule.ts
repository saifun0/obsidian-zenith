import { BaseModule } from '../../core/IModule';
import { dashboardSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { DashboardView } from './DashboardView';
import { TimeWidget } from './components/TimeWidget';
import type ZenithPlugin from '../../main';

/**
 * DashboardModule — Entry point for the Dashboard feature.
 *
 * Registers the dashboard view and the "Open Dashboard" command.
 * The view renders a React component tree inside an Obsidian ItemView.
 */
export class DashboardModule extends BaseModule {
    readonly id = 'dashboard';
    readonly name = 'Dashboard';
    readonly description = 'Central hub for an overview of your Zenith data.';
    readonly icon = 'layout-dashboard';

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.registerView(
            VIEW_TYPE_DASHBOARD,
            (leaf) => new DashboardView(leaf, this.plugin)
        );

        this.addCommand({
            id: 'open-dashboard',
            name: 'Open Dashboard',
            callback: () => this.activateView(),
        });

        // Ambient widgets owned by the dashboard itself. (Weather lives in its
        // own module — see WeatherModule.)
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'dashboard.clock',
                title: 'Clock',
                icon: 'clock',
                description: 'Time, date and a live seconds ring.',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 10,
                bare: true,
                component: TimeWidget,
            })
        );

        // The dashboard's own entry in the launcher. Useful from a leaf that
        // isn't the dashboard — the same widget renders in a sidebar.
        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'dashboard.view',
                labelKey: 'nav.dashboard',
                descriptionKey: 'nav.dashboard.desc',
                icon: 'layout-dashboard',
                order: 10,
                viewType: VIEW_TYPE_DASHBOARD,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        // NOTE: leaves are intentionally left attached (see TasksModule).
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_DASHBOARD);
    }

    getSettingsSchema(): SettingsSchema {
        return dashboardSettingsSchema;
    }
}
