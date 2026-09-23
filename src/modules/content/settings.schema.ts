import { DEFAULT_CONTENT_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';
import { ContentTypesSettings } from '../../settings/components/ContentTypesSettings';

export const contentSettingsSchema = coreSchema({
    moduleId: 'content',
    groups: [
        {
            id: 'storage',
            fields: [
                {
                    type: 'folder',
                    key: 'contentFolderPath',
                    labelKey: 'settings.contentFolder',
                    default: DEFAULT_CONTENT_FOLDER,
                    placeholder: DEFAULT_CONTENT_FOLDER,
                },
            ],
        },
        {
            id: 'types',
            titleKey: 'settings.contentTypes',
            // A full editor with per-type icons, colours and field lists —
            // genuinely bespoke, so it keeps its own UI.
            fields: [{ type: 'custom', key: 'contentTypes', render: ContentTypesSettings }],
        },
    ],
});
