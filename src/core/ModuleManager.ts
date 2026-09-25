import { Notice } from 'obsidian';
import type { IModule, ModuleManifest } from './IModule';
import { ModuleRegistrationLedger } from './moduleLedger';
import { registerTranslations, translateNow } from './i18n';
import { messageText, msg, type Message } from './message';

export type ModuleProblemKind = 'onload-error';

export interface ModuleProblem {
    id: string;
    kind: ModuleProblemKind;
    /** The reason, unrendered — the settings row picks the language. */
    reason: Message;
}

/**
 * ModuleManager — the registry and lifecycle for Zenith's modules.
 *
 * Every module ships inside the plugin and is registered at startup; the
 * manager switches them on and off as the user's `activeModuleIds` change,
 * without restarting Obsidian.
 */
export class ModuleManager {
    private modules: Map<string, IModule> = new Map();
    /** IDs of modules whose `onload` has run and not yet been undone. */
    private loadedIds: Set<string> = new Set();
    private loaded = false;

    private availableManifests: Map<string, ModuleManifest> = new Map();
    /** Why a module isn't running, for the settings UI to explain. */
    private problems: Map<string, ModuleProblem> = new Map();

    private readonly ledger = new ModuleRegistrationLedger();

    /**
     * Serialises the async lifecycle passes. `syncActiveModules` is fired from
     * a store subscription with `void`, so a fast double-toggle could otherwise
     * interleave two passes and leave `loadedIds` describing neither.
     */
    private queue: Promise<unknown> = Promise.resolve();

    /** Run `work` after everything already queued. */
    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const next = this.queue.then(work, work);
        this.queue = next.catch(() => undefined);
        return next;
    }

    /**
     * Record why a module is not running. The console gets English, because a
     * log someone will paste into an issue is more useful in one language.
     */
    private note(id: string, kind: ModuleProblemKind, reason: Message): void {
        this.problems.set(id, { id, kind, reason });
        console.error(`Zenith: module "${id}" — ${messageText(reason)}`);
    }

    /** Register a module instance. */
    register(module: IModule): void {
        if (this.modules.has(module.id)) {
            console.warn(`Zenith: Module "${module.id}" is already registered, skipping.`);
            return;
        }
        this.modules.set(module.id, module);
        this.availableManifests.set(module.id, module.getManifest());
        // No disposer: a module that is switched off still has a row in
        // settings, and that row is the thing its name and description are for.
        const table = module.getTranslations?.();
        if (table) registerTranslations(module.id, table);
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
     * Load a single module (idempotent). A module that throws is recorded and
     * skipped — one bad module must never stop the others from loading.
     */
    async loadModule(id: string): Promise<boolean> {
        if (this.loadedIds.has(id)) return true;

        const module = this.modules.get(id);
        if (!module) return false;

        try {
            await module.onload();
            this.loadedIds.add(id);
            this.problems.delete(id);
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

    /** A module's declarative settings, if it publishes any. */
    getSchema(id: string) {
        return this.modules.get(id)?.getSettingsSchema?.();
    }

    async unloadAll(): Promise<void> {
        const ids = Array.from(this.loadedIds).reverse();
        for (const id of ids) {
            await this.unloadModule(id);
        }
        this.modules.clear();
        this.loadedIds.clear();
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

    isLoaded(): boolean {
        return this.loaded;
    }
}
