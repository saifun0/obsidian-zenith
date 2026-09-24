import { coreSchema } from '../../settings/schema/types';
import { whenFeature } from '../../settings/schema/featureGroup';
import { DASHBOARD_BG_FITS, DASHBOARD_BG_SOURCES } from './dashboardBackground';
import { vaultImageField } from '../../settings/controls/VaultImageField';
import { StartupField } from './components/StartupField';

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
                // Beside the heading it sits under, rather than in the
                // generated list with the rest.
                { type: 'feature', key: 'dashboard.date' },
                // The switch, or — with the Homepage plugin on — why there
                // is none: two plugins each opening their page at startup
                // is a race one of them loses at random.
                {
                    type: 'custom',
                    key: 'dashboardOpenOnStartup',
                    featureId: 'dashboard.openOnStartup',
                    row: true,
                    render: StartupField,
                },
            ],
        },
        {
            id: 'lifeWeeks',
            titleKey: 'feature.dashboard.lifeWeeks',
            showIf: whenFeature('dashboard.lifeWeeks'),
            fields: [
                {
                    type: 'text',
                    key: 'dashboardBirthDate',
                    labelKey: 'settings.dashBirthDate',
                    descKey: 'settings.dashBirthDate.desc',
                    default: '',
                    placeholder: 'YYYY-MM-DD',
                    validate: (value) =>
                        typeof value === 'string' &&
                        value.trim() !== '' &&
                        !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())
                            ? 'settings.dashBirthDate.invalid'
                            : null,
                },
                {
                    type: 'number',
                    key: 'dashboardLifeYears',
                    labelKey: 'settings.dashLifeYears',
                    default: 80,
                    min: 30,
                    max: 120,
                    step: 1,
                },
            ],
        },
        {
            id: 'background',
            titleKey: 'settings.dashBgGroup',
            descKey: 'settings.dashBgGroup.desc',
            showIf: whenFeature('dashboard.background'),
            fields: [
                {
                    type: 'segmented',
                    key: 'dashboardBgSource',
                    labelKey: 'settings.dashBgSource',
                    default: 'none',
                    options: DASHBOARD_BG_SOURCES.map((id) => ({
                        value: id,
                        labelKey: `dashboard.bg.source.${id}`,
                    })),
                },
                {
                    type: 'text',
                    key: 'dashboardBgUrl',
                    labelKey: 'settings.dashBgUrl',
                    default: '',
                    layout: 'stack',
                    placeholder: 'https://…',
                    // Said plainly on the row itself: this is the one setting
                    // here that makes the vault talk to somebody else.
                    noteKey: 'settings.dashBgUrl.note',
                    showIf: (v) => v.dashboardBgSource === 'url',
                },
                {
                    type: 'custom',
                    key: 'dashboardBgPath',
                    row: true,
                    render: vaultImageField(
                        'dashboardBgPath',
                        'settings.dashBgPath',
                        'settings.dashBgPath.desc'
                    ),
                    showIf: (v) => v.dashboardBgSource === 'vault',
                },
                {
                    type: 'segmented',
                    key: 'dashboardBgFit',
                    labelKey: 'settings.dashBgFit',
                    default: 'cover',
                    options: DASHBOARD_BG_FITS.map((id) => ({
                        value: id,
                        labelKey: `dashboard.bg.fit.${id}`,
                    })),
                    showIf: (v) => v.dashboardBgSource !== 'none',
                },
                {
                    type: 'slider',
                    key: 'dashboardBgDim',
                    labelKey: 'settings.dashBgDim',
                    descKey: 'settings.dashBgDim.desc',
                    default: 45,
                    min: 0,
                    max: 90,
                    step: 5,
                    unitKey: 'settings.percentUnit',
                    showIf: (v) => v.dashboardBgSource !== 'none',
                },
                {
                    type: 'slider',
                    key: 'dashboardBgBlur',
                    labelKey: 'settings.dashBgBlur',
                    default: 0,
                    min: 0,
                    max: 24,
                    step: 1,
                    unitKey: 'settings.pxUnit',
                    showIf: (v) => v.dashboardBgSource !== 'none',
                },
                {
                    type: 'slider',
                    key: 'dashboardCardOpacity',
                    labelKey: 'settings.dashCardOpacity',
                    descKey: 'settings.dashCardOpacity.desc',
                    default: 72,
                    min: 30,
                    max: 100,
                    step: 2,
                    unitKey: 'settings.percentUnit',
                    showIf: (v) => v.dashboardBgSource !== 'none',
                },
                {
                    type: 'toggle',
                    key: 'dashboardBgMobile',
                    labelKey: 'settings.dashBgMobile',
                    descKey: 'settings.dashBgMobile.desc',
                    default: true,
                    showIf: (v) => v.dashboardBgSource !== 'none',
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
