import { coreSchema } from '../../settings/schema/types';

export const dashboardSettingsSchema = coreSchema({
    moduleId: 'dashboard',
    groups: [
        {
            id: 'header',
            fields: [
                {
                    type: 'segmented',
                    key: 'dashboardHeading',
                    labelKey: 'settings.dashHeading',
                    descKey: 'settings.dashHeading.desc',
                    default: 'none',
                    options: [
                        { value: 'none', labelKey: 'settings.dashHeading.none' },
                        { value: 'greeting', labelKey: 'settings.dashHeading.greeting' },
                        { value: 'custom', labelKey: 'settings.dashHeading.custom' },
                    ],
                },
                {
                    type: 'text',
                    key: 'dashboardHeadingText',
                    labelKey: 'settings.dashHeadingText',
                    descKey: 'settings.dashHeadingText.desc',
                    default: '',
                    layout: 'stack',
                    // Only worth a row when it is the one being shown.
                    showIf: (v) => v.dashboardHeading === 'custom',
                },
                {
                    type: 'toggle',
                    key: 'dashboardShowDate',
                    labelKey: 'settings.dashDate',
                    descKey: 'settings.dashDate.desc',
                    default: false,
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
