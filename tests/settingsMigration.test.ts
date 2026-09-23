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
        // v2 → v3 → v4 → v5 → v7. The ordered migrations must run for a config
        // that is past the sentinel-based ones, which used to return early —
        // and a config several versions behind has to collect all of them, in
        // order.
        const s = load({ settingsVersion: 2, activeModuleIds: ['dashboard', 'tasks'] });
        expect(s.activeModuleIds).toEqual([
            'dashboard',
            'tasks',
            'navigator',
            'prayer',
            'sync',
            'picture',
        ]);
    });

    it('adds only the steps a config is actually missing', () => {
        const s = load({
            settingsVersion: 3,
            activeModuleIds: ['dashboard', 'navigator'],
        });
        expect(s.activeModuleIds).toEqual(['dashboard', 'navigator', 'prayer', 'sync', 'picture']);
    });

    it('switches the picture widget on for an existing config', () => {
        // It costs a board nothing — one more entry in the widget gallery, and
        // nothing on the board until the user puts it there — and a built-in
        // module nobody can see is a module nobody switches on.
        const fresh = load({ settingsVersion: 6, activeModuleIds: ['dashboard'] });
        expect(fresh.activeModuleIds).toContain('picture');

        const already = load({ settingsVersion: 7, activeModuleIds: ['dashboard'] });
        expect(already.activeModuleIds).not.toContain('picture');
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

    it('drops the canvas module, which no longer ships', () => {
        // Not merely inert: `canvas` is not a reserved id, so leaving it in the
        // list would silently start a third-party module that took the name.
        const s = load({
            settingsVersion: 7,
            activeModuleIds: ['dashboard', 'canvas', 'tasks'],
        });
        expect(s.activeModuleIds).toEqual(['dashboard', 'tasks']);
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

describe('loadSettings — v5 → v6: one location for the whole plugin', () => {
    const stavropol = { lat: 45.03, lon: 41.96, name: 'Stavropol' };
    const istanbul = { lat: 41.01, lon: 28.98, name: 'Istanbul' };

    it('promotes the weather place and stops it shadowing the new setting', () => {
        // Leaving the module copy behind would make it an override that wins
        // for ever, so changing the city in the obvious place would silently
        // do nothing.
        const s = load({ settingsVersion: 5, weatherPlace: stavropol });
        expect(s.location).toEqual(stavropol);
        expect(s.weatherPlace).toBeNull();
    });

    it('promotes the prayer place when that is the one that was set', () => {
        const s = load({ settingsVersion: 5, prayerPlace: stavropol });
        expect(s.location).toEqual(stavropol);
        expect(s.prayerPlace).toBeNull();
    });

    it('keeps a genuine difference between the two as an override', () => {
        const s = load({ settingsVersion: 5, weatherPlace: istanbul, prayerPlace: stavropol });
        expect(s.location).toEqual(istanbul);
        expect(s.weatherPlace).toBeNull();
        // Praying where you are while watching a forecast somewhere else is the
        // case the overrides exist for, so this one survives.
        expect(s.prayerPlace).toEqual(stavropol);
    });

    it('leaves a config that already has a location alone', () => {
        const s = load({ settingsVersion: 6, location: istanbul, weatherPlace: stavropol });
        expect(s.location).toEqual(istanbul);
        expect(s.weatherPlace).toEqual(stavropol);
    });

    it('has nothing to promote when no module ever had a place', () => {
        const s = load({ settingsVersion: 5 });
        expect(s.location).toBeNull();
        expect(s.settingsVersion).toBe(CURRENT_SETTINGS_VERSION);
    });
});

describe('loadSettings — v10 → v11: the content library stops going online', () => {
    const book = { id: 'book', label: 'Book', icon: 'book-open', color: '#8b5cf6', fields: ['progress'] };

    it('drops the cover download switch and each type’s catalogue', () => {
        const s = load({
            settingsVersion: 10,
            cacheCovers: false,
            contentTypes: [{ ...book, provider: 'books' }] as never,
        });
        expect('cacheCovers' in s).toBe(false);
        expect(s.contentTypes).toEqual([book]);
    });

    it('leaves everything else about a type as the user set it', () => {
        const s = load({
            settingsVersion: 10,
            contentTypes: [{ ...book, label: 'Livre', provider: 'none', creatorLabel: 'Auteur' }] as never,
        });
        expect(s.contentTypes).toEqual([{ ...book, label: 'Livre', creatorLabel: 'Auteur' }]);
    });

    it('does not touch a config already past it', () => {
        // A key a newer build might bring back under the same name is not ours
        // to throw away twice.
        const s = load({ settingsVersion: 11, cacheCovers: true } as never);
        expect((s as unknown as Record<string, unknown>).cacheCovers).toBe(true);
    });
});

describe('loadSettings — v11 → v12: the prayer method is asked, not assumed', () => {
    it('asks someone still on both old defaults', () => {
        const s = load({ settingsVersion: 11, prayerMethod: 'russia', prayerAsrMadhab: 'hanafi' });
        expect(s.prayerMethodChosen).toBe(false);
    });

    it('does not ask someone who already changed either', () => {
        expect(load({ settingsVersion: 11, prayerMethod: 'mwl' }).prayerMethodChosen).toBe(true);
        resetZenithStore();
        expect(load({ settingsVersion: 11, prayerAsrMadhab: 'standard' }).prayerMethodChosen).toBe(
            true
        );
    });

    it('asks a fresh install', () => {
        expect(load({}).prayerMethodChosen).toBe(false);
    });

    it('keeps an answer once given', () => {
        expect(load({ settingsVersion: 12, prayerMethodChosen: true }).prayerMethodChosen).toBe(true);
    });
});
