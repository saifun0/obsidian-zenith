import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import { useZenithStore } from '../store';
import type { Task } from '../store/taskSlice';
import type { JournalEntry } from '../store/journalSlice';
import type { ContentItem } from '../store/contentSlice';
import type { ContentStatus, TaskStatus } from './constants';
import { featureEnabled, registerExternalFeature } from './features';
import { registerTranslations } from './i18n';
import { logModuleActivity } from './moduleActivity';
import { permissionGuard } from './modulePermissions';
import { guarded, guardedAsync, reportExtensionFailure } from './extensions/health';
import {
    extensions,
    REPLACEABLE_IDS,
    SLOT_IDS,
    type CalendarLayerEvent,
    type MetadataResult,
    type ProviderTimes,
    type ReplaceableId,
    type Renderer,
    type SlotId,
} from './extensions/registry';
import { eventBus, type ZenithEventName, type ZenithEvents } from './extensions/events';
import type { ModuleRegistrationLedger } from './moduleLedger';
import type { TaskPatch } from '../modules/tasks/services/taskFormat';
import { TaskWriter } from '../modules/tasks/services/taskWriter';
import { ContentWriter } from '../modules/content/services/contentWriter';
import { writeTrackerValues } from '../modules/journal/services/journalActions';
import {
    JournalWriter,
    journalConfig,
    type TrackerPatch,
} from '../modules/journal/services/journalWriter';
import type ZenithPlugin from '../main';

/**
 * The parts of the module API that reach into Zenith's own modules — version
 * 2. Each namespace answers only for the permissions the module declared
 * (see `modulePermissions`); anything else is a `ZenithPermissionError` that
 * names the permission to add.
 *
 * Writes go through the same writers Zenith's own views use, with their
 * guards: a task is changed only if the line still says what the module was
 * shown, a note's frontmatter through `processFrontMatter`. Every write is
 * logged under the module in settings.
 */

type Registered<T> = T & { id: string; order?: number };

export interface TasksApi {
    /** Every task Zenith has read. Copies — changing one changes nothing. `tasks:read`. */
    list(): Task[];
    /** An entry in a task's menu. `tasks:read` (the action is given the task). */
    registerAction(
        action: Registered<{
            label: string;
            icon?: string;
            when?: (task: Task) => boolean;
            run: (task: Task) => void | Promise<void>;
        }>
    ): () => void;
    /** A filter offered in the task list. `tasks:read`. */
    registerFilter(
        filter: Registered<{ label: string; test: (task: Task) => boolean }>
    ): () => void;
    /** `tasks:write`. False when the line no longer matches the task. */
    setStatus(task: Task, status: TaskStatus): Promise<boolean>;
    /** Change some of a task's fields; `null` removes a marker. `tasks:write`. */
    update(task: Task, patch: TaskPatch): Promise<boolean>;
}

export interface JournalApi {
    /** Every day with a note. `journal:read`. */
    entries(): JournalEntry[];
    /** Write values into a day's frontmatter, creating the note if needed; `null` removes. `journal:write`. */
    record(date: string, patch: TrackerPatch): Promise<boolean>;
}

export interface ContentApi {
    /** `content:read`. */
    list(): ContentItem[];
    /** `content:write`. */
    setStatus(item: ContentItem, status: ContentStatus): Promise<void>;
    /** `content:write`. */
    setProgress(item: ContentItem, current: number, total?: number): Promise<void>;
    /**
     * Offer to fill in an item's details from somewhere — a book database, a
     * film catalogue. `content:metadata`, and `network:<host>` for the host
     * it asks (through `network.request`).
     */
    registerMetadataProvider(
        provider: Registered<{
            label: string;
            types?: string[];
            search: (query: string, typeId: string) => Promise<MetadataResult[]>;
        }>
    ): () => void;
}

export interface CalendarApi {
    /** A read-only layer of events on the calendar. `calendar:layers`. */
    registerLayer(
        layer: Registered<{
            label: string;
            color?: string;
            events: (
                from: string,
                to: string
            ) => Promise<CalendarLayerEvent[]> | CalendarLayerEvent[];
        }>
    ): () => void;
}

export interface PrayerApi {
    /** A source of published times — a muftiate's own timetable. `prayer:provider`. */
    registerProvider(
        provider: Registered<{
            label: string;
            year: (
                year: number,
                place: { lat: number; lon: number; name?: string }
            ) => Promise<Record<string, ProviderTimes>>;
        }>
    ): () => void;
}

export interface UiApi {
    readonly slots: readonly SlotId[];
    readonly replaceable: readonly ReplaceableId[];
    /** Draw something in a named place of a built-in view. `ui:slots`. */
    registerSlot(slot: SlotId, renderer: Registered<Renderer<Record<string, unknown>>>): () => void;
    /** Draw a built-in piece your own way; Zenith's comes back if yours fails. `ui:slots`. */
    replace(
        target: ReplaceableId,
        renderer: Registered<Renderer<Record<string, unknown>>>
    ): () => void;
}

export interface EventsApi {
    /** `task:*` needs `tasks:read`, `journal:*` needs `journal:read`. */
    on<K extends ZenithEventName>(name: K, handler: (payload: ZenithEvents[K]) => void): () => void;
}

export interface SettingsPagesApi {
    /** A section on a built-in module's settings page. `settings:<module>`. */
    addSection(
        targetModule: string,
        section: Registered<Renderer<Record<string, unknown>> & { title: string }>
    ): () => void;
}

export interface FeaturesApi {
    /**
     * A switch of your own among the module's features — saved in profiles,
     * applied from them. Returns its id, `<module>.<name>`. `features`.
     */
    register(feature: {
        name: string;
        label: string;
        description?: string;
        default?: boolean;
    }): string;
    /** Whether one of your features is on. */
    enabled(name: string): boolean;
}

export interface NetworkApi {
    /** Obsidian's `requestUrl`, to a host the module declared: `network:<host>`. */
    request(params: RequestUrlParam | string): Promise<RequestUrlResponse>;
}

export interface ModuleApiV2 {
    readonly permissions: readonly string[];
    readonly tasks: TasksApi;
    readonly journal: JournalApi;
    readonly content: ContentApi;
    readonly calendar: CalendarApi;
    readonly prayer: PrayerApi;
    readonly ui: UiApi;
    readonly events: EventsApi;
    readonly settingsPages: SettingsPagesApi;
    readonly features: FeaturesApi;
    readonly network: NetworkApi;
}

const copy = <T>(value: T): T => structuredClone(value);

export function createModuleApiV2(
    plugin: ZenithPlugin,
    moduleId: string,
    ledger: ModuleRegistrationLedger,
    permissions: readonly string[]
): ModuleApiV2 {
    const guard = permissionGuard(moduleId, permissions);
    const { app } = plugin;
    const state = () => useZenithStore.getState();
    const track = (dispose: () => void) => {
        ledger.addDisposer(moduleId, dispose);
        return dispose;
    };
    const reload = () => void plugin.dataService.reloadTasks();

    const tasks: TasksApi = {
        list() {
            guard.require('tasks:read');
            return copy(state().tasks);
        },
        registerAction(action) {
            guard.require('tasks:read');
            return track(
                extensions.taskActions.add({
                    moduleId,
                    id: action.id,
                    order: action.order,
                    label: action.label,
                    icon: action.icon,
                    when: action.when
                        ? (task) =>
                              guarded(
                                  moduleId,
                                  `task action "${action.id}"`,
                                  () => !!action.when?.(copy(task)),
                                  false
                              )
                        : undefined,
                    run: (task) =>
                        guardedAsync(
                            moduleId,
                            `task action "${action.id}"`,
                            () => action.run(copy(task)),
                            undefined
                        ),
                })
            );
        },
        registerFilter(filter) {
            guard.require('tasks:read');
            return track(
                extensions.taskFilters.add({
                    moduleId,
                    id: filter.id,
                    order: filter.order,
                    label: filter.label,
                    test: (task) =>
                        guarded(
                            moduleId,
                            `task filter "${filter.id}"`,
                            () => !!filter.test(task),
                            false
                        ),
                })
            );
        },
        async setStatus(task, status) {
            guard.require('tasks:write');
            const ok = await new TaskWriter(app).setStatusInFile(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
            if (ok) {
                logModuleActivity(moduleId, `tasks.setStatus → ${status}`, task.filePath);
                reload();
            }
            return ok;
        },
        async update(task, patch) {
            guard.require('tasks:write');
            const ok = await new TaskWriter(app).updateTaskInFile(
                task.filePath,
                task.lineNumber,
                patch,
                task.title
            );
            if (ok) {
                logModuleActivity(
                    moduleId,
                    `tasks.update (${Object.keys(patch).join(', ')})`,
                    task.filePath
                );
                reload();
            }
            return ok;
        },
    };

    const journal: JournalApi = {
        entries() {
            guard.require('journal:read');
            return copy(state().journalEntries);
        },
        async record(date, patch) {
            guard.require('journal:write');
            const settings = state().settings;
            const ok = await writeTrackerValues(app, settings, date, patch);
            if (ok) {
                const path = new JournalWriter(app).pathFor(journalConfig(settings), date);
                logModuleActivity(
                    moduleId,
                    `journal.record (${Object.keys(patch).join(', ')})`,
                    path
                );
            }
            return ok;
        },
    };

    const content: ContentApi = {
        list() {
            guard.require('content:read');
            return copy(state().contentItems);
        },
        async setStatus(item, status) {
            guard.require('content:write');
            await new ContentWriter(app).setStatus(item.filePath, status, item, true);
            logModuleActivity(moduleId, `content.setStatus → ${status}`, item.filePath);
        },
        async setProgress(item, current, total) {
            guard.require('content:write');
            await new ContentWriter(app).setProgress(item.filePath, current, total);
            logModuleActivity(moduleId, 'content.setProgress', item.filePath);
        },
        registerMetadataProvider(provider) {
            guard.require('content:metadata');
            return track(
                extensions.metadataProviders.add({
                    moduleId,
                    id: provider.id,
                    order: provider.order,
                    label: provider.label,
                    types: provider.types,
                    search: (query, typeId) =>
                        guardedAsync(
                            moduleId,
                            `metadata provider "${provider.id}"`,
                            () => provider.search(query, typeId),
                            []
                        ),
                })
            );
        },
    };

    const calendar: CalendarApi = {
        registerLayer(layer) {
            guard.require('calendar:layers');
            return track(
                extensions.calendarLayers.add({
                    moduleId,
                    id: layer.id,
                    order: layer.order,
                    label: layer.label,
                    color: layer.color,
                    events: (from, to) =>
                        guardedAsync(
                            moduleId,
                            `calendar layer "${layer.id}"`,
                            () => layer.events(from, to),
                            []
                        ),
                })
            );
        },
    };

    const prayer: PrayerApi = {
        registerProvider(provider) {
            guard.require('prayer:provider');
            return track(
                extensions.prayerProviders.add({
                    moduleId,
                    id: provider.id,
                    order: provider.order,
                    label: provider.label,
                    year: provider.year,
                })
            );
        },
    };

    const checkSlot = (slot: string, known: readonly string[]) => {
        if (!known.includes(slot)) {
            throw new Error(
                `Zenith: there is no place called "${slot}". Known: ${known.join(', ')}.`
            );
        }
    };

    const ui: UiApi = {
        slots: SLOT_IDS,
        replaceable: REPLACEABLE_IDS,
        registerSlot(slot, renderer) {
            guard.require('ui:slots');
            checkSlot(slot, SLOT_IDS);
            return track(extensions.slots.add({ ...renderer, moduleId, slot }));
        },
        replace(target, renderer) {
            guard.require('ui:slots');
            checkSlot(target, REPLACEABLE_IDS);
            return track(extensions.replacements.add({ ...renderer, moduleId, target }));
        },
    };

    const events: EventsApi = {
        on(name, handler) {
            guard.require(name.startsWith('task:') ? 'tasks:read' : 'journal:read');
            return track(eventBus.on(moduleId, name, handler));
        },
    };

    const settingsPages: SettingsPagesApi = {
        addSection(targetModule, section) {
            guard.require(`settings:${targetModule}`);
            return track(extensions.settingsSections.add({ ...section, moduleId, targetModule }));
        },
    };

    const features: FeaturesApi = {
        register(feature) {
            guard.require('features');
            const id = `${moduleId}.${feature.name}`;
            const labelKey = `${moduleId}.feature.${feature.name}`;
            const descKey = `${labelKey}.desc`;
            track(
                registerTranslations(moduleId, {
                    en: {
                        [labelKey]: feature.label,
                        ...(feature.description ? { [descKey]: feature.description } : {}),
                    },
                })
            );
            track(
                registerExternalFeature({
                    id,
                    moduleId,
                    labelKey,
                    descKey,
                    default: feature.default ?? true,
                })
            );
            return id;
        },
        enabled(name) {
            return featureEnabled(state().settings, `${moduleId}.${name}`);
        },
    };

    const network: NetworkApi = {
        request(params) {
            const url = typeof params === 'string' ? params : params.url;
            guard.requireUrl(url);
            return requestUrl(params);
        },
    };

    return {
        permissions: [...permissions],
        tasks,
        journal,
        content,
        calendar,
        prayer,
        ui,
        events,
        settingsPages,
        features,
        network,
    };
}

/** Deliver an event, attributing a listener's throw to its module. */
export function emitZenithEvent(event: Parameters<typeof eventBus.emit>[0]): void {
    eventBus.emit(event, (moduleId, error) =>
        reportExtensionFailure(moduleId, `event "${event.name}"`, error)
    );
}
