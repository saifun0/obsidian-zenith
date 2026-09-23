import { describe, it, expect, beforeEach } from 'vitest';
import {
    FEATURES,
    featureBlock,
    featureEnabled,
    featurePatch,
    featuresOf,
    getFeature,
    pinnedFeatures,
} from '../src/core/features';
import { DICTS } from '../src/core/i18n';
import { DEFAULT_SETTINGS, type ZenithSettings } from '../src/store/settingsSlice';
import { STATE_POLICY } from '../src/modules/sync/statePolicy';
import { useZenithStore, resetZenithStore } from '../src/store';
import {
    FEATURES_GROUP_ID,
    featureOnlySchema,
    withFeatureGroup,
} from '../src/settings/schema/featureGroup';
import { groupModes } from '../src/modules/tasks/components/TasksApp';
import { calendarModes } from '../src/modules/tasks-calendar/components/TasksCalendarApp';

const BUILT_IN_MODULES = new Set(DEFAULT_SETTINGS.activeModuleIds);

const settingsWith = (patch: Partial<ZenithSettings> = {}): ZenithSettings => ({
    ...DEFAULT_SETTINGS,
    ...patch,
});

describe('the registry', () => {
    it('has one entry per id', () => {
        const ids = FEATURES.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('names only features and modules that exist', () => {
        for (const def of FEATURES) {
            for (const id of def.requires ?? []) expect(getFeature(id), `${def.id} → ${id}`).toBeDefined();
            for (const m of def.requiresModules ?? []) expect(BUILT_IN_MODULES.has(m)).toBe(true);
            if (def.moduleId !== 'core') expect(BUILT_IN_MODULES.has(def.moduleId)).toBe(true);
        }
    });

    it('has no cycle in what features require', () => {
        const visit = (id: string, path: string[]): void => {
            expect(path, `cycle through ${id}`).not.toContain(id);
            for (const next of getFeature(id)?.requires ?? []) visit(next, [...path, id]);
        };
        for (const def of FEATURES) visit(def.id, []);
    });

    it('is named in both languages, and described in both or neither', () => {
        for (const def of FEATURES) {
            expect(DICTS.en[def.labelKey], def.labelKey).toBeDefined();
            expect(DICTS.ru[def.labelKey], def.labelKey).toBeDefined();
            expect(DICTS.ru[def.descKey] === undefined).toBe(DICTS.en[def.descKey] === undefined);
        }
    });

    /**
     * A feature stored in its own setting has two defaults — the registry's
     * and the setting's — and a fresh install must not see them disagree.
     */
    it('agrees with the default of every setting it is stored in', () => {
        for (const def of FEATURES.filter((f) => f.settingKey)) {
            const key = def.settingKey!;
            expect(typeof DEFAULT_SETTINGS[key], key).toBe('boolean');
            expect(DEFAULT_SETTINGS[key], key).toBe(def.default);
        }
    });

    it('keeps every switch where it travels between devices', () => {
        expect(STATE_POLICY.features).toEqual({ scope: 'shared', merge: 'record' });
        for (const def of FEATURES.filter((f) => f.settingKey)) {
            expect(STATE_POLICY[def.settingKey!].scope, def.settingKey).toBe('shared');
        }
    });

    it('lists a module’s features in order', () => {
        expect(featuresOf('tasks').map((f) => f.id)).toContain('tasks.heatmap');
        expect(featuresOf('nothing')).toEqual([]);
    });
});

describe('whether a feature runs', () => {
    it('follows its default, then its own switch', () => {
        expect(featureEnabled(settingsWith(), 'tasks.timer')).toBe(true);
        expect(
            featureEnabled(settingsWith({ features: { 'tasks.timer': false } }), 'tasks.timer')
        ).toBe(false);
    });

    it('is off with its module, whatever the switch says', () => {
        const settings = settingsWith({
            activeModuleIds: DEFAULT_SETTINGS.activeModuleIds.filter((m) => m !== 'tasks'),
            features: { 'tasks.timer': true },
        });
        expect(featureEnabled(settings, 'tasks.timer')).toBe(false);
        expect(featureBlock(settings, 'tasks.timer')).toEqual({ kind: 'module', moduleId: 'tasks' });
    });

    it('is off without a feature it requires, and says which', () => {
        const settings = settingsWith({ features: { 'tasks.stats': false } });
        expect(featureEnabled(settings, 'tasks.heatmap')).toBe(false);
        expect(featureBlock(settings, 'tasks.heatmap')).toEqual({
            kind: 'feature',
            featureId: 'tasks.stats',
        });
    });

    it('is off without another module it requires', () => {
        const settings = settingsWith({
            activeModuleIds: DEFAULT_SETTINGS.activeModuleIds.filter((m) => m !== 'journal'),
        });
        expect(featureEnabled(settings, 'tasks.captureDaily')).toBe(false);
        expect(featureBlock(settings, 'tasks.captureDaily')).toEqual({
            kind: 'module',
            moduleId: 'journal',
        });
    });

    it('counts a feature outside every module as always there', () => {
        expect(featureEnabled(settingsWith({ activeModuleIds: [] }), 'core.folderIcons')).toBe(true);
    });

    it('is off for an id nobody registered', () => {
        expect(featureEnabled(settingsWith(), 'tasks.nonsense')).toBe(false);
    });
});

describe('a feature stored in its own setting', () => {
    it('is read from that setting', () => {
        expect(featureEnabled(settingsWith({ weatherShowAir: false }), 'weather.air')).toBe(false);
        expect(featureEnabled(settingsWith({ weatherShowAir: true }), 'weather.air')).toBe(true);
        // A stray entry in `features` is not where it lives, and changes nothing.
        expect(
            featureEnabled(
                settingsWith({ weatherShowAir: true, features: { 'weather.air': false } }),
                'weather.air'
            )
        ).toBe(true);
    });

    it('is written to that setting, not to `features`', () => {
        expect(featurePatch(settingsWith(), 'weather.air', false)).toEqual({
            weatherShowAir: false,
        });
        expect(featurePatch(settingsWith({ features: { a: true } }), 'tasks.timer', false)).toEqual({
            features: { a: true, 'tasks.timer': false },
        });
    });
});

describe('the v9 migration', () => {
    beforeEach(() => resetZenithStore());

    const load = (saved: Partial<ZenithSettings>) => {
        useZenithStore.getState().loadSettings(saved);
        return useZenithStore.getState().settings;
    };

    it('pins on everything an existing config was already using', () => {
        const s = load({ tasksFolderPath: 'Tasks', settingsVersion: 8 });
        for (const def of FEATURES) {
            if (def.settingKey || !def.default) continue;
            expect(s.features[def.id], def.id).toBe(true);
        }
        // Stored in their own settings, those need no pin.
        expect(s.features['weather.air']).toBeUndefined();
    });

    it('leaves a choice already made alone', () => {
        const s = load({ settingsVersion: 8, features: { 'tasks.timer': false } });
        expect(s.features['tasks.timer']).toBe(false);
    });

    it('gives a fresh install the defaults instead of pins', () => {
        expect(load({}).features).toEqual({});
    });

    it('runs once', () => {
        const s = load({ settingsVersion: 9, tasksFolderPath: 'Tasks' });
        expect(s.features).toEqual({});
    });

    it('pins with the helper the same way', () => {
        expect(pinnedFeatures({ 'tasks.timer': false })['tasks.timer']).toBe(false);
        expect(pinnedFeatures({})['tasks.heatmap']).toBe(true);
    });
});

describe('the generated "Features" group', () => {
    it('comes first, and leaves out a feature the schema places itself', () => {
        const schema = withFeatureGroup({
            moduleId: 'tasks',
            groups: [{ id: 'storage', fields: [{ type: 'feature', key: 'tasks.captureDaily' }] }],
        });
        expect(schema.groups[0].id).toBe(FEATURES_GROUP_ID);
        const keys = schema.groups[0].fields.map((f) => f.key);
        expect(keys).toContain('tasks.heatmap');
        expect(keys).not.toContain('tasks.captureDaily');
    });

    it('is not drawn for a module with nothing to switch', () => {
        const schema = { moduleId: 'navigator', groups: [] };
        expect(withFeatureGroup(schema)).toBe(schema);
        expect(featureOnlySchema('journal').groups).toHaveLength(1);
    });
});

describe('views that depend on features', () => {
    it('offers only the task groupings that are on', () => {
        expect(groupModes(true, true)).toEqual(['smart', 'file', 'none']);
        expect(groupModes(false, true)).toEqual(['file', 'none']);
        expect(groupModes(false, false)).toEqual(['none']);
    });

    it('keeps the month whatever else is off', () => {
        expect(calendarModes(true, true)).toEqual(['month', 'week', 'day', 'list']);
        expect(calendarModes(false, true)).toEqual(['month', 'list']);
        expect(calendarModes(false, false)).toEqual(['month']);
    });
});
