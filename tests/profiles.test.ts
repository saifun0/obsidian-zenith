import { describe, it, expect, beforeEach } from 'vitest';
import {
    BEFORE_PROFILES_ID,
    PROFILE_POLICY,
    captureProfile,
    diffProfile,
    exportableProfile,
    isEmptyDiff,
    parseProfile,
    profileFileName,
    profilePatch,
    serializeProfile,
    undoFor,
    type ModuleContext,
    type Profile,
} from '../src/core/profiles/profiles';
import { TEMPLATES, TEMPLATE_UNTOUCHED, templateProfile } from '../src/core/profiles/templates';
import { FEATURES, getFeature } from '../src/core/features';
import { DEFAULT_SETTINGS, type ZenithSettings } from '../src/store/settingsSlice';
import { STATE_POLICY } from '../src/modules/sync/statePolicy';
import { useZenithStore, resetZenithStore } from '../src/store';

const TODAY = '2026-09-23';
const BUILT_IN = DEFAULT_SETTINGS.activeModuleIds;
const MODULES: ModuleContext = { builtIn: BUILT_IN, available: [...BUILT_IN, 'third-party'] };

const settingsWith = (patch: Partial<ZenithSettings> = {}): ZenithSettings => ({
    ...DEFAULT_SETTINGS,
    ...patch,
});

const everything = { paths: true, place: true };
const nothingPrivate = { paths: false, place: false };

describe('what a profile may carry', () => {
    it('never carries a credential, a token or a server', () => {
        for (const key of [
            'syncRemotePassword',
            'syncRemoteUser',
            'syncRemoteUrl',
            'syncS3AccessKey',
            'syncS3Secret',
            'syncDropboxTokens',
            'syncOnedriveTokens',
            'syncDropboxClientId',
            'syncOnedriveClientId',
            'syncEncryptionPassword',
        ] as const) {
            expect(PROFILE_POLICY[key], key).toBe('no');
        }
        for (const key of Object.keys(PROFILE_POLICY)) {
            if (key.startsWith('sync')) expect(PROFILE_POLICY[key as keyof ZenithSettings], key).toBe('no');
        }
    });

    it('carries the switch of every feature stored in a setting as a feature', () => {
        const featureKeys = new Set(FEATURES.map((f) => f.settingKey).filter(Boolean));
        for (const [key, policy] of Object.entries(PROFILE_POLICY)) {
            expect(policy === 'feature', key).toBe(featureKeys.has(key as never));
        }
    });

    /**
     * Shared settings, plus a short list of harmless ones that stay on each
     * device. A device setting joining that list is a decision, not a default.
     */
    it('carries device settings only from a short, deliberate list', () => {
        const allowed = new Set(['uiDensity', 'uiAnimations', 'notifySystem', 'defaultModuleId']);
        for (const [key, policy] of Object.entries(PROFILE_POLICY)) {
            if (policy === 'no' || policy === 'feature') continue;
            const scope = STATE_POLICY[key as keyof ZenithSettings].scope;
            if (scope !== 'shared') expect(allowed.has(key), key).toBe(true);
        }
    });
});

describe('capturing and exporting', () => {
    const settings = settingsWith({
        tasksFolderPath: 'My/Tasks',
        location: { lat: 45, lon: 42, name: 'Stavropol' },
        syncRemotePassword: 'hunter2',
        uiDensity: 'compact',
        weatherShowAir: false,
        features: { 'tasks.timer': false },
    });

    it('takes paths and place only when asked', () => {
        const all = captureProfile(settings, 'Mine', TODAY, everything);
        expect(all.settings.tasksFolderPath).toBe('My/Tasks');
        expect(all.settings.location).toEqual({ lat: 45, lon: 42, name: 'Stavropol' });

        const bare = captureProfile(settings, 'Mine', TODAY, nothingPrivate);
        expect(bare.settings).not.toHaveProperty('tasksFolderPath');
        expect(bare.settings).not.toHaveProperty('location');
        expect(bare.settings.uiDensity).toBe('compact');
    });

    it('never takes a secret, whatever is asked', () => {
        const all = captureProfile(settings, 'Mine', TODAY, everything);
        expect(JSON.stringify(all)).not.toContain('hunter2');
    });

    it('records every feature, wherever its switch lives', () => {
        const p = captureProfile(settings, 'Mine', TODAY, everything);
        expect(Object.keys(p.features)).toHaveLength(FEATURES.length);
        expect(p.features['tasks.timer']).toBe(false);
        expect(p.features['weather.air']).toBe(false);
        expect(p.settings).not.toHaveProperty('weatherShowAir');
    });

    it('narrows a saved profile for handing on', () => {
        const saved = captureProfile(settings, 'Mine', TODAY, everything);
        const out = exportableProfile(saved, nothingPrivate);
        expect(out.settings).not.toHaveProperty('tasksFolderPath');
        expect(out.settings).not.toHaveProperty('location');
        expect(out).not.toHaveProperty('id');
    });

    it('names its file after itself, and only with what a file system accepts', () => {
        expect(profileFileName('Мой: минимум?')).toBe('Мой минимум.json');
        expect(profileFileName('///')).toBe('profile.json');
    });
});

describe('reading a profile', () => {
    it('reads back what it wrote, with nothing to report', () => {
        const p = captureProfile(settingsWith(), 'Mine', TODAY, everything);
        const read = parseProfile(serializeProfile(p), DEFAULT_SETTINGS);
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.profile).toEqual(p);
        expect(read.report).toEqual({ unknownSettings: [], rejectedSettings: [], unknownFeatures: [] });
    });

    it('says why it cannot read one at all', () => {
        expect(parseProfile('not json', DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'json' });
        expect(parseProfile('{"a":1}', DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'format' });
        expect(parseProfile('{"zenith":"profile","version":2}', DEFAULT_SETTINGS)).toEqual({
            ok: false,
            error: 'version',
        });
    });

    it('keeps what fits and lists what does not', () => {
        const read = parseProfile(
            JSON.stringify({
                zenith: 'profile',
                version: 1,
                name: 'Theirs',
                modules: ['tasks'],
                features: { 'tasks.timer': false, 'tasks.fromTheFuture': true, 'tasks.stats': 'yes' },
                settings: {
                    uiDensity: 'compact',
                    taskImageSize: 'big',
                    somethingNew: 1,
                    syncRemotePassword: 'sneaky',
                    weatherShowAir: false,
                    journalTrackers: [{ id: 'x' }],
                    prayerAdjustments: { fajr: 2 },
                },
            }),
            DEFAULT_SETTINGS
        );
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        expect(read.profile.settings).toEqual({ uiDensity: 'compact', prayerAdjustments: { fajr: 2 } });
        expect(read.profile.features).toEqual({ 'tasks.timer': false });
        expect(read.report.unknownSettings).toEqual(['somethingNew']);
        expect(read.report.rejectedSettings.sort()).toEqual(
            ['journalTrackers', 'syncRemotePassword', 'taskImageSize', 'weatherShowAir'].sort()
        );
        expect(read.report.unknownFeatures.sort()).toEqual(['tasks.fromTheFuture', 'tasks.stats']);
    });
});

describe('applying a profile', () => {
    const profile = (patch: Partial<Profile> = {}): Profile => ({
        ...captureProfile(settingsWith(), 'P', TODAY, everything),
        ...patch,
    });

    it('makes the built-in modules exactly what it lists, and leaves an unknown module alone', () => {
        const settings = settingsWith({ activeModuleIds: [...BUILT_IN, 'third-party'] });
        const patch = profilePatch(settings, profile({ modules: ['tasks'] }), 'replace', MODULES);
        expect(patch.activeModuleIds).toEqual(['tasks', 'third-party']);
    });

    it('switches on an installed module it lists, and ignores one that is not there', () => {
        const patch = profilePatch(
            settingsWith({ activeModuleIds: ['tasks'] }),
            profile({ modules: ['tasks', 'third-party', 'missing'] }),
            'replace',
            MODULES
        );
        expect(patch.activeModuleIds).toEqual(['tasks', 'third-party']);
    });

    it('writes a feature where it lives', () => {
        const patch = profilePatch(
            settingsWith(),
            profile({ features: { 'weather.air': false, 'tasks.timer': false } }),
            'replace',
            MODULES
        );
        expect(patch.weatherShowAir).toBe(false);
        expect(patch.features?.['tasks.timer']).toBe(false);
    });

    it('changes settings when replacing, never when adding', () => {
        const p = profile({ settings: { uiDensity: 'compact' } });
        expect(profilePatch(settingsWith(), p, 'replace', MODULES).uiDensity).toBe('compact');
        expect(profilePatch(settingsWith(), p, 'add', MODULES)).not.toHaveProperty('uiDensity');
    });

    it('only switches things on when adding', () => {
        const settings = settingsWith({ activeModuleIds: ['tasks', 'content'] });
        const p = profile({
            modules: ['journal'],
            features: { 'tasks.timer': false, 'tasks.stats': true },
        });
        const patch = profilePatch(
            { ...settings, features: { 'tasks.stats': false } },
            p,
            'add',
            MODULES
        );
        expect(patch.activeModuleIds).toEqual(['tasks', 'content', 'journal']);
        expect(patch.features?.['tasks.stats']).toBe(true);
        expect(patch.features).not.toHaveProperty('tasks.timer');
    });

    it('changes nothing when the profile is the current state', () => {
        const settings = settingsWith({ uiDensity: 'spacious' });
        const same = captureProfile(settings, 'Same', TODAY, everything);
        expect(profilePatch(settings, same, 'replace', MODULES)).toEqual({});
    });

    it('can be put back exactly', () => {
        const settings = settingsWith({ uiDensity: 'spacious', weatherShowAir: true });
        const patch = profilePatch(
            settings,
            profile({ modules: ['tasks'], features: { 'weather.air': false }, settings: { uiDensity: 'compact' } }),
            'replace',
            MODULES
        );
        const after = { ...settings, ...patch };
        const restored = { ...after, ...undoFor(settings, patch) };
        expect(restored).toEqual(settings);
    });

    it('lists what changes, leaving out the features of a module going off', () => {
        const settings = settingsWith({ features: { 'tasks.heatmap': true } });
        const patch = profilePatch(
            settings,
            profile({
                modules: BUILT_IN.filter((m) => m !== 'content'),
                features: { 'tasks.heatmap': false, 'content.stats': false },
                settings: { uiDensity: 'compact' },
            }),
            'replace',
            MODULES
        );
        const diff = diffProfile(settings, patch);
        expect(diff.modulesOff).toEqual(['content']);
        expect(diff.featuresOff).toEqual(['tasks.heatmap']);
        expect(diff.settingsChanged).toEqual(['uiDensity']);
        expect(isEmptyDiff(diffProfile(settings, {}))).toBe(true);
    });
});

describe('templates', () => {
    it('switch on only features that exist, in their own modules', () => {
        for (const tpl of TEMPLATES) {
            if (tpl.on === 'all') continue;
            for (const id of tpl.on) {
                const def = getFeature(id);
                expect(def, `${tpl.id}: ${id}`).toBeDefined();
                expect(
                    [...tpl.modules, 'core', 'notifications'].includes(def!.moduleId),
                    `${tpl.id}: ${id}`
                ).toBe(true);
            }
        }
    });

    it('speak only for their own modules', () => {
        const minimum = templateProfile(TEMPLATES.find((t) => t.id === 'minimum')!, 'M', TODAY);
        expect(minimum.features).toHaveProperty('tasks.timer', false);
        expect(minimum.features).toHaveProperty('tasks.captureDaily', true);
        expect(minimum.features).not.toHaveProperty('content.stats');
    });

    it('can switch everything on', () => {
        const all = templateProfile(TEMPLATES.find((t) => t.id === 'everything')!, 'A', TODAY);
        expect(Object.values(all.features).every(Boolean)).toBe(true);
        expect(Object.keys(all.features)).toHaveLength(FEATURES.filter((f) => !f.manual).length);
    });

    it('never decide a feature that is only switched on by hand', () => {
        // "Life in weeks" asks for a birth date: not something a template
        // should turn on — nor, for someone who did, take away.
        for (const template of TEMPLATES) {
            const profile = templateProfile(template, 'T', TODAY);
            expect(profile.features).not.toHaveProperty('dashboard.lifeWeeks');
        }
    });

    it('leave sync alone', () => {
        const scope: ModuleContext = {
            builtIn: BUILT_IN.filter((m) => !TEMPLATE_UNTOUCHED.includes(m)),
            available: BUILT_IN,
        };
        const minimum = templateProfile(TEMPLATES.find((t) => t.id === 'minimum')!, 'M', TODAY);
        const patch = profilePatch(settingsWith(), minimum, 'replace', scope);
        expect(patch.activeModuleIds).toContain('sync');
        expect(patch.activeModuleIds).not.toContain('content');
    });
});

describe('the v10 migration', () => {
    beforeEach(() => resetZenithStore());

    const load = (saved: Partial<ZenithSettings>) => {
        useZenithStore.getState().loadSettings(saved);
        return useZenithStore.getState().settings;
    };

    it('keeps a snapshot of an existing setup, and does not offer templates', () => {
        const s = load({ settingsVersion: 9, tasksFolderPath: 'My/Tasks', uiDensity: 'compact' });
        expect(s.profilesOnboarded).toBe(true);
        const before = s.profiles.find((p) => p.id === BEFORE_PROFILES_ID);
        expect(before?.kind).toBe('before');
        expect(before?.settings.tasksFolderPath).toBe('My/Tasks');
        expect(before?.settings.uiDensity).toBe('compact');
    });

    it('offers templates to a fresh install, with nothing saved', () => {
        const s = load({});
        expect(s.profilesOnboarded).toBe(false);
        expect(s.profiles).toEqual([]);
    });

    it('runs once', () => {
        const s = load({ settingsVersion: 10, tasksFolderPath: 'X' });
        expect(s.profiles).toEqual([]);
    });

    it('drops a stored profile that does not hold together', () => {
        const good = { ...captureProfile(settingsWith(), 'Good', TODAY, everything), id: 'g' };
        const s = load({
            settingsVersion: 10,
            profiles: [good, { id: 'bad' }, null] as never,
        });
        expect(s.profiles.map((p) => p.id)).toEqual(['g']);
    });
});
