import { Platform } from 'obsidian';
import { coreSchema, type CoreSettingsSchema } from './types';
import { NOTIFICATIONS_MODULE } from '../../core/features';
import { localizeModule } from '../../core/moduleLabels';
import { createPlaceField } from '../components/PlaceField';
import { InsetsReadout } from '../components/InsetsReadout';

/**
 * The three categories that are not modules.
 *
 * Same shape and same renderer as a module's schema — "General" simply has no
 * module behind it. Keeping them in one form means a control added here looks
 * and behaves like a control added anywhere else.
 */

export const generalSchema: CoreSettingsSchema = coreSchema({
    moduleId: 'general',
    groups: [
        {
            id: 'general',
            fields: [
                // First, because two modules read it and neither owns it. A
                // picker that lives inside Weather is one a person looking for
                // prayer times has no reason to open.
                {
                    type: 'custom',
                    key: 'location',
                    row: true,
                    render: createPlaceField({
                        settingsKey: 'location',
                        labelKey: 'settings.location',
                        descKey: 'settings.location.desc',
                    }),
                },
                {
                    type: 'select',
                    key: 'defaultModuleId',
                    labelKey: 'settings.defaultView',
                    descKey: 'settings.defaultView.desc',
                    default: 'dashboard',
                    // Derived at render time: which modules exist depends on
                    // what the user has installed.
                    // The same translated name the modules list shows — a
                    // picker naming them differently reads as a different set.
                    options: ({ plugin, t }) =>
                        plugin.moduleManager
                            .getAvailableManifests()
                            .map((m) => ({ value: m.id, label: localizeModule(t, m).name })),
                },
                {
                    type: 'select',
                    key: 'language',
                    labelKey: 'settings.language',
                    default: 'auto',
                    options: [
                        { value: 'auto', labelKey: 'settings.language.auto' },
                        { value: 'en', label: 'English' },
                        { value: 'ru', label: 'Русский' },
                    ],
                },
            ],
        },
    ],
});

export const appearanceSchema: CoreSettingsSchema = coreSchema({
    moduleId: 'appearance',
    groups: [
        {
            id: 'appearance',
            fields: [
                {
                    type: 'color',
                    key: 'accentColor',
                    labelKey: 'settings.accentColor',
                    descKey: 'settings.accentColor.desc',
                    default: '',
                    // Empty means "follow Obsidian's accent", which is a real
                    // choice and not the same as picking black.
                    allowEmpty: true,
                    fallback: '#7c6cff',
                },
                {
                    type: 'segmented',
                    key: 'uiDensity',
                    labelKey: 'settings.density',
                    default: 'comfortable',
                    options: [
                        { value: 'compact', labelKey: 'settings.density.compact' },
                        { value: 'comfortable', labelKey: 'settings.density.comfortable' },
                        { value: 'spacious', labelKey: 'settings.density.spacious' },
                    ],
                },
                {
                    type: 'toggle',
                    key: 'uiAnimations',
                    labelKey: 'settings.animations',
                    descKey: 'settings.animations.desc',
                    default: true,
                },
            ],
        },
        {
            // Only a phone or a tablet has a camera cut-out and Obsidian's
            // bottom buttons to keep clear of.
            id: 'phone',
            titleKey: 'settings.phone',
            showIf: () => Platform.isMobile,
            fields: [
                { type: 'custom', key: 'mobileInsetsReadout', row: true, render: InsetsReadout },
                {
                    type: 'segmented',
                    key: 'mobileInsets',
                    labelKey: 'settings.mobileInsets',
                    descKey: 'settings.mobileInsets.desc',
                    default: 'auto',
                    options: [
                        { value: 'auto', labelKey: 'settings.mobileInsets.auto' },
                        { value: 'manual', labelKey: 'settings.mobileInsets.manual' },
                    ],
                },
                {
                    type: 'slider',
                    key: 'mobileInsetTop',
                    labelKey: 'settings.mobileInsetTop',
                    default: 32,
                    min: 0,
                    max: 120,
                    step: 2,
                    unitKey: 'settings.pxUnit',
                    showIf: (v) => v.mobileInsets === 'manual',
                },
                {
                    type: 'slider',
                    key: 'mobileInsetBottom',
                    labelKey: 'settings.mobileInsetBottom',
                    default: 64,
                    min: 0,
                    max: 160,
                    step: 2,
                    unitKey: 'settings.pxUnit',
                    showIf: (v) => v.mobileInsets === 'manual',
                },
            ],
        },
    ],
});

/** `0` … `23` as `00:00` … `23:00`, for the quiet-hours pickers. */
const HOURS = Array.from({ length: 24 }, (_, h) => ({
    value: String(h),
    label: `${String(h).padStart(2, '0')}:00`,
}));

/**
 * The notification center's page. Not a module — every reminder source uses
 * it — so it is a category of its own, like General.
 */
export const notificationsSchema: CoreSettingsSchema = coreSchema({
    moduleId: NOTIFICATIONS_MODULE,
    groups: [
        {
            id: 'delivery',
            titleKey: 'settings.notify.delivery',
            descKey: 'settings.notify.delivery.desc',
            fields: [
                {
                    type: 'toggle',
                    key: 'notifySystem',
                    labelKey: 'settings.notifySystem',
                    descKey: 'settings.notifySystem.desc',
                    default: false,
                    // A phone's notifications are out of a plugin's reach.
                    disabledIf: () => !Platform.isDesktopApp,
                },
                {
                    type: 'select',
                    key: 'notifyQuietFrom',
                    labelKey: 'settings.notifyQuietFrom',
                    descKey: 'settings.notifyQuietFrom.desc',
                    default: -1,
                    numeric: true,
                    options: [{ value: '-1', labelKey: 'settings.notifyQuiet.off' }, ...HOURS],
                },
                {
                    type: 'select',
                    key: 'notifyQuietTo',
                    labelKey: 'settings.notifyQuietTo',
                    default: 7,
                    numeric: true,
                    options: HOURS,
                    showIf: (v) => typeof v.notifyQuietFrom === 'number' && v.notifyQuietFrom >= 0,
                },
                {
                    type: 'multiselect',
                    key: 'notifyMuted',
                    labelKey: 'settings.notifyMuted',
                    descKey: 'settings.notifyMuted.desc',
                    default: [],
                    // Whatever is registered right now: the sources are the
                    // modules that are on, and they are asked rather than
                    // listed here so a new one appears by itself.
                    options: ({ plugin, t }) =>
                        plugin.scheduler
                            .sourceIds()
                            .filter((id) => id !== 'center')
                            .map((id) => ({
                                value: id,
                                label: t.has(`notify.source.${id}`) ? t(`notify.source.${id}`) : id,
                            })),
                },
            ],
        },
    ],
});
