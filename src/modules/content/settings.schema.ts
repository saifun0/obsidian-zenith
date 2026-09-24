import { DEFAULT_CONTENT_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';
import { ContentTypesSettings } from '../../settings/components/ContentTypesSettings';
import { whenFeature } from '../../settings/schema/featureGroup';
import { ChallengeField } from './components/ChallengeField';

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
            id: 'challenge',
            showIf: whenFeature('content.challenge'),
            fields: [
                { type: 'custom', key: 'contentChallenges', row: true, render: ChallengeField },
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
