import { Notice } from 'obsidian';
import type { App, Command, MarkdownPostProcessorContext, ViewCreator } from 'obsidian';
import { useZenithStore } from '../store';
import {
    registerTranslations,
    resolveLocale,
    translate,
    type TParams,
    type TranslationTable,
} from './i18n';
import { createModuleSettings, type ModuleSettingsAccessor } from './moduleSettings';
import { iconRegistry, describeSvgProblem } from './icons';
import type { ModuleRegistrationLedger } from './moduleLedger';
import type { DashboardWidgetDefinition } from '../modules/dashboard/widgets';
import type { NavActionDefinition } from '../modules/navigator/navigation';
import type ZenithPlugin from '../main';
import { createModuleApiV2, type ModuleApiV2 } from './moduleApiV2';

/**
 * What `require('zenith')` hands a third-party module.
 *
 * Everything a module is *meant* to touch goes through here, so the surface is
 * something we can keep working across versions. It is emphatically not a
 * security boundary — see `moduleEval` — just a stable, documented API instead
 * of a module reaching into plugin internals that will be renamed next week.
 *
 * One instance per module id, so registrations are attributed and can be
 * reclaimed on unload even if the module forgets to clean up after itself.
 */
export const ZENITH_MODULE_API_VERSION = 2;

/**
 * Version 2 adds everything in `ModuleApiV2` — reaching into Zenith's own
 * modules, by permission. A version-1 module (no `permissions` in its
 * manifest) sees exactly the API it was written against: the new namespaces
 * are there, but refuse without the permissions it never declared.
 */
export interface ZenithModuleApi extends ModuleApiV2 {
    readonly apiVersion: number;
    readonly pluginVersion: string;
    readonly moduleId: string;
    readonly app: App;
    readonly plugin: ZenithPlugin;

    /** Add a dashboard widget. Auto-removed on unload even if you forget. */
    registerDashboardWidget(definition: DashboardWidgetDefinition): () => void;
    /**
     * Add a button to the navigation launcher — your view sitting alongside
     * Zenith's own, rather than reachable only from the command palette. Give
     * it a `viewType` to open a view, or an `onClick` for anything else.
     * Auto-removed on unload, like a widget.
     */
    registerNavAction(definition: NavActionDefinition): () => void;
    /** Deduped by MODULE ID, so it survives a hot reload. */
    registerView(viewType: string, creator: ViewCreator): void;
    addCommand(command: Command): void;
    registerCodeBlock(
        language: string,
        handler: (
            source: string,
            el: HTMLElement,
            ctx: MarkdownPostProcessorContext
        ) => void | Promise<void>
    ): void;
    /**
     * Register an SVG icon under this module's namespace.
     *
     * Returns the id to use wherever Zenith takes one — a manifest `icon`, a
     * dashboard widget, a settings field — or null if the SVG was rejected, with
     * the reason logged. Names must be `[a-zA-Z0-9][a-zA-Z0-9_-]*`.
     *
     * Usually unnecessary: drop `icon.svg` (or an `icons/` folder) next to your
     * `main.js` and Zenith registers it for you before `onload` runs. Reach for
     * this when the artwork is generated or fetched rather than shipped.
     */
    registerIcon(name: string, svg: string): string | null;

    /** Anything else that should be torn down on unload. */
    register(dispose: () => void): void;

    /** Translate a key, resolving the user's language at call time. */
    t(key: string, params?: TParams): string;
    /**
     * Add strings to the dictionary, keyed by locale. Removed on unload.
     *
     * Keys must sit under this module's namespace — `<id>.…` or
     * `module.<id>.…`; anything else is ignored with a warning. Declaring them
     * in `getTranslations()` (or in `manifest.json`, which is read before your
     * code runs) is usually better. Reach for this when the strings are
     * generated or fetched rather than shipped.
     */
    registerTranslations(table: TranslationTable): () => void;
    /**
     * The Zenith store: hook, `.getState()` and `.subscribe()`.
     *
     * Version 1 only. It is all of the user's data at once, which is exactly
     * what permissions exist to divide up — so a module that declares
     * permissions reads through `tasks`, `journal` and `content` instead.
     */
    readonly store: typeof useZenithStore;
    /** This module's own settings bucket. */
    readonly settings: ModuleSettingsAccessor;

    notice(message: string, timeoutMs?: number): void;
}

export function createModuleApi(
    plugin: ZenithPlugin,
    moduleId: string,
    ledger: ModuleRegistrationLedger,
    settingsDefaults: Record<string, unknown> = {},
    access: { permissions: readonly string[]; apiVersion: number } = {
        permissions: [],
        apiVersion: 1,
    }
): ZenithModuleApi {
    return {
        ...createModuleApiV2(plugin, moduleId, ledger, access.permissions),
        apiVersion: ZENITH_MODULE_API_VERSION,
        pluginVersion: plugin.manifest.version,
        moduleId,
        app: plugin.app,
        plugin,

        registerDashboardWidget(definition) {
            const dispose = plugin.registerDashboardWidget(definition);
            ledger.addDisposer(moduleId, dispose);
            return dispose;
        },

        registerNavAction(definition) {
            const dispose = plugin.registerNavAction(definition);
            ledger.addDisposer(moduleId, dispose);
            return dispose;
        },

        // The three below are deduped through the ledger rather than simply
        // called: Obsidian throws on a repeat registration, and a hot reload
        // runs the module's `onload` again with a fresh instance.
        registerView(viewType, creator) {
            if (ledger.hasView(moduleId, viewType)) return;
            plugin.registerView(viewType, creator);
            ledger.markView(moduleId, viewType);
        },

        addCommand(command) {
            if (command.id && ledger.hasCommand(moduleId, command.id)) return;
            plugin.addCommand(command);
            if (command.id) ledger.markCommand(moduleId, command.id);
        },

        registerCodeBlock(language, handler) {
            if (ledger.hasCodeBlock(moduleId, language)) return;
            plugin.registerMarkdownCodeBlockProcessor(language, handler);
            ledger.markCodeBlock(moduleId, language);
        },

        registerIcon(name, svg) {
            const result = iconRegistry.add(moduleId, 'module', name, svg, {
                label: moduleId,
            });
            if (!result.ok) {
                const why =
                    result.problem.kind === 'bad-name'
                        ? `"${String(result.problem.name)}" is not a usable icon name.`
                        : describeSvgProblem(result.problem);
                console.error(`Zenith: module "${moduleId}" icon "${name}" rejected — ${why}`);
                return null;
            }
            // Reclaimed as a unit on unload, exactly like a widget: an icon left
            // behind by an uninstalled module would still show in the picker.
            ledger.addDisposer(moduleId, () => iconRegistry.removeSource(moduleId));
            return result.icon.id;
        },

        register(dispose) {
            ledger.addDisposer(moduleId, dispose);
        },

        registerTranslations(table) {
            const dispose = registerTranslations(moduleId, table);
            ledger.addDisposer(moduleId, dispose);
            return dispose;
        },

        t: (key, params) =>
            translate(resolveLocale(useZenithStore.getState().settings.language), key, params),

        get store(): typeof useZenithStore {
            if (access.apiVersion >= 2) {
                throw new Error(
                    `Zenith: module "${moduleId}" declares permissions, so it reads Zenith's data ` +
                        `through tasks, journal and content rather than the whole store.`
                );
            }
            return useZenithStore;
        },
        settings: createModuleSettings(moduleId, settingsDefaults),

        notice: (message, timeoutMs) => {
            new Notice(message, timeoutMs);
        },
    };
}
