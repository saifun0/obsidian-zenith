import { BaseModule } from '../../core/IModule';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { WeatherWidget } from './WeatherWidget';
import { weatherSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';

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

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'weather.forecast',
                title: 'Weather',
                icon: 'cloud-sun',
                description: 'Current conditions, hourly and multi-day forecast.',
                sizes: ['sm', 'md', 'lg'],
                defaultSize: 'sm',
                order: 20,
                component: WeatherWidget,
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
        return weatherSettingsSchema;
    }
}
