import { coreSchema } from '../../settings/schema/types';

export const dashboardSettingsSchema = coreSchema({
    moduleId: 'dashboard',
    groups: [
        {
            id: 'header',
            fields: [
                {
                    type: 'toggle',
                    key: 'dashboardShowGreeting',
                    labelKey: 'settings.dashGreeting',
                    descKey: 'settings.dashGreeting.desc',
                    default: true,
                },
                {
                    type: 'toggle',
                    key: 'dashboardShowDate',
                    labelKey: 'settings.dashDate',
                    descKey: 'settings.dashDate.desc',
                    default: true,
                },
            ],
        },
        {
            id: 'layout',
            titleKey: 'settings.widgets',
            descKey: 'settings.widgets.desc',
            fields: [
                {
                    type: 'action',
                    key: 'resetLayout',
                    labelKey: 'settings.widgets.reset',
                    descKey: 'settings.widgets.reset.desc',
                    buttonKey: 'settings.reset',
                    // Arranging happens on the dashboard itself; this is the
                    // escape hatch for a layout that has got away from you.
                    run: ({ set }) =>
                        set({ dashboardLayout: [], hiddenWidgetIds: [], widgetOrder: [] }),
                },
            ],
        },
    ],
});
