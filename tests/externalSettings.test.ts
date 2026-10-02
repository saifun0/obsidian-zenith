import { describe, it, expect } from 'vitest';
import { externalSettingsPatch } from '../src/core/externalSettings';
import { DEFAULT_SETTINGS, CURRENT_SETTINGS_VERSION } from '../src/store/settingsSlice';

/**
 * A data.json that another device wrote, arriving while Zenith runs.
 */
const ours = { ...DEFAULT_SETTINGS, tasksFolderPath: '10 Tasks', activeModuleIds: ['tasks'] };

const theirs = (settings: Record<string, unknown>) => ({
    settings: { ...ours, settingsVersion: CURRENT_SETTINGS_VERSION, ...settings },
});

describe('a data.json from somewhere else', () => {
    it('brings over the settings that travel', () => {
        expect(externalSettingsPatch(ours, theirs({ tasksFolderPath: 'Tasks' }))).toEqual({
            tasksFolderPath: 'Tasks',
        });
    });

    it('keeps what this device holds for itself', () => {
        const patch = externalSettingsPatch(
            ours,
            theirs({
                activeModuleIds: ['tasks', 'prayer'],
                syncRemotePassword: 'their password',
                uiDensity: 'compact',
            })
        );
        expect(patch).toEqual({});
    });

    it('is no change when nothing that travels differs', () => {
        expect(externalSettingsPatch(ours, theirs({}))).toEqual({});
    });

    it('ignores a file that is not a config', () => {
        expect(externalSettingsPatch(ours, null)).toEqual({});
        expect(externalSettingsPatch(ours, { settings: 'nonsense' })).toEqual({});
        expect(externalSettingsPatch(ours, 42)).toEqual({});
    });
});
