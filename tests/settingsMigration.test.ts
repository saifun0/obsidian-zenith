import { describe, it, expect, beforeEach } from 'vitest';
import { useZenithStore, resetZenithStore } from '../src/store';
import {
    CURRENT_SETTINGS_VERSION,
    DEFAULT_SETTINGS,
    type ZenithSettings,
} from '../src/store/settingsSlice';

const load = (saved: Partial<ZenithSettings> & Record<string, unknown>) => {
    useZenithStore.getState().loadSettings(saved as Partial<ZenithSettings>);
    return useZenithStore.getState().settings;
};

beforeEach(() => {
    resetZenithStore();
});

describe('loadSettings — new keys', () => {
    it('fills in settings that did not exist when the config was written', () => {
        const s = load({ tasksFolderPath: 'Notes/Tasks' });
        expect(s.tasksFolderPath).toBe('Notes/Tasks');
        expect(s.moduleSettings).toEqual({});
        expect(s.weatherAllowIpLookup).toBe(false);
        expect(s.weatherShowAir).toBe(true);
    });

    it('keeps keys it does not recognise, so a downgrade loses nothing', () => {
        const s = load({ somethingFromTheFuture: 42 } as never);
        expect((s as unknown as Record<string, unknown>).somethingFromTheFuture).toBe(42);
    });

    it('ignores explicit undefined rather than blanking the default', () => {
        // resetZenithStore calls loadSettings({}), and callers pass partials.
        const s = load({ tasksFolderPath: undefined, language: undefined });
        expect(s.tasksFolderPath).toBe(DEFAULT_SETTINGS.tasksFolderPath);
        expect(s.language).toBe(DEFAULT_SETTINGS.language);
    });
});

describe('loadSettings — nested objects', () => {
    it('merges a partial nested object instead of replacing it', () => {
        const s = load({ taskView: { sort: 'due' } as ZenithSettings['taskView'] });
        expect(s.taskView.sort).toBe('due');
        // The fields the saved object omitted must survive.
        expect(s.taskView.group).toBe(DEFAULT_SETTINGS.taskView.group);
        expect(s.taskView.tab).toBe(DEFAULT_SETTINGS.taskView.tab);
    });

    it('replaces arrays wholesale — an empty list is a real choice', () => {
        // `journalTrackers: []` means "no trackers", not "use the defaults".
        const s = load({ journalTrackers: [], settingsVersion: CURRENT_SETTINGS_VERSION });
        expect(s.journalTrackers).toEqual([]);
    });

    it('keeps each module bucket separate', () => {
        const s = load({ moduleSettings: { 'my-module': { colour: 'red' } } });
        expect(s.moduleSettings['my-module']).toEqual({ colour: 'red' });
    });
});

describe('loadSettings — versioning', () => {
    it('stamps the current version onto a legacy config', () => {
        expect(load({}).settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    });

    it('runs the legacy migrations for a config with no version', () => {
        // No `weatherUnit` / `journalDateFormat` / `calendarView` is how a
        // pre-versioning config is recognised; each activates its module once.
        const s = load({ activeModuleIds: ['dashboard'] });
        expect(s.activeModuleIds).toContain('weather');
        expect(s.activeModuleIds).toContain('journal');
        expect(s.activeModuleIds).toContain('tasks-calendar');
    });

    it('migrates journal habits into trackers, keeping the scales', () => {
        // `migrateHabits` deliberately carries the default scale trackers over
        // and appends the old habits as checks — a habit list was never able to
        // express a scale, so dropping them would lose function, not config.
        const s = load({
            journalHabits: [{ id: 'h1', label: 'Run', icon: 'footprints', color: '#f00' }],
        } as never);

        const run = s.journalTrackers.find((t) => t.label === 'Run');
        expect(run).toBeDefined();
        expect(run?.kind).toBe('check');
        expect(s.journalTrackers.filter((t) => t.kind === 'scale').length).toBeGreaterThan(0);
    });

    it('runs every ordered step a config has not seen yet', () => {
        // v2 → v3 → v4 → v5. The ordered migrations must run for a config that
        // is past the sentinel-based ones, which used to return early — and a
        // config several versions behind has to collect all of them, in order.
        const s = load({ settingsVersion: 2, activeModuleIds: ['dashboard', 'tasks'] });
        expect(s.activeModuleIds).toEqual([
            'dashboard',
            'tasks',
            'navigator',
            'prayer',
            'sync',
        ]);
    });

    it('adds only the steps a config is actually missing', () => {
        const s = load({
            settingsVersion: 3,
            activeModuleIds: ['dashboard', 'navigator'],
        });
        expect(s.activeModuleIds).toEqual(['dashboard', 'navigator', 'prayer', 'sync']);
    });

    it('switches sync on for an existing config, because it fixes a bug that config has', () => {
        // Until v5 the last device to save overwrote every setting the others
        // had changed. Nobody opted into that, so nobody has to opt out of the
        // fix — but a user who already turned it off keeps it off.
        const fresh = load({ settingsVersion: 4, activeModuleIds: ['dashboard'] });
        expect(fresh.activeModuleIds).toContain('sync');

        const already = load({ settingsVersion: 5, activeModuleIds: ['dashboard'] });
        expect(already.activeModuleIds).not.toContain('sync');
    });

    it('never adds a module the user already has', () => {
        const s = load({ settingsVersion: 1, activeModuleIds: ['navigator', 'prayer'] });
        expect(s.activeModuleIds.filter((id) => id === 'prayer')).toHaveLength(1);
        expect(s.activeModuleIds.filter((id) => id === 'navigator')).toHaveLength(1);
    });

    it('leaves a versioned config alone', () => {
        // The sentinel migrations must not fire again on a modern config that
        // legitimately has only one module switched on.
        const s = load({
            settingsVersion: CURRENT_SETTINGS_VERSION,
            activeModuleIds: ['dashboard'],
        });
        expect(s.activeModuleIds).toEqual(['dashboard']);
    });

    it('does not resurrect trackers the user deliberately deleted', () => {
        const s = load({ settingsVersion: CURRENT_SETTINGS_VERSION, journalTrackers: [] });
        expect(s.journalTrackers).toEqual([]);
    });
});

describe('module settings bucket', () => {
    it('merges a patch and leaves other modules untouched', () => {
        load({ moduleSettings: { a: { x: 1 }, b: { y: 2 } } });
        useZenithStore.getState().updateModuleSettings('a', { z: 3 });

        const { moduleSettings } = useZenithStore.getState().settings;
        expect(moduleSettings.a).toEqual({ x: 1, z: 3 });
        expect(moduleSettings.b).toEqual({ y: 2 });
    });

    it('creates the bucket on first write', () => {
        load({});
        useZenithStore.getState().updateModuleSettings('fresh', { on: true });
        expect(useZenithStore.getState().settings.moduleSettings.fresh).toEqual({ on: true });
    });

    it('empties a bucket on reset but keeps it on the record', () => {
        load({ moduleSettings: { a: { x: 1 } } });
        useZenithStore.getState().resetModuleSettings('a');
        expect(useZenithStore.getState().settings.moduleSettings.a).toEqual({});
    });

    it('removes the bucket entirely on forget', () => {
        load({ moduleSettings: { a: { x: 1 }, b: { y: 2 } } });
        useZenithStore.getState().forgetModuleSettings('a');

        const { moduleSettings } = useZenithStore.getState().settings;
        expect(moduleSettings).not.toHaveProperty('a');
        expect(moduleSettings.b).toEqual({ y: 2 });
    });
});

describe('loadSettings — saved dashboard layouts', () => {
    const preset = (id: string) => ({
        id,
        name: id,
        dashboardLayout: [{ id: 'clock', x: 0, y: 0, size: 'sm' }],
    });

    it('reads saved layouts back, and defaults to none', () => {
        expect(load({}).dashboardPresets).toEqual([]);
        expect(load({}).dashboardPresetId).toBe('');

        const s = load({ dashboardPresets: [preset('layout-1')] } as never);
        expect(s.dashboardPresets).toHaveLength(1);
        expect(s.dashboardPresets[0].dashboardGrid.columns).toBeGreaterThan(0);
    });

    it('throws out a layout that data.json cannot back up', () => {
        // Hand-edited or half-written: an entry with no arrangement is not one.
        const s = load({ dashboardPresets: [{ id: 'a' }, 'nonsense', preset('layout-2')] } as never);
        expect(s.dashboardPresets.map((p) => p.id)).toEqual(['layout-2']);
    });

    it('forgets an active layout that did not survive the read', () => {
        const s = load({ dashboardPresets: [{ id: 'gone' }], dashboardPresetId: 'gone' } as never);
        expect(s.dashboardPresets).toEqual([]);
        expect(s.dashboardPresetId).toBe('');
    });

    it('keeps the active id when its layout is still there', () => {
        const s = load({
            dashboardPresets: [preset('layout-1')],
            dashboardPresetId: 'layout-1',
        } as never);
        expect(s.dashboardPresetId).toBe('layout-1');
    });
});
