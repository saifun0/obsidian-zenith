import { coreSchema } from '../../settings/schema/types';
import { navActionLabel, navActions } from './navigation';
import { DEFAULT_PANEL_BUTTONS } from './panel';
import { openNavPanel } from './openNavPanel';

/**
 * Navigation settings.
 *
 * The hide list is built from the registry at render time rather than from a
 * fixed list of views, so it always matches what is loaded. Hiding rather than
 * picking what to show is deliberate — the same choice the dashboard makes with
 * `hiddenWidgetIds` — so a button that arrives with a module switched on later
 * appears instead of waiting to be discovered in settings.
 */
export const navigatorSettingsSchema = coreSchema({
    moduleId: 'navigator',
    groups: [
        {
            id: 'panel',
            titleKey: 'settings.navPanel',
            descKey: 'settings.navPanel.desc',
            fields: [
                {
                    type: 'action',
                    key: 'navigatorPanelOpen',
                    labelKey: 'settings.navPanelOpen',
                    descKey: 'settings.navPanelOpen.desc',
                    buttonKey: 'settings.navPanelOpen.button',
                    run: ({ plugin }) => openNavPanel(plugin),
                },
                {
                    type: 'action',
                    key: 'navigatorPanelReset',
                    labelKey: 'settings.navPanelReset',
                    descKey: 'settings.navPanelReset.desc',
                    buttonKey: 'settings.navPanelReset.button',
                    run: ({ set }) =>
                        set({
                            navigatorPanelButtons: DEFAULT_PANEL_BUTTONS.map((b) => ({ ...b })),
                        }),
                },
            ],
        },
        {
            id: 'appearance',
            titleKey: 'settings.navWidget',
            fields: [
                {
                    type: 'segmented',
                    key: 'navigatorLayout',
                    labelKey: 'settings.navLayout',
                    default: 'grid',
                    options: [
                        { value: 'grid', labelKey: 'settings.navLayout.grid' },
                        { value: 'list', labelKey: 'settings.navLayout.list' },
                    ],
                },
                {
                    type: 'toggle',
                    key: 'navigatorShowLabels',
                    labelKey: 'settings.navLabels',
                    default: true,
                    // The list layout is nothing but labels, so the switch only
                    // means something for the grid.
                    showIf: (v) => v.navigatorLayout !== 'list',
                },
            ],
        },
        {
            id: 'buttons',
            titleKey: 'settings.navButtons',
            descKey: 'settings.navButtons.desc',
            fields: [
                {
                    type: 'multiselect',
                    key: 'navigatorHiddenActions',
                    labelKey: 'settings.navHidden',
                    default: [],
                    options: ({ t }) =>
                        navActions.getSnapshot().map((a) => ({
                            value: a.id,
                            label: navActionLabel(a, t),
                            icon: a.icon,
                        })),
                },
            ],
        },
    ],
});
