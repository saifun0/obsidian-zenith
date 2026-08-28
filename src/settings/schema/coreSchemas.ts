import { coreSchema, type CoreSettingsSchema } from './types';
import { localizeModule } from '../../core/moduleLabels';

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
                    descKey: 'settings.language.desc',
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
                    descKey: 'settings.density.desc',
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
    ],
});
