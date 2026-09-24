import { coreSchema } from '../../settings/schema/types';
import { HotkeyField } from './components/HotkeyField';

/**
 * Search settings: only its hotkey. What it searches follows from which
 * modules are on — a group nobody wants goes with its module — so there is
 * no list of groups to switch here.
 */
export const searchSettingsSchema = coreSchema({
    moduleId: 'search',
    groups: [
        {
            id: 'general',
            fields: [{ type: 'custom', key: 'searchHotkey', row: true, render: HotkeyField }],
        },
    ],
});
