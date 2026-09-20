import { DEFAULT_PROJECTS_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';

export const projectsSettingsSchema = coreSchema({
    moduleId: 'projects',
    groups: [
        {
            id: 'storage',
            fields: [
                {
                    type: 'folder',
                    key: 'projectsFolderPath',
                    labelKey: 'settings.projectsFolder',
                    default: DEFAULT_PROJECTS_FOLDER,
                    placeholder: DEFAULT_PROJECTS_FOLDER,
                },
            ],
        },
    ],
});
