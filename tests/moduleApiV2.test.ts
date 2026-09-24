import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { moduleCodeHash, sha256Hex } from '../src/core/hash';
import {
    describePermission,
    hostOf,
    parsePermissions,
    permissionGuard,
    samePermissions,
    ZenithPermissionError,
} from '../src/core/modulePermissions';
import { validateManifest } from '../src/core/moduleManifestSchema';
import { EventBus, journalEvents, taskEvents } from '../src/core/extensions/events';
import {
    ExtensionRegistry,
    extensions,
    removeModuleExtensions,
} from '../src/core/extensions/registry';
import {
    FAILURE_LIMIT,
    failureCount,
    guarded,
    reportExtensionFailure,
    resetFailures,
    setDisableHandler,
} from '../src/core/extensions/health';
import { withActivity } from '../src/core/moduleActivity';
import {
    allFeatures,
    featureEnabled,
    getFeature,
    registerExternalFeature,
} from '../src/core/features';
import { createModuleApiV2 } from '../src/core/moduleApiV2';
import { ModuleRegistrationLedger } from '../src/core/moduleLedger';
import { moduleTableProvider, resolveTableProvider } from '../src/modules/prayer/moduleProviders';
import { ALADHAN } from '../src/modules/prayer/prayerProvider';
import { resetZenithStore, useZenithStore } from '../src/store';
import type { Task } from '../src/store/taskSlice';
import type { JournalEntry } from '../src/store/journalSlice';
import type ZenithPlugin from '../src/main';

beforeEach(() => {
    resetZenithStore();
    resetFailures();
    setDisableHandler(null);
});

describe('sha256Hex', () => {
    it('agrees with Node at every padding boundary', () => {
        for (const text of [
            '',
            'abc',
            'ü',
            'x'.repeat(55),
            'x'.repeat(56),
            'x'.repeat(64),
            'я'.repeat(300),
        ]) {
            expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
        }
    });

    it('names the algorithm in what is recorded', () => {
        expect(moduleCodeHash('abc')).toBe(
            'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });
});

describe('permissions', () => {
    it('reads the manifest list, and keeps what it cannot read apart', () => {
        expect(
            parsePermissions([
                'Tasks:Read',
                'ui:slots',
                'network:api.example.com',
                'tasks:read',
                'tasks:everything',
            ])
        ).toEqual({
            permissions: ['network:api.example.com', 'tasks:read', 'ui:slots'],
            invalid: ['tasks:everything'],
        });
        expect(parsePermissions(undefined)).toEqual({ permissions: [], invalid: [] });
        expect(parsePermissions('tasks:read').invalid).toEqual(['tasks:read']);
    });

    it('takes a host, not a URL, and a module id for settings', () => {
        expect(
            parsePermissions(['network:https://evil.com', 'network:localhost']).invalid
        ).toHaveLength(2);
        expect(parsePermissions(['settings:journal']).permissions).toEqual(['settings:journal']);
    });

    it('says each one in words', () => {
        expect(describePermission('tasks:write')).toEqual({
            key: 'permission.tasks.write',
            params: {},
        });
        expect(describePermission('network:api.example.com')).toEqual({
            key: 'permission.network',
            params: { host: 'api.example.com' },
        });
        expect(describePermission('settings:prayer')).toEqual({
            key: 'permission.settings',
            params: { module: 'prayer' },
        });
    });

    it('compares lists as sets', () => {
        expect(samePermissions(['a', 'b'], ['b', 'a', 'a'])).toBe(true);
        expect(samePermissions(undefined, [])).toBe(true);
        expect(samePermissions(['a'], ['a', 'b'])).toBe(false);
    });

    it('guards by permission, and by the host a URL goes to', () => {
        const guard = permissionGuard('m', ['tasks:read', 'network:api.example.com']);
        expect(() => guard.require('tasks:read')).not.toThrow();
        expect(() => guard.require('tasks:write')).toThrow(ZenithPermissionError);
        expect(() => guard.requireUrl('https://api.example.com/v1?q=1')).not.toThrow();
        expect(() => guard.requireUrl('https://api.example.com.evil.net/')).toThrow(
            /network:api.example.com.evil.net/
        );
        expect(() => guard.requireUrl('file:///etc/passwd')).toThrow(/not a web address/);
        expect(hostOf('HTTPS://API.Example.com/x')).toBe('api.example.com');
    });
});

describe('manifest', () => {
    const ctx = { pluginVersion: '1.0.0' };

    it('carries permissions, and makes a module that declares them API 2', () => {
        const checked = validateManifest(
            { id: 'mine', name: 'Mine', permissions: ['tasks:read'] },
            ctx
        );
        expect(checked.ok && checked.manifest.permissions).toEqual(['tasks:read']);
        expect(checked.ok && checked.manifest.apiVersion).toBe(2);
        const v1 = validateManifest({ id: 'old', name: 'Old' }, ctx);
        expect(v1.ok && v1.manifest.apiVersion).toBe(1);
    });

    it('refuses a permission it does not know', () => {
        const checked = validateManifest(
            { id: 'mine', name: 'Mine', permissions: ['task:read'] },
            ctx
        );
        expect(checked).toEqual({
            ok: false,
            problem: { kind: 'bad-permission', permission: 'task:read' },
        });
    });
});

// ── Events ───────────────────────────────────────────

const task = (title: string, over: Partial<Task> = {}): Task =>
    ({
        id: `T.md:${title}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'T.md',
        lineNumber: 0,
        createdAt: '',
        ...over,
    }) as Task;

describe('taskEvents', () => {
    it('sees a task created and one completed', () => {
        const before = [task('a'), task('b')];
        const after = [task('a', { status: 'done', lineNumber: 5 }), task('b'), task('c')];
        expect(
            taskEvents(before, after).map((e) => [
                e.name,
                'task' in e.payload ? e.payload.task.title : '',
            ])
        ).toEqual([
            ['task:completed', 'a'],
            ['task:created', 'c'],
        ]);
    });

    it('does not mistake a line moving for a new task', () => {
        expect(taskEvents([task('a', { lineNumber: 1 })], [task('a', { lineNumber: 9 })])).toEqual(
            []
        );
    });

    it('counts identical lines one by one', () => {
        const events = taskEvents([task('call')], [task('call'), task('call')]);
        expect(events.map((e) => e.name)).toEqual(['task:created']);
    });
});

describe('journalEvents', () => {
    const entry = (
        date: string,
        values: JournalEntry['values'],
        texts: Record<string, string> = {}
    ) =>
        ({
            date,
            filePath: `${date}.md`,
            values,
            texts,
            tags: [],
            body: '',
            words: 0,
            mtime: 0,
        }) as JournalEntry;

    it('names the keys that changed on each day', () => {
        const events = journalEvents(
            [entry('2026-09-24', { mood: 3, run: true })],
            [
                entry('2026-09-24', { mood: 4, run: true }, { fajr: 'ontime' }),
                entry('2026-09-25', {}),
            ]
        );
        expect(events).toHaveLength(1);
        expect(events[0].payload).toMatchObject({ date: '2026-09-24', keys: ['fajr', 'mood'] });
    });
});

describe('EventBus', () => {
    it('keeps delivering past a listener that throws, and blames its module', () => {
        const bus = new EventBus();
        const heard: string[] = [];
        bus.on('bad', 'task:created', () => {
            throw new Error('boom');
        });
        bus.on('good', 'task:created', ({ task: t }) => heard.push(t.title));
        const blamed: string[] = [];
        bus.emit({ name: 'task:created', payload: { task: task('x') } }, (id) => blamed.push(id));
        expect(heard).toEqual(['x']);
        expect(blamed).toEqual(['bad']);
        bus.removeModule('good');
        expect(bus.listening('task:created')).toBe(true);
        bus.removeModule('bad');
        expect(bus.listening('task:created')).toBe(false);
    });
});

// ── Registry, health, activity ───────────────────────

describe('ExtensionRegistry', () => {
    it('orders, replaces a re-registration, and takes a module’s all back', () => {
        const registry = new ExtensionRegistry<{
            moduleId: string;
            id: string;
            order?: number;
            v: number;
        }>();
        const heard = vi.fn();
        registry.subscribe(heard);
        registry.add({ moduleId: 'a', id: 'x', order: 5, v: 1 });
        registry.add({ moduleId: 'b', id: 'y', order: 1, v: 2 });
        registry.add({ moduleId: 'a', id: 'x', order: 5, v: 3 });
        expect(registry.list().map((e) => e.v)).toEqual([2, 3]);
        registry.removeModule('a');
        expect(registry.list().map((e) => e.moduleId)).toEqual(['b']);
        expect(heard).toHaveBeenCalledTimes(4);
    });
});

describe('extension health', () => {
    it('switches a module off at the limit, and only then', () => {
        const disabled: string[] = [];
        setDisableHandler((id) => disabled.push(id));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (let i = 1; i < FAILURE_LIMIT; i++)
            expect(reportExtensionFailure('m', 'test', new Error('x'))).toBe(false);
        expect(failureCount('m')).toBe(FAILURE_LIMIT - 1);
        expect(reportExtensionFailure('m', 'test', new Error('x'))).toBe(true);
        expect(disabled).toEqual(['m']);
        expect(
            guarded(
                'n',
                'test',
                () => {
                    throw new Error('y');
                },
                'fallback'
            )
        ).toBe('fallback');
    });
});

describe('activity log', () => {
    it('keeps the newest, up to the limit', () => {
        let log = [] as ReturnType<typeof withActivity>;
        for (let i = 0; i < 5; i++)
            log = withActivity(log, { moduleId: 'm', at: i, action: `a${i}` }, 3);
        expect(log.map((e) => e.at)).toEqual([2, 3, 4]);
    });
});

describe('external features', () => {
    it('are features like any other, under the module’s own name', () => {
        const off = registerExternalFeature({
            id: 'mine.focus',
            moduleId: 'mine',
            labelKey: 'mine.feature.focus',
            descKey: 'mine.feature.focus.desc',
            default: true,
        });
        expect(getFeature('mine.focus')).toBeDefined();
        expect(allFeatures().some((f) => f.id === 'mine.focus')).toBe(true);
        const settings = { features: {}, activeModuleIds: ['mine'] };
        expect(featureEnabled(settings, 'mine.focus')).toBe(true);
        expect(featureEnabled({ ...settings, activeModuleIds: [] }, 'mine.focus')).toBe(false);
        expect(() =>
            registerExternalFeature({
                id: 'tasks.heatmap',
                moduleId: 'mine',
                labelKey: '',
                descKey: '',
                default: true,
            })
        ).toThrow();
        off();
        expect(getFeature('mine.focus')).toBeUndefined();
    });
});

// ── The API itself ───────────────────────────────────

describe('module API v2', () => {
    const plugin = {
        app: {},
        dataService: { reloadTasks: async () => undefined },
    } as unknown as ZenithPlugin;

    it('answers only for what the module declared', () => {
        useZenithStore.setState({ tasks: [task('a')] });
        const none = createModuleApiV2(plugin, 'm', new ModuleRegistrationLedger(), []);
        expect(() => none.tasks.list()).toThrow(/"tasks:read"/);
        expect(() =>
            none.ui.registerSlot('tasks.item.afterTitle', { id: 's', mount: () => undefined })
        ).toThrow(ZenithPermissionError);

        const reader = createModuleApiV2(plugin, 'm', new ModuleRegistrationLedger(), [
            'tasks:read',
        ]);
        const listed = reader.tasks.list();
        expect(listed.map((t) => t.title)).toEqual(['a']);
        // A copy: the store is not the module's to change.
        listed[0].title = 'changed';
        expect(useZenithStore.getState().tasks[0].title).toBe('a');
    });

    it('refuses a place that does not exist', () => {
        const api = createModuleApiV2(plugin, 'm', new ModuleRegistrationLedger(), ['ui:slots']);
        expect(() => api.ui.registerSlot('tasks.everywhere' as never, { id: 's' })).toThrow(
            /no place called/
        );
    });

    it('registers through the ledger, so unloading takes it back', () => {
        const ledger = new ModuleRegistrationLedger();
        const api = createModuleApiV2(plugin, 'm', ledger, ['ui:slots', 'calendar:layers']);
        api.ui.registerSlot('journal.day.afterTrackers', { id: 's', mount: () => undefined });
        api.calendar.registerLayer({ id: 'l', label: 'L', events: () => [] });
        expect(extensions.slots.list()).toHaveLength(1);
        ledger.disposeAll('m');
        expect(extensions.slots.list()).toHaveLength(0);
        expect(extensions.calendarLayers.list()).toHaveLength(0);
        removeModuleExtensions('m');
    });
});

describe('module prayer timetables', () => {
    it('turn a module’s clock times into the table’s minutes', async () => {
        const provider = moduleTableProvider({
            moduleId: 'mufti',
            id: 'kazan',
            label: 'Kazan',
            year: async () => ({
                '2026-09-24': {
                    fajr: '04:41',
                    sunrise: '06:30',
                    dhuhr: '12:31',
                    asr: '15:48',
                    maghrib: '18:31',
                    isha: '20:05',
                },
                'not a date': {
                    fajr: '01:00',
                    sunrise: '',
                    dhuhr: '',
                    asr: '',
                    maghrib: '',
                    isha: '',
                },
            }),
        });
        const days = await provider.fetchYear({ lat: 55.8, lon: 49.1 }, 2026, {} as never);
        expect(days?.['2026-09-24']).toMatchObject({
            fajr: 281,
            dhuhr: 751,
            maghrib: 1111,
            isha: 1205,
        });
        expect(Object.keys(days ?? {})).toEqual(['2026-09-24']);
    });

    it('fail like any other table — null, and the module blamed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const provider = moduleTableProvider({
            moduleId: 'mufti',
            id: 'broken',
            label: 'Broken',
            year: async () => {
                throw new Error('offline');
            },
        });
        expect(await provider.fetchYear({ lat: 0, lon: 0 }, 2026, {} as never)).toBeNull();
        expect(failureCount('mufti')).toBe(1);
    });

    it('fall back to Aladhan when the chosen one is not here', () => {
        expect(resolveTableProvider('')).toBe(ALADHAN);
        expect(resolveTableProvider('gone:away')).toBe(ALADHAN);
    });
});

describe('the example module', () => {
    it('has a manifest Zenith accepts, as API 2', async () => {
        const { readFileSync } = await import('node:fs');
        const raw = JSON.parse(readFileSync('modules_def/due-badges/manifest.json', 'utf8'));
        const checked = validateManifest(raw, { pluginVersion: '1.0.0' });
        expect(checked.ok && checked.manifest).toMatchObject({
            id: 'due-badges',
            apiVersion: 2,
            permissions: ['features', 'tasks:read', 'ui:slots'],
        });
    });
});
