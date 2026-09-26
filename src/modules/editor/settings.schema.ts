import { whenFeature } from '../../settings/schema/featureGroup';
import { coreSchema, type SettingsGroup } from '../../settings/schema/types';
import type { ZenithSettings } from '../../store/settingsSlice';

/**
 * Editor settings: its features, which the form adds on its own; how blocks
 * start, while folding is on; and — only while Code Styler is on — why none of
 * it is doing anything.
 */
export function editorSettingsSchema(codeStylerOn: boolean) {
    const groups: SettingsGroup<keyof ZenithSettings>[] = [
        {
            id: 'fold',
            showIf: whenFeature('editor.codeFold'),
            fields: [
                {
                    type: 'segmented',
                    key: 'editorCodeFold',
                    labelKey: 'settings.editorCodeFold',
                    descKey: 'settings.editorCodeFold.desc',
                    default: 'open',
                    layout: 'stack',
                    options: [
                        { value: 'open', labelKey: 'settings.editorCodeFold.open' },
                        { value: 'closed', labelKey: 'settings.editorCodeFold.closed' },
                        { value: 'long', labelKey: 'settings.editorCodeFold.long' },
                    ],
                },
                {
                    type: 'number',
                    key: 'editorCodeFoldLines',
                    labelKey: 'settings.editorCodeFoldLines',
                    default: 30,
                    min: 5,
                    max: 500,
                    step: 1,
                    showIf: (v) => v.editorCodeFold === 'long',
                },
            ],
        },
    ];

    if (codeStylerOn) {
        groups.unshift({
            id: 'codeStyler',
            fields: [
                {
                    type: 'heading',
                    key: 'codeStyler',
                    labelKey: 'editor.codeStyler',
                    descKey: 'editor.codeStyler.desc',
                },
            ],
        });
    }

    return coreSchema({ moduleId: 'editor', groups });
}
