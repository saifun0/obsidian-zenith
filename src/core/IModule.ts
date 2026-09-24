import type { Command, MarkdownPostProcessorContext, ViewCreator } from 'obsidian';
import type { SettingsSchema } from '../settings/schema/types';
import type { TranslationTable } from './i18n';
import type ZenithPlugin from '../main';

export interface ModuleManifest {
    id: string;
    name: string;
    description: string;
    icon?: string;
    author?: string;
    version?: string;
    isBuiltIn: boolean;
    /** A third-party module's declared permissions. */
    permissions?: string[];
    /** The module API it is written against — see `moduleApi`. */
    apiVersion?: number;
}

/**
 * IModule — strict contract for all Zenith modules.
 * 
 * Each module encapsulates a feature area (Dashboard, Tasks, Content)
 * with its own lifecycle, views, and commands.
 */
export interface IModule {
    /** Unique identifier (e.g., "dashboard", "tasks", "content") */
    readonly id: string;

    /** Human-readable display name */
    readonly name: string;

    /** Brief description of what the module does */
    readonly description: string;

    /** Lucide icon name for ribbon/tab (e.g., "layout-dashboard") */
    readonly icon: string;

    /** Returns the manifest for the UI and discovery */
    getManifest(): ModuleManifest;

    /**
     * Called when the module is loaded.
     * Register views, commands, and event handlers here.
     */
    onload(): Promise<void>;

    /**
     * Called when the module is unloaded.
     * Clean up views, event handlers, and resources.
     */
    onunload(): Promise<void>;

    /**
     * Open or focus the module's primary view.
     */
    activateView(): Promise<void>;

    /**
     * Declarative settings, rendered by `<SettingsForm>`. Optional — a module
     * with nothing to configure simply omits it.
     *
     * This is what lets a third-party module have a settings page at all: the
     * old design chose the page from a hardcoded `switch` in `SettingsApp`, so
     * there was nowhere for one to appear. Declaring it here rather than in a
     * central registry also means the schema is deleted along with the module.
     *
     * Called lazily, when the user opens this module's settings — which means a
     * module can be CONSTRUCTED without ever being loaded. Constructors must
     * therefore stay side-effect free: assign fields, register nothing.
     */
    getSettingsSchema?(): SettingsSchema;

    /**
     * Strings this module contributes to the dictionary, keyed by locale.
     *
     * Declared here rather than added to Zenith's own dictionary so that a
     * module's translations are deleted along with the module, and so that a
     * third-party one can be translated at all — there is no file in this repo
     * for its strings to live in.
     *
     * Keys must sit under the module's own namespace: `<id>.…` or
     * `module.<id>.…`. Anything else is dropped, because a module that could
     * redefine `settings.title` could also redefine the sentence warning the
     * user about third-party modules.
     *
     * Two keys are looked up by convention wherever a module is listed:
     * `module.<id>.name` and `module.<id>.desc`. Without them the list falls
     * back to the untranslated `name` and `description`.
     */
    getTranslations?(): TranslationTable;
}

/**
 * Abstract base for modules that need the plugin instance.
 * Provides common patterns for view registration and activation.
 */
export abstract class BaseModule implements IModule {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly icon: string;

    constructor(protected readonly plugin: ZenithPlugin) {}

    /**
     * Obsidian's `registerView` throws if a view type is registered twice, and
     * views, commands and code blocks are all plugin-scoped — they are only
     * released when the whole plugin unloads. So each is registered once and
     * skipped on subsequent loads, which is what makes toggling a module safe.
     *
     * The bookkeeping lives in the manager's ledger, keyed by module ID, rather
     * than on the instance: re-evaluating a third-party module's source creates
     * a NEW instance, and per-instance state would forget everything and throw
     * on the second registration.
     */
    private get ledger() {
        return this.plugin.moduleManager.getLedger();
    }

    getManifest(): ModuleManifest {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            icon: this.icon,
            isBuiltIn: true
        };
    }

    abstract onload(): Promise<void>;
    abstract onunload(): Promise<void>;
    abstract activateView(): Promise<void>;

    /**
     * Register the module's ItemView, idempotently. Safe to call on every
     * `onload` — the view type is registered with Obsidian only once.
     */
    protected registerView(viewType: string, creator: ViewCreator): void {
        if (this.ledger.hasView(this.id, viewType)) return;
        this.plugin.registerView(viewType, creator);
        this.ledger.markView(this.id, viewType);
    }

    /**
     * Add a command, idempotently. Safe to call on every `onload`.
     */
    protected addCommand(command: Command): void {
        if (command.id && this.ledger.hasCommand(this.id, command.id)) return;
        this.plugin.addCommand(command);
        if (command.id) this.ledger.markCommand(this.id, command.id);
    }

    /**
     * Add the command that opens the module's view. The same as `addCommand`,
     * except that Search leaves it out: it lists the view already.
     */
    protected addViewCommand(command: Command): void {
        this.addCommand(command);
        if (command.id) this.ledger.markViewCommand(this.id, command.id);
    }

    /**
     * Register a Markdown code-block renderer, idempotently.
     *
     * Obsidian throws when a language is registered twice and, like views and
     * commands, the registration is plugin-scoped — it only goes away when the
     * whole plugin unloads. Registering once per module instance is what makes
     * disable → enable safe.
     */
    protected registerCodeBlock(
        language: string,
        handler: (
            source: string,
            el: HTMLElement,
            ctx: MarkdownPostProcessorContext
        ) => void | Promise<void>
    ): void {
        if (this.ledger.hasCodeBlock(this.id, language)) return;
        this.plugin.registerMarkdownCodeBlockProcessor(language, handler);
        this.ledger.markCodeBlock(this.id, language);
    }

    /**
     * Helper: activate a view of the given type in a new tab.
     * Reuses existing leaf if already open.
     */
    protected async openView(viewType: string): Promise<void> {
        const { workspace } = this.plugin.app;

        const existing = workspace.getLeavesOfType(viewType);
        if (existing.length > 0) {
            await workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = workspace.getLeaf('tab');
        await leaf.setViewState({ type: viewType, active: true });
        await workspace.revealLeaf(leaf);
    }
}
