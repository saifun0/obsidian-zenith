import { Notice } from 'obsidian';
import type { IModule, ModuleManifest } from './IModule';
import { isSafeModuleId, modulePaths, type ModulePaths } from './modulePaths';
import { vaultModuleFs, type ModuleFs } from './moduleFs';
import { createRequireShim, evaluateModule, extractModuleClass } from './moduleEval';
import { createModuleApi, type ZenithModuleApi } from './moduleApi';
import { ModuleRegistrationLedger } from './moduleLedger';
import { describeManifestProblem, validateManifest } from './moduleManifestSchema';
import {
    describeSvgProblem,
    iconId,
    iconRegistry,
    isCustomIconId,
    loadIconsFromFolder,
} from './icons';
import { clearTranslations, registerTranslations, translateNow } from './i18n';
import { messageText, msg, type Message } from './message';
import { useZenithStore } from '../store';
import type ZenithPlugin from '../main';

/**
 * Checked immediately before a third-party module's code is evaluated.
 * Returning false blocks it. Supplied by the plugin, which owns the record of
 * what the user has already approved.
 *
 * DELIBERATELY SYNCHRONOUS. An earlier version opened the consent dialog from
 * here and awaited the answer — but this runs inside the plugin's `onload`,
 * before the workspace exists, so Obsidian sat at "plugin is taking too long to
 * load" waiting for a click on a modal the user could not yet see. Nothing on
 * the startup path may wait for a human: a module that has not been approved
 * simply does not run, and asking happens later, from settings.
 */
export type ConsentGate = (id: string, code: string) => boolean;

/** Refuse to evaluate anything implausibly large — 4 MB is a runaway file. */
const MAX_MODULE_BYTES = 4 * 1024 * 1024;

export type ModuleProblemKind =
    | 'id-collision'
    | 'bad-manifest'
    | 'incompatible'
    | 'needs-consent'
    | 'eval-error'
    | 'onload-error'
    | 'blocked';

export interface ModuleProblem {
    id: string;
    kind: ModuleProblemKind;
    /** The reason, unrendered — the settings row picks the language. */
    reason: Message;
}

/**
 * ModuleManager — the registry and lifecycle for all Zenith modules.
 *
 * Third-party modules are discovered and loaded entirely through Obsidian's
 * vault adapter and `new Function`, so the feature behaves the same on desktop
 * and on iOS. It previously used Node's `fs` and `require`, which meant it
 * silently did nothing on mobile.
 */
export class ModuleManager {
    private modules: Map<string, IModule> = new Map();
    /** IDs of modules whose `onload` has run and not yet been undone. */
    private loadedIds: Set<string> = new Set();
    /** Loaded modules that Zenith did not ship. Reported once, in the summary. */
    private readonly thirdPartyIds: Set<string> = new Set();
    private loaded = false;
    private plugin!: ZenithPlugin;

    /** Discovered manifests, both built-in and third-party. */
    private availableManifests: Map<string, ModuleManifest> = new Map();
    /** Why a module isn't usable, for the settings UI to explain. */
    private problems: Map<string, ModuleProblem> = new Map();

    private fs!: ModuleFs;
    private paths: ModulePaths | null = null;
    private readonly ledger = new ModuleRegistrationLedger();
    private readonly apis = new Map<string, ZenithModuleApi>();

    /**
     * Serialises the async lifecycle passes. `syncActiveModules` is fired from
     * a store subscription with `void`, so a fast double-toggle could otherwise
     * interleave two passes and leave `loadedIds` describing neither.
     */
    private queue: Promise<unknown> = Promise.resolve();
    private consentGate: ConsentGate | null = null;

    /** Wire up the consent check. Without one, nothing extra is asked. */
    setConsentGate(gate: ConsentGate): void {
        this.consentGate = gate;
    }

    init(plugin: ZenithPlugin) {
        this.plugin = plugin;
        this.fs = vaultModuleFs(plugin.app.vault.adapter);
        this.paths = modulePaths(plugin);
    }

    /** Run `work` after everything already queued. */
    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const next = this.queue.then(work, work);
        this.queue = next.catch(() => undefined);
        return next;
    }

    /**
     * Record why a module is not usable. The console gets English, because a
     * log someone will paste into an issue is more useful in one language.
     */
    private note(id: string, kind: ModuleProblemKind, reason: Message): void {
        this.problems.set(id, { id, kind, reason });
        console.error(`Zenith: module "${id}" — ${messageText(reason)}`);
    }

    /** Register a module instance directly (used for built-in modules). */
    register(module: IModule): void {
        if (this.modules.has(module.id)) {
            console.warn(`Zenith: Module "${module.id}" is already registered, skipping.`);
            return;
        }
        this.modules.set(module.id, module);
        this.availableManifests.set(module.id, module.getManifest());
        // No disposer: a built-in that is switched off still has a row in
        // settings, and that row is the thing its name and description are for.
        const table = module.getTranslations?.();
        if (table) registerTranslations(module.id, table);
    }

    /** The Zenith API object handed to a third-party module. */
    getApi(id: string): ZenithModuleApi {
        let api = this.apis.get(id);
        if (!api) {
            api = createModuleApi(this.plugin, id, this.ledger);
            this.apis.set(id, api);
        }
        return api;
    }

    getLedger(): ModuleRegistrationLedger {
        return this.ledger;
    }

    getProblems(): ModuleProblem[] {
        return Array.from(this.problems.values());
    }

    getProblem(id: string): ModuleProblem | undefined {
        return this.problems.get(id);
    }

    /**
     * Scan the modules folder, recording manifests without instantiating
     * anything. Reading a manifest is cheap and safe; running a module's code
     * is neither, so that waits until the module is actually wanted.
     */
    async discoverModules(): Promise<void> {
        if (!this.plugin) throw new Error('ModuleManager not initialized with plugin');

        for (const module of this.modules.values()) {
            this.availableManifests.set(module.id, module.getManifest());
        }
        if (!this.paths) return;

        const builtInIds = new Set(
            Array.from(this.availableManifests.values())
                .filter((m) => m.isBuiltIn)
                .map((m) => m.id)
        );

        for (const name of await this.fs.listFolders(this.paths.root)) {
            if (!isSafeModuleId(name)) continue;

            const manifestPath = this.paths.manifest(name);
            if (!(await this.fs.exists(manifestPath))) continue;

            let raw: unknown;
            try {
                raw = JSON.parse(await this.fs.read(manifestPath));
            } catch (err) {
                this.note(name, 'bad-manifest', msg('modules.problem.badJson', { error: String(err) }));
                continue;
            }

            const checked = validateManifest(raw, {
                reservedIds: builtInIds,
                pluginVersion: this.plugin.manifest.version,
            });

            if (!checked.ok) {
                // Still listed, so the settings page can explain why a folder
                // the user can see is doing nothing.
                const kind =
                    checked.problem.kind === 'incompatible' ? 'incompatible' : 'bad-manifest';
                this.note(name, kind, describeManifestProblem(checked.problem));
                continue;
            }

            // The folder name is what the loader will read from, so a manifest
            // claiming a different id would load the wrong code.
            if (checked.manifest.id !== name) {
                this.note(
                    name,
                    'bad-manifest',
                    msg('modules.problem.idMismatch', {
                        claimed: checked.manifest.id,
                        folder: name,
                    })
                );
                continue;
            }

            this.problems.delete(name);
            // Before any of the module's code has run — which is the only way a
            // module the user has NOT enabled can name itself in their language.
            if (checked.manifest.translations) {
                registerTranslations(name, checked.manifest.translations, 'manifest');
            }
            this.availableManifests.set(name, {
                id: checked.manifest.id,
                name: checked.manifest.name,
                description: checked.manifest.description,
                icon: await this.loadModuleIcons(name, checked.manifest),
                author: checked.manifest.author,
                version: checked.manifest.version,
                isBuiltIn: false,
            });
        }

        iconRegistry.emit();
    }

    /**
     * Register a module's bundled artwork and resolve what its manifest `icon`
     * should point at.
     *
     * Done at discovery, not at load: the settings list shows every module it
     * found, enabled or not, and a module the user hasn't switched on yet still
     * needs its logo to appear next to the toggle.
     *
     * The lookup order exists so the simple case needs no manifest field at all
     * — drop `icon.svg` beside `main.js` and it is picked up. An author with
     * several glyphs uses an `icons/` folder and names one in the manifest.
     */
    private async loadModuleIcons(
        id: string,
        manifest: { icon?: string; name: string; author?: string }
    ): Promise<string | undefined> {
        if (!this.paths) return manifest.icon;

        const dir = this.paths.dir(id);
        const declared = manifest.icon?.trim();

        // Already a custom id: the author registered it themselves, or is
        // pointing at another pack. Nothing to resolve.
        if (isCustomIconId(declared)) return declared;

        const label = manifest.name || id;
        let registered = false;

        // A single `icon.svg` becomes `zi:<id>/icon`.
        const single = `${dir}/icon.svg`;
        if (await this.fs.exists(single)) {
            try {
                const result = iconRegistry.add(id, 'module', 'icon', await this.fs.read(single), {
                    label,
                    author: manifest.author,
                    silent: true,
                });
                if (result.ok) registered = true;
                // `bad-name` is unreachable here — the name is the literal "icon".
                else if (result.problem.kind !== 'bad-name') {
                    this.note(
                        id,
                        'bad-manifest',
                        msg('modules.problem.badIcon', {
                            reason: describeSvgProblem(result.problem),
                        })
                    );
                }
            } catch {
                // A module without a readable logo is still a working module.
            }
        }

        const folder = `${dir}/icons`;
        if (await this.fs.exists(folder)) {
            const report = await loadIconsFromFolder(this.fs, folder, iconRegistry, id, 'module', {
                label,
                author: manifest.author,
            });
            if (report.loaded > 0) registered = true;
            for (const skip of report.skipped) {
                this.note(
                    id,
                    'bad-manifest',
                    msg('modules.problem.badIconNamed', { file: skip.file, reason: skip.reason })
                );
            }
        }

        if (!registered) return declared;

        // `icon: "icon.svg"` and a bare `icon` both mean the bundled artwork.
        const named = declared?.replace(/\.svg$/i, '');
        if (named && iconRegistry.has(iconId(id, named))) return iconId(id, named);
        if (!declared && iconRegistry.has(iconId(id, 'icon'))) return iconId(id, 'icon');

        return declared;
    }

    /**
     * Ensure an instance exists, evaluating the module's source on first use.
     * Async because reading through the vault adapter is.
     */
    private async ensureInstance(id: string): Promise<IModule | undefined> {
        const existing = this.modules.get(id);
        if (existing) return existing;

        const manifest = this.availableManifests.get(id);
        if (!manifest || manifest.isBuiltIn || !this.paths) return undefined;

        // The master switch. Discovery still lists modules when it is off, so
        // the user can see what is there before deciding to run any of it.
        if (!useZenithStore.getState().settings.allowThirdPartyModules) {
            this.note(id, 'blocked', msg('modules.problem.blocked'));
            return undefined;
        }

        const problem = this.problems.get(id);
        if (problem && (problem.kind === 'incompatible' || problem.kind === 'id-collision')) {
            return undefined;
        }

        const mainPath = this.paths.main(id);
        if (!(await this.fs.exists(mainPath))) {
            this.note(id, 'eval-error', msg('modules.problem.noMain'));
            return undefined;
        }

        try {
            const code = await this.fs.read(mainPath);
            if (code.length > MAX_MODULE_BYTES) {
                throw new Error(
                    messageText(msg('modules.problem.tooBig', { kb: Math.round(code.length / 1024) }))
                );
            }

            // Last gate before someone else's code runs. Catches a module whose
            // file no longer matches what was installed — edited by hand, or
            // changed by vault sync from another device.
            if (this.consentGate && !this.consentGate(id, code)) {
                this.note(id, 'needs-consent', msg('modules.needsConsent'));
                return undefined;
            }

            const { exports } = evaluateModule(code, {
                sourceName: id,
                require: createRequireShim(this.getApi(id)),
            });
            const ModuleClass = extractModuleClass(exports);
            if (typeof ModuleClass !== 'function') {
                throw new Error(messageText(msg('modules.problem.noClass')));
            }

            const instance = new (ModuleClass as new (plugin: ZenithPlugin) => IModule)(this.plugin);
            if (instance.id !== id) {
                throw new Error(
                    messageText(
                        msg('modules.problem.classIdMismatch', { claimed: instance.id, folder: id })
                    )
                );
            }

            await this.injectStyles(id);
            // Through the ledger, so unloading the module takes its strings with
            // it. What the manifest declared survives — that channel is keyed
            // separately and is what the settings row falls back to.
            const table = instance.getTranslations?.();
            if (table) this.ledger.addDisposer(id, registerTranslations(id, table));
            this.modules.set(id, instance);
            this.problems.delete(id);
            // Remembered rather than announced. Which modules came from outside
            // the plugin is worth knowing when something misbehaves, but it is
            // one fact about the whole load, not a line each.
            this.thirdPartyIds.add(id);
            return instance;
        } catch (err) {
            this.note(
                id,
                'eval-error',
                msg('modules.problem.evalError', {
                    error: err instanceof Error ? err.message : String(err),
                })
            );
            return undefined;
        }
    }

    /** Apply a module's optional `styles.css`, removed again on unload. */
    private async injectStyles(id: string): Promise<void> {
        if (!this.paths) return;
        const stylesPath = this.paths.styles(id);
        if (!(await this.fs.exists(stylesPath))) return;

        const el = document.createElement('style');
        el.setAttribute('data-zenith-module', id);
        el.textContent = await this.fs.read(stylesPath);
        document.head.appendChild(el);
        this.ledger.addDisposer(id, () => el.remove());
    }

    /**
     * Load a single module (idempotent). A module that throws is recorded and
     * skipped — one bad module must never stop the others from loading.
     */
    async loadModule(id: string): Promise<boolean> {
        if (this.loadedIds.has(id)) return true;

        const module = await this.ensureInstance(id);
        if (!module) return false;

        try {
            await module.onload();
            this.loadedIds.add(id);
            return true;
        } catch (error) {
            this.note(
                id,
                'onload-error',
                msg('modules.problem.onloadError', {
                    error: error instanceof Error ? error.message : String(error),
                })
            );
            // Reclaim whatever it managed to register before failing.
            try {
                await module.onunload();
            } catch {
                /* it already failed once; nothing more to do */
            }
            this.ledger.disposeAll(id);
            new Notice(translateNow('modules.startFailed', { id }));
            // Deliberately left in `activeModuleIds`: switching it off would
            // discard the user's intent over what may be a transient failure.
            return false;
        }
    }

    /** Unload a single module (idempotent). */
    async unloadModule(id: string): Promise<void> {
        if (!this.loadedIds.has(id)) return;

        const module = this.modules.get(id);
        if (module) {
            try {
                await module.onunload();
            } catch (error) {
                console.error(`Zenith: Failed to unload module "${id}":`, error);
            }
        }
        this.ledger.disposeAll(id);
        this.loadedIds.delete(id);
    }

    /** Load all modules marked active in settings. */
    async loadAll(activeModuleIds: string[]): Promise<void> {
        return this.enqueue(async () => {
            for (const id of activeModuleIds) {
                await this.loadModule(id);
            }
            this.loaded = true;
        });
    }

    /**
     * Reconcile loaded modules with the desired active set, so modules can be
     * toggled from settings without restarting Obsidian.
     */
    async syncActive(activeModuleIds: string[]): Promise<void> {
        return this.enqueue(async () => {
            const desired = new Set(activeModuleIds);
            for (const id of Array.from(this.loadedIds)) {
                if (!desired.has(id)) await this.unloadModule(id);
            }
            for (const id of activeModuleIds) {
                if (!this.loadedIds.has(id)) await this.loadModule(id);
            }
        });
    }

    /**
     * Re-read a module from disk and restart it.
     *
     * `require` cached by path, so replacing a module's file used to need an
     * Obsidian restart. Evaluating the text each time removes that — which is
     * what makes "Reinstall" and "Update" useful rather than misleading.
     */
    async refreshModule(id: string): Promise<void> {
        return this.enqueue(async () => {
            const wasLoaded = this.loadedIds.has(id);
            await this.unloadModule(id);
            // Drop the stale instance; the ledger KEEPS its view/command marks,
            // because those registrations belong to Obsidian and outlive us.
            this.modules.delete(id);
            this.apis.delete(id);
            await this.discoverModules();
            if (wasLoaded) await this.loadModule(id);
        });
    }

    /** Unload and forget a module completely (uninstall). */
    async removeModule(id: string): Promise<void> {
        return this.enqueue(async () => {
            await this.unloadModule(id);
            this.modules.delete(id);
            this.apis.delete(id);
            this.availableManifests.delete(id);
            this.problems.delete(id);
            this.ledger.forget(id);
            clearTranslations(id);
            // Icons registered at DISCOVERY have no ledger disposer — nothing
            // was loaded, so nothing ran. Uninstall is what retires them, or a
            // removed module's logo would keep showing in the icon picker.
            iconRegistry.removeSource(id);
        });
    }

    /** A module's declarative settings, if it publishes any. */
    async getSchema(id: string) {
        const instance = this.modules.get(id) ?? (await this.ensureInstance(id));
        return instance?.getSettingsSchema?.();
    }

    async unloadAll(): Promise<void> {
        const ids = Array.from(this.loadedIds).reverse();
        for (const id of ids) {
            await this.unloadModule(id);
        }
        this.modules.clear();
        this.loadedIds.clear();
        this.apis.clear();
        this.loaded = false;
    }

    get(id: string): IModule | undefined {
        return this.modules.get(id);
    }

    getAll(): IModule[] {
        return Array.from(this.modules.values());
    }

    getAvailableManifests(): ModuleManifest[] {
        return Array.from(this.availableManifests.values());
    }

    /** IDs of modules that have run `onload` and are currently active. */
    getLoadedModuleIds(): string[] {
        return Array.from(this.loadedIds);
    }

    /**
     * IDs of the loaded modules that came from outside the plugin.
     *
     * Reported once, in the load summary. When something is behaving strangely
     * the first useful question is whether a module Zenith did not write is
     * involved, and this is the cheapest possible way to have that answer
     * already on screen.
     */
    getThirdPartyModuleIds(): string[] {
        return Array.from(this.thirdPartyIds).filter((id) => this.loadedIds.has(id));
    }

    isLoaded(): boolean {
        return this.loaded;
    }
}
