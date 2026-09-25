import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import {
    DEVICE_KEYS,
    SHARED_KEYS,
    STATE_POLICY,
    mergeStrategyOf,
    partition,
    scopeOf,
    type SettingsKey,
} from '../src/modules/sync/statePolicy';

describe('STATE_POLICY coverage', () => {
    it('classifies every setting that exists', () => {
        // The compiler already enforces this via `Record<keyof ZenithSettings,
        // …>`. The runtime check is a belt to that braces: it catches a key
        // added to DEFAULT_SETTINGS but typed loosely enough to slip past.
        const settingKeys = Object.keys(DEFAULT_SETTINGS).sort();
        const policyKeys = Object.keys(STATE_POLICY).sort();
        expect(policyKeys).toEqual(settingKeys);
    });

    it('has no key in more than one bucket', () => {
        const overlap = SHARED_KEYS.filter((k) => DEVICE_KEYS.includes(k));
        expect(overlap).toEqual([]);
    });
});

describe('scope decisions', () => {
    it('keeps layout and chrome on the device', () => {
        // A phone wants compact and one column; a desktop wants spacious and a
        // grid. Syncing these means the smaller screen always loses.
        const deviceLocal: SettingsKey[] = [
            'uiDensity',
            'uiAnimations',
            'dashboardGrid',
            'dashboardLayout',
            'dashboardStackOrder',
            'dashboardBundles',
            'widgetOrder',
            'hiddenWidgetIds',
        ];
        for (const key of deviceLocal) expect(scopeOf(key)).toBe('device');
    });

    it('keeps "where you left off" on the device', () => {
        for (const key of ['contentView', 'taskView', 'calendarView'] as SettingsKey[]) {
            expect(scopeOf(key)).toBe('device');
        }
    });

    it('keeps the active module set on the device', () => {
        expect(scopeOf('activeModuleIds')).toBe('device');
        expect(scopeOf('defaultModuleId')).toBe('device');
    });

    it('shares location — a prayer time from wrong coordinates is just wrong', () => {
        expect(scopeOf('weatherPlace')).toBe('shared');
        expect(scopeOf('prayerPlace')).toBe('shared');
    });

    it('shares the accent, which is a personal choice rather than a screen accommodation', () => {
        expect(scopeOf('accentColor')).toBe('shared');
        expect(scopeOf('uiDensity')).toBe('device');
    });

    it('shares vault-wide facts, because the vault itself is shared', () => {
        for (const key of [
            'tasksFolderPath',
            'contentFolderPath',
            'journalFolderPath',
            'journalDateFormat',
            'journalTrackers',
            'contentTypes',
            'folderIcons',
        ] as SettingsKey[]) {
            expect(scopeOf(key)).toBe('shared');
        }
    });

    it('never syncs the settings schema version', () => {
        // Each device runs its own migrations against its own stored config.
        expect(scopeOf('settingsVersion')).toBe('never');
        expect(SHARED_KEYS).not.toContain('settingsVersion');
        expect(DEVICE_KEYS).not.toContain('settingsVersion');
    });
});

describe('merge strategies', () => {
    it('merges identified collections element-wise, not last-writer-wins', () => {
        for (const key of [
            'journalTrackers',
            'contentTypes',
            'dashboardPresets',
            'profiles',
        ] as SettingsKey[]) {
            expect(mergeStrategyOf(key)).toBe('byId');
        }
    });

    it('merges keyed records key-by-key', () => {
        for (const key of ['folderIcons', 'prayerAdjustments'] as SettingsKey[]) {
            expect(mergeStrategyOf(key)).toBe('record');
        }
    });

    it('treats the running timer as a handoff', () => {
        expect(mergeStrategyOf('activeTimer')).toBe('timer');
    });

    it('defaults to last-writer-wins for ordinary settings', () => {
        expect(mergeStrategyOf('weatherUnit')).toBe('lww');
        expect(mergeStrategyOf('language')).toBe('lww');
    });

    it('leaves the navigator hide-list as LWW so a button can be un-hidden', () => {
        // Union would make hiding a button anywhere hide it everywhere, with no
        // way to bring it back.
        expect(mergeStrategyOf('navigatorHiddenActions')).toBe('lww');
    });
});

describe('partition', () => {
    it('splits a full settings object without losing or duplicating keys', () => {
        const { shared, device } = partition(DEFAULT_SETTINGS);
        const sharedKeys = Object.keys(shared);
        const deviceKeys = Object.keys(device);

        expect(sharedKeys.sort()).toEqual([...SHARED_KEYS].sort());
        expect(deviceKeys.sort()).toEqual([...DEVICE_KEYS].sort());
        expect(sharedKeys.filter((k) => deviceKeys.includes(k))).toEqual([]);
    });

    it('drops keys scoped never from both halves', () => {
        const { shared, device } = partition(DEFAULT_SETTINGS);
        expect('settingsVersion' in shared).toBe(false);
        expect('settingsVersion' in device).toBe(false);
    });

    it('carries values through unchanged', () => {
        const { shared, device } = partition({
            ...DEFAULT_SETTINGS,
            weatherUnit: 'f',
            uiDensity: 'compact',
        });
        expect(shared.weatherUnit).toBe('f');
        expect(device.uiDensity).toBe('compact');
    });
});
