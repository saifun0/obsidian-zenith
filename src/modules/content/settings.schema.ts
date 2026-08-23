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
                    descKey: 'settings.contentFolder.desc',
                    default: 'Zenith/Content',
                    placeholder: 'Zenith/Content',
                },
                {
                    type: 'toggle',
                    key: 'cacheCovers',
                    labelKey: 'settings.cacheCovers',
                    descKey: 'settings.cacheCovers.desc',
                    default: true,
                },
            ],
        },
        {
            id: 'types',
            titleKey: 'settings.contentTypes',
            // A full editor with per-type icons, colours, metadata providers
            // and field lists — genuinely bespoke, so it keeps its own UI.
            fields: [{ type: 'custom', key: 'contentTypes', render: ContentTypesSettings }],
        },
    ],
});
