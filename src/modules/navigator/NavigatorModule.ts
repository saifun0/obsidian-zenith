import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { navigatorSettingsSchema } from './settings.schema';
import { NavWidget } from './components/NavWidget';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { navigatorTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * NavigatorModule — the launcher widget: one button per Zenith view.
 *
 * Owns the widget, not the buttons. Each module registers its own nav action
 * (see `navigation.ts`), so the launcher lists what is actually loaded — including
 * views that arrived with a third-party module — and never has to be edited when
 * a module is added or removed.
 *
 * Has no view of its own; the widget lives on the dashboard, so "activate"
 * opens the dashboard the way the weather module does.
 */
export class NavigatorModule extends BaseModule {
    readonly id = 'navigator';
    readonly name = 'Navigation';
    readonly description = 'A launcher on the dashboard with a button for every Zenith view.';
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
                icon: 'compass',
                description: 'Jump to any Zenith view — and anywhere a module adds a button.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 5,
                component: NavWidget,
            })
        );
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
