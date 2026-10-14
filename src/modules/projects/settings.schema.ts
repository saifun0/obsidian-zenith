import { DEFAULT_PROJECTS_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';
import { moveAllProjectsIntoFolders } from './services/projectFolders';

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
                {
                    // Asked for, never done by itself: moving files about in
                    // someone's vault on an update is not the plugin's to do.
                    type: 'action',
                    key: 'projectsMoveAll',
                    labelKey: 'settings.projectsMoveAll',
                    descKey: 'settings.projectsMoveAll.desc',
                    buttonKey: 'settings.projectsMoveAll.button',
                    run: ({ plugin }) => moveAllProjectsIntoFolders(plugin),
                },
            ],
        },
    ],
});
