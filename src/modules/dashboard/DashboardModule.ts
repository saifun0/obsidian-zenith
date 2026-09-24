import { Platform } from 'obsidian';
import { BaseModule } from '../../core/IModule';
import { featureEnabled } from '../../core/features';
import { isPluginEnabled } from '../../core/otherPlugins';
import { useZenithStore } from '../../store';
import { dashboardSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { DashboardView } from './DashboardView';
import { TimeWidget } from './components/TimeWidget';
import { PeriodSettings, PeriodWidget } from './components/PeriodWidget';
import { CountdownSettings, CountdownWidget } from './components/CountdownWidget';
import { LifeWeeksWidget } from './components/LifeWeeksWidget';
import { HOMEPAGE_PLUGIN_ID } from './components/StartupField';
import { holdWidgetBodies, releaseWidgetBodies } from './startupGate';
import type ZenithPlugin from '../../main';
import { dashboardTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

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

    getTranslations(): TranslationTable {
        return dashboardTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        // Only an Obsidian that is starting opens the board: the module being
        // switched on mid-session, or the plugin re-enabled, is not a startup.
        const starting = !this.plugin.app.workspace.layoutReady;
        this.plugin.app.workspace.onLayoutReady(() => {
            if (starting) this.openOnStartup();
        });

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
                titleKey: 'widget.clock',
                icon: 'clock',
                description: 'Time, date and a live seconds ring.',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 10,
                component: TimeWidget,
            })
        );
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'dashboard.progress',
                title: 'Progress',
                titleKey: 'widget.periodProgress',
                icon: 'hourglass',
                description: 'How far through the day, week, month and year.',
                sizes: ['sm', 'md'],
                defaultSize: 'sm',
                order: 12,
                feature: 'dashboard.periodProgress',
                settings: PeriodSettings,
                component: PeriodWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'dashboard.countdowns',
                title: 'Countdowns',
                titleKey: 'widget.countdowns',
                icon: 'calendar-clock',
                description: 'Days until your dates, tagged tasks, project targets and Eid.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 14,
                feature: 'dashboard.countdowns',
                // Two lists of dates — work and family, say — are two cards.
                multiple: true,
                settings: CountdownSettings,
                component: CountdownWidget,
            }),
            this.plugin.registerDashboardWidget({
                id: 'dashboard.lifeWeeks',
                title: 'Life in weeks',
                titleKey: 'widget.lifeWeeks',
                icon: 'grid-3x3',
                description: 'A life as a grid of weeks, the lived ones filled in.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'md',
                order: 16,
                feature: 'dashboard.lifeWeeks',
                component: LifeWeeksWidget,
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

    /**
     * The board as the first thing Obsidian shows — the tab restored from last
     * time if there is one, never a second copy of it. A lone empty tab is
     * reused rather than left beside it. With the Homepage plugin on, that
     * plugin decides; the settings page says so in place of the switch.
     */
    private openOnStartup(): void {
        const { app } = this.plugin;
        if (!featureEnabled(useZenithStore.getState().settings, 'dashboard.openOnStartup')) return;
        if (isPluginEnabled(app, HOMEPAGE_PLUGIN_ID)) return;

        const { workspace } = app;
        if (Platform.isMobile) holdWidgetBodies();
        const release = () => {
            if (!Platform.isMobile) return;
            // Once the phone has finished starting — or a second and a half
            // on, whichever comes first.
            const idle = (window as { requestIdleCallback?: (cb: () => void, o: object) => void })
                .requestIdleCallback;
            if (idle) idle(releaseWidgetBodies, { timeout: 1500 });
            else window.setTimeout(releaseWidgetBodies, 300);
        };

        const existing = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]).then(release, release);
            return;
        }
        const recent = workspace.getMostRecentLeaf();
        const leaf =
            recent && recent.view.getViewType() === 'empty' ? recent : workspace.getLeaf('tab');
        void leaf
            .setViewState({ type: VIEW_TYPE_DASHBOARD, active: true })
            .then(() => workspace.revealLeaf(leaf))
            .then(release, release);
    }

    getSettingsSchema(): SettingsSchema {
        return dashboardSettingsSchema;
    }
}
