import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { WeatherWidget } from './WeatherWidget';
import { weatherSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { weatherTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';
import { clearWeatherPersistence, setWeatherPersistence } from './weatherService';

/**
 * WeatherModule — contributes the weather widget to the dashboard.
 *
 * Has no dedicated view of its own; the widget is rendered on the dashboard,
 * so "activate" opens the dashboard. Toggling the module off removes the widget
 * (its dashboard registration is module-scoped and disposed on unload).
 */
export class WeatherModule extends BaseModule {
    readonly id = 'weather';
    readonly name = 'Weather';
    readonly description = 'A weather widget with hourly, 10-day forecast, sunrise/sunset and °C/°F.';
    readonly icon = 'cloud-sun';

    getTranslations(): TranslationTable {
        return weatherTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    onload(): Promise<void> {
        // The last forecast per place, kept in Obsidian's local storage.
        const app = this.plugin.app;
        setWeatherPersistence(app);
        this.disposers.push(() => clearWeatherPersistence(app));

        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'weather.forecast',
                title: 'Weather',
                titleKey: 'widget.weather',
                icon: 'cloud-sun',
                description: 'Current conditions, hourly and multi-day forecast.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 20,
                component: WeatherWidget,
            })
        );
        return Promise.resolve();
    }

    onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        return Promise.resolve();
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_DASHBOARD);
    }

    getSettingsSchema(): SettingsSchema {
        return weatherSettingsSchema;
    }
}
