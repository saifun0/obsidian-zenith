import { coreSchema } from '../../settings/schema/types';
import { MediaSettings } from './components/MediaSettings';

export const mediaSettingsSchema = coreSchema({
    moduleId: 'media',
    groups: [{ id: 'banner', fields: [{ type: 'custom', key: 'mediaSelected', row: true, render: MediaSettings }] }],
});
