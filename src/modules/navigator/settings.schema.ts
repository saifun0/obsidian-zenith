import { coreSchema } from '../../settings/schema/types';
import { navActionLabel, navActions } from './navigation';

/**
 * Navigation settings.
 *
 * The hide list is built from the registry at render time rather than from a
 * fixed list of views: a button contributed by a third-party module has to be
 * hideable too, and nothing here can know about it in advance. Hiding rather
 * than picking what to show is deliberate — the same choice the dashboard makes
 * with `hiddenWidgetIds` — so a button that arrives with a new module appears
 * instead of waiting to be discovered in settings.
 */
export const navigatorSettingsSchema = coreSchema({
    moduleId: 'navigator',
    groups: [
        {
            id: 'appearance',
            fields: [
                {
                    type: 'segmented',
                    key: 'navigatorLayout',
                    labelKey: 'settings.navLayout',
                    descKey: 'settings.navLayout.desc',
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
                    descKey: 'settings.navLabels.desc',
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
                    descKey: 'settings.navHidden.desc',
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
