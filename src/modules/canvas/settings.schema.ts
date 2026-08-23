import { coreSchema } from '../../settings/schema/types';

/**
 * Canvas settings.
 *
 * Only the layout knobs live here. Everything else the module does is a one-off
 * action rather than a preference, and a setting that is really a parameter of
 * a single command belongs at the command, not in a settings page.
 */
export const canvasSettingsSchema = coreSchema({
    moduleId: 'canvas',
    groups: [
        {
            id: 'layout',
            titleKey: 'canvas.settings.layout',
            descKey: 'canvas.settings.layout.desc',
            fields: [
                {
                    type: 'slider',
                    key: 'canvasLayoutGap',
                    labelKey: 'canvas.settings.gap',
                    descKey: 'canvas.settings.gap.desc',
                    default: 64,
                    min: 16,
                    max: 240,
                    step: 8,
                },
                {
                    type: 'segmented',
                    key: 'canvasTreeDirection',
                    labelKey: 'canvas.settings.direction',
                    descKey: 'canvas.settings.direction.desc',
                    default: 'down',
                    options: [
                        { value: 'down', labelKey: 'canvas.settings.direction.down' },
                        { value: 'right', labelKey: 'canvas.settings.direction.right' },
                    ],
                },
                {
                    type: 'number',
                    key: 'canvasLayoutColumns',
                    labelKey: 'canvas.settings.columns',
                    descKey: 'canvas.settings.columns.desc',
                    default: 0,
                    min: 0,
                    max: 12,
                    step: 1,
                },
            ],
        },
    ],
});
