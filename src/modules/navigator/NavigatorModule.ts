import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD, VIEW_TYPE_NAV_PANEL } from '../../core/constants';
import { useZenithStore } from '../../store';
import { navigatorSettingsSchema } from './settings.schema';
import { NavWidget } from './components/NavWidget';
import { NavPanelView } from './NavPanelView';
import { openNavPanel } from './openNavPanel';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { navigatorTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * NavigatorModule — the launcher widget and the side panel: one button per
 * Zenith view, in both.
 *
 * Owns the widget and the panel, not the buttons. Each module registers its
 * own nav action (see `navigation.ts`), so both list what is actually loaded
 * and never have to be edited when a module is added or removed.
 *
 * The panel lives in the sidebar, not the main area, so "activate" still opens
 * the dashboard, where the widget is.
 */
export class NavigatorModule extends BaseModule {
    readonly id = 'navigator';
    readonly name = 'Navigation';
    readonly description =
        'A launcher on the dashboard and a side panel, with a button for every Zenith view.';
    readonly icon = 'compass';

    getTranslations(): TranslationTable {
        return navigatorTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'navigator.launcher',
                title: 'Navigation',
                titleKey: 'widget.nav',
                icon: 'compass',
                description: 'Jump to any Zenith view — and anywhere a module adds a button.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 5,
                component: NavWidget,
            })
        );

        this.registerView(VIEW_TYPE_NAV_PANEL, (leaf) => new NavPanelView(leaf, this.plugin));
        this.addCommand({
            id: 'open-side-panel',
            name: 'Open the side panel',
            icon: 'compass',
            callback: () => void openNavPanel(this.plugin),
        });
        this.plugin.app.workspace.onLayoutReady(() => void this.placePanelOnce());
    }

    /**
     * Put the panel in the right sidebar the first time Zenith runs with it,
     * without taking the focus. Once only: after that, where it sits — or that
     * it was closed — is the user's choice, and the command brings it back.
     */
    private async placePanelOnce(): Promise<void> {
        const { settings, updateSettings } = useZenithStore.getState();
        if (settings.navigatorPanelPlaced) return;
        updateSettings({ navigatorPanelPlaced: true });
        if (this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_NAV_PANEL).length > 0) return;
        await openNavPanel(this.plugin, false);
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_DASHBOARD);
    }

    getSettingsSchema(): SettingsSchema {
        return navigatorSettingsSchema;
    }
}
