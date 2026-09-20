import { Plugin, Notice, debounce } from 'obsidian';
import { ModuleManager } from './core/ModuleManager';
import { ModuleInstaller } from './core/moduleInstaller';
import { MobileCheckModal } from './core/MobileCheckModal';
import { DataService } from './core/DataService';
import { FolderIconService } from './core/FolderIconService';
import { iconPackPaths } from './core/modulePaths';
import { vaultModuleFs } from './core/moduleFs';
import { iconRegistry, loadIconPacks, type IconPackReport } from './core/icons';
import { DashboardModule } from './modules/dashboard/DashboardModule';
import { NavigatorModule } from './modules/navigator/NavigatorModule';
import { PictureModule } from './modules/picture/PictureModule';
import { WeatherModule } from './modules/weather/WeatherModule';
import { TasksModule } from './modules/tasks/TasksModule';
import { TasksCalendarModule } from './modules/tasks-calendar/TasksCalendarModule';
import { ContentModule } from './modules/content/ContentModule';
import { ProjectsModule } from './modules/projects/ProjectsModule';
import { JournalModule } from './modules/journal/JournalModule';
import { PrayerModule } from './modules/prayer/PrayerModule';
import { MediaModule } from './modules/media/MediaModule';
import { SyncModule } from './modules/sync/SyncModule';
import { useZenithStore, resetZenithStore } from './store';
import type { ZenithSettings } from './store';
import type { SettingsSyncService } from './modules/sync/services/settingsSync';
import type { FileSyncService } from './modules/sync/services/fileSync';
import type { FileSyncAuto } from './modules/sync/services/fileSyncAuto';
import { PendingAuthStore } from './modules/sync/services/remotes/oauthPending';
import { ZenithSettingTab } from './settings/ZenithSettingTab';
import { registerQuickAddTaskCommand } from './modules/tasks/commands';
import { dashboardWidgets, type DashboardWidgetDefinition } from './modules/dashboard/widgets';
import { navActions, type NavActionDefinition } from './modules/navigator/navigation';
import { translateNow } from './core/i18n';
import { moduleNameNow } from './core/moduleLabels';

/**
 * ZenithPlugin — Main entry point.
 *
 * Orchestrates module lifecycle via ModuleManager.
 * Each module registers its own views, commands, and event handlers.
 */
export default class ZenithPlugin extends Plugin {
    moduleManager: ModuleManager = new ModuleManager();

    /** Keeps the store in sync with the vault. Created on load. */
    dataService!: DataService;

    /** Decorates the file explorer with user-assigned folder/file icons. */
    folderIconService!: FolderIconService;

    /** Installs, updates and removes third-party modules. Created on load. */
    moduleInstaller!: ModuleInstaller;

    /** What each icon pack contributed, and what it couldn't. For settings. */
    iconPackReports: IconPackReport[] = [];

    /**
     * Cross-device settings merge. Owned by `SyncModule` — null whenever that
     * module is switched off, which is why every caller checks.
     */
    settingsSync: SettingsSyncService | null = null;

    /**
     * The file engine. Also owned by `SyncModule`, and null while that module
     * is off. It plans and applies; it has no opinion about when, which is
     * what keeps a run reproducible and testable.
     */
    fileSync: FileSyncService | null = null;

    /**
     * What decides when the file engine runs.
     *
     * Separated from the engine so that "should this happen now" and "what
     * exactly would happen" stay two questions with two answers. Null while
     * the sync module is off.
     */
    fileSyncAuto: FileSyncAuto | null = null;

    /**
     * The authorization the user is part-way through, if any.
     *
     * Lives on the plugin rather than in the settings pane because that is not
     * where it finishes: the browser hands the code back through the
     * `obsidian://` handler, and by then the pane that started the flow may be
     * closed. Unconditional and lifecycle-free — it holds nothing until asked
     * to, so there is nothing to start or stop.
     */
    readonly oauthPending = new PendingAuthStore();

    /** Disposers for store subscriptions — cleaned up on unload. */
    private disposers: Array<() => void> = [];

    /**
     * In-memory copy of the persisted plugin data. We mutate this and save it
     * with a debounce, so rapid settings changes (e.g. typing a folder path)
     * don't kick off overlapping read-modify-write cycles.
     */
    private pluginData: Record<string, unknown> = {};

    /**
     * Debounced writer for `pluginData` — trailing debounce, so a burst of
     * changes (e.g. typing a folder path) collapses into one write ~500 ms
     * after the last change. `.cancel()`-able + flushed on unload.
     */
    private persistData = debounce(
        () => {
            void this.saveData(this.pluginData);
        },
        500,
        true
    );

    /** Injected <style> that carries the user's custom accent color. */
    private accentStyleEl: HTMLStyleElement | null = null;

    /** Apply (or clear) the custom accent color across Zenith views. */
    private applyAccent(color: string): void {
        if (!this.accentStyleEl) return;
        const c = color.trim();
        this.accentStyleEl.textContent = c
            ? `.zenith-root { --zenith-accent: ${c}; --zenith-accent-hover: ${c}; }`
            : '';
    }

    /**
     * Publish appearance settings as classes on `<body>`.
     *
     * `.zenith-root` is created per view, and there are several of them; the
     * body is the one element every Zenith surface — including portalled
     * dialogs — sits inside.
     */
    private applyAppearance(): void {
        const { uiDensity, uiAnimations } = useZenithStore.getState().settings;
        const body = document.body;
        for (const density of ['compact', 'comfortable', 'spacious']) {
            body.toggleClass(`zenith-density-${density}`, uiDensity === density);
        }
        body.toggleClass('zenith-no-motion', !uiAnimations);
    }

    async onload(): Promise<void> {
        const startedAt = Date.now();

        // The store is a module-level singleton that outlives the plugin, so a
        // re-enable would otherwise start on whatever the last instance left
        // in it. Cleaned here rather than on the way out: unload cannot own
        // this ordering, because Obsidian does not await it — see `onunload`.
        resetZenithStore();

        // ── Restore persisted settings ───────────────
        this.pluginData = (await this.loadData()) ?? {};
        if (this.pluginData.settings) {
            useZenithStore
                .getState()
                .loadSettings(this.pluginData.settings as Partial<ZenithSettings>);
        }

        // ── Register built-in modules ───────────────
        this.moduleManager.init(this);
        this.moduleManager.register(new DashboardModule(this));
        this.moduleManager.register(new NavigatorModule(this));
        this.moduleManager.register(new PictureModule(this));
        this.moduleManager.register(new WeatherModule(this));
        this.moduleManager.register(new TasksModule(this));
        this.moduleManager.register(new TasksCalendarModule(this));
        this.moduleManager.register(new ContentModule(this));
        this.moduleManager.register(new ProjectsModule(this));
        this.moduleManager.register(new JournalModule(this));
        this.moduleManager.register(new PrayerModule(this));
        this.moduleManager.register(new MediaModule(this));
        this.moduleManager.register(new SyncModule(this));

        // Only run code the user has already approved, and decide that without
        // asking anything: this runs during `onload`, where a dialog would
        // stall Obsidian's whole startup. An unapproved module is recorded as
        // needing consent and left alone; the settings page offers the button.
        this.moduleInstaller = new ModuleInstaller(this);
        this.moduleManager.setConsentGate((id, code) => this.moduleInstaller.isApproved(id, code));

        // ── Icon packs ────────────────────────────────
        // Before module discovery, which registers each module's own artwork
        // into the same registry and needs the packs already present to resolve
        // a manifest that points at one.
        await this.loadIconPacks();

        // ── Discover third-party modules ──────────────
        await this.moduleManager.discoverModules();

        // Sync available modules with the store so UI can render them
        useZenithStore.getState().setAvailableModules(this.moduleManager.getAvailableManifests());

        // ── Load all active modules (registers views & commands) ──
        const activeIds = useZenithStore.getState().settings.activeModuleIds;
        await this.moduleManager.loadAll(activeIds);
        useZenithStore.getState().setLoadedModules(this.moduleManager.getLoadedModuleIds());

        // ── Settings Tab ─────────────────────────────
        this.addSettingTab(new ZenithSettingTab(this.app, this));

        // ── Global commands (available regardless of active view) ──
        registerQuickAddTaskCommand(this);

        // Temporary: answers whether this device allows the runtime evaluation
        // third-party modules need. iOS has no console to check that from.
        // Remove once the mobile module loader has shipped and been verified.
        this.addCommand({
            id: 'zenith-device-check',
            name: 'Check device capabilities (modules)',
            callback: () => new MobileCheckModal(this.app, this).open(),
        });

        // ── Reactive vault ↔ store sync ──────────────
        this.dataService = new DataService(this);
        this.dataService.start();

        // ── File-explorer folder/file icons ──────────
        this.folderIconService = new FolderIconService(this);
        this.folderIconService.start();

        // ── Custom accent color ──────────────────────
        this.accentStyleEl = document.createElement('style');
        document.head.appendChild(this.accentStyleEl);
        this.register(() => this.accentStyleEl?.remove());
        this.applyAccent(useZenithStore.getState().settings.accentColor);
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings.accentColor,
                (color) => this.applyAccent(color)
            )
        );

        // ── Density / motion ─────────────────────────
        this.applyAppearance();
        this.register(() => {
            document.body.removeClasses([
                'zenith-density-compact',
                'zenith-density-comfortable',
                'zenith-density-spacious',
                'zenith-no-motion',
            ]);
        });
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => `${state.settings.uiDensity}|${state.settings.uiAnimations}`,
                () => this.applyAppearance()
            )
        );

        // ── Ribbon icon → opens default (or first active) module ──
        this.addRibbonIcon('brain', 'Zenith', () => this.openDefaultModule());

        // ── Persist settings on change (debounced, in-memory) ──
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings,
                (settings) => {
                    this.pluginData.settings = settings;
                    this.persistData();
                }
            )
        );

        // ── React to module enable/disable without an Obsidian restart ──
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings.activeModuleIds,
                (activeIds) => {
                    void this.syncActiveModules(activeIds);
                }
            )
        );

        // Flipping the third-party master switch has to act immediately:
        // turning it on should start the modules that were listed but blocked,
        // and turning it off should stop them — not wait for a restart.
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings.allowThirdPartyModules,
                (allowed) => {
                    const state = useZenithStore.getState();
                    if (allowed) {
                        void this.syncActiveModules(state.settings.activeModuleIds);
                        return;
                    }
                    // Stop every third-party module, leaving the built-ins and
                    // the user's `activeModuleIds` choices untouched.
                    const builtIn = new Set(
                        state.availableModules.filter((m) => m.isBuiltIn).map((m) => m.id)
                    );
                    void this.syncActiveModules(
                        state.settings.activeModuleIds.filter((id) => builtIn.has(id))
                    );
                }
            )
        );

        // ── Re-parse when the watched folder paths change ──
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings.tasksFolderPath,
                () => {
                    void this.dataService.reloadTasks();
                }
            )
        );
        this.disposers.push(
            useZenithStore.subscribe(
                (state) => state.settings.contentFolderPath,
                () => {
                    void this.dataService.reloadContent();
                }
            )
        );
        // The journal folder and its filename pattern both decide which files
        // are daily notes at all — and daily notes are a task source too, so a
        // change to either re-parses both collections.
        this.disposers.push(
            useZenithStore.subscribe(
                (state) =>
                    `${state.settings.journalFolderPath}\0${state.settings.journalDateFormat}`,
                () => {
                    void this.dataService.reloadJournal();
                    void this.dataService.reloadTasks();
                }
            )
        );

        // One line, not fifteen.
        //
        // Every module used to announce itself, which on a full vault buried
        // the warnings underneath — and the warnings are the only part of a
        // successful load worth reading. What is actually useful about a load
        // is that it finished, how long it took, and whether anything Zenith
        // did not write is in the mix; all three fit on one line.
        const modules = this.moduleManager.getLoadedModuleIds().length;
        const outside = this.moduleManager.getThirdPartyModuleIds();
        const from =
            outside.length > 0 ? `, ${outside.length} third-party: ${outside.join(', ')}` : '';
        console.log(
            `Zenith ${this.manifest.version}: ready in ${Date.now() - startedAt} ms (${modules} modules${from})`
        );
    }

    /**
     * Teardown, synchronously — because that is the only kind Obsidian runs.
     *
     * `Plugin.onunload()` is declared `void` in the API and is not awaited, so
     * anything written after an `await` in here does not run during unload at
     * all: it resumes whenever the event loop gets round to it, which on a
     * disable-then-enable is after the NEXT instance has already called
     * `onload()` and filled the store.
     *
     * This method used to be `async` and to end by resetting that store. The
     * sequence that produced was: save starts and yields, the new instance
     * loads and restores the user's settings, the old continuation wakes up
     * and resets the store to defaults, and the new instance's own settings
     * subscriber — now live — sees that change and writes the defaults to
     * `data.json`. Cleaning the slate moved to the top of `onload`, which can
     * own the ordering because it is the one Obsidian waits for.
     */
    onunload(): void {
        // Stop listening BEFORE tearing down so late store writes don't persist.
        this.disposers.forEach((d) => d());
        this.disposers = [];

        // Started rather than awaited: the data is already assembled, and the
        // write either lands or the process is going away regardless.
        this.persistData.cancel();
        void this.saveData(this.pluginData);

        // Nothing below depends on this finishing any more, which is what
        // makes it safe to let go of.
        void this.moduleManager.unloadAll();
    }

    /**
     * Open the configured default module. Falls back to the first loaded module
     * (with a Notice) when the default is disabled, so the ribbon click never
     * silently does nothing.
     */
    private openDefaultModule(): void {
        const { defaultModuleId } = useZenithStore.getState().settings;
        const loadedIds = this.moduleManager.getLoadedModuleIds();

        let target = loadedIds.includes(defaultModuleId)
            ? this.moduleManager.get(defaultModuleId)
            : undefined;

        if (!target) {
            const fallbackId = loadedIds[0];
            target = fallbackId ? this.moduleManager.get(fallbackId) : undefined;
            if (target) {
                new Notice(
                    translateNow('notice.defaultModuleInactive', {
                        id: defaultModuleId,
                        name: moduleNameNow(target),
                    })
                );
            }
        }

        if (target) {
            void target.activateView();
        } else {
            new Notice('Zenith: no active modules to open. Enable one in settings.');
        }
    }

    /**
     * Load/unload modules to match `activeIds` (called when settings change).
     * Keeps the store's `loadedModuleIds` in sync with reality.
     */
    /**
     * Re-read the modules folder and publish what changed to the store.
     *
     * `setAvailableModules` used to be called once during `onload`, which was
     * fine when the only way to add a module was to restart Obsidian. Now that
     * modules can be installed, updated and removed from settings, anything
     * that changes the set has to push it again or the list silently lies.
     */
    async refreshAvailableModules(): Promise<void> {
        await this.moduleManager.discoverModules();
        useZenithStore.getState().setAvailableModules(this.moduleManager.getAvailableManifests());
    }

    /**
     * Read `<plugin>/icons/*` into the icon registry.
     *
     * Failures are per-file and reported on the settings page rather than
     * thrown: one malformed `.svg` in a downloaded pack must not be able to stop
     * the plugin from starting.
     */
    async loadIconPacks(): Promise<void> {
        const paths = iconPackPaths(this);
        if (!paths) return;
        try {
            this.iconPackReports = await loadIconPacks(
                vaultModuleFs(this.app.vault.adapter),
                paths.root,
                iconRegistry
            );
        } catch (err) {
            console.error('Zenith: failed to read icon packs', err);
            this.iconPackReports = [];
        }
    }

    private async syncActiveModules(activeIds: string[]): Promise<void> {
        await this.moduleManager.syncActive(activeIds);
        useZenithStore.getState().setLoadedModules(this.moduleManager.getLoadedModuleIds());
        // Which folders are scanned for tasks depends on the journal module
        // being active (daily notes hold captured tasks), so toggling modules
        // has to re-derive the task list — otherwise tasks from daily notes
        // linger after the journal is switched off, or stay missing after it's
        // switched on, until something else happens to trigger a reload.
        void this.dataService?.reloadTasks();
    }

    /**
     * Register a widget on the dashboard. Any module (built-in or third-party)
     * can call this from its `onload()`. Returns a disposer that should be
     * called from the module's `onunload()`.
     */
    registerDashboardWidget(def: DashboardWidgetDefinition): () => void {
        return dashboardWidgets.register(def);
    }

    /**
     * Add a button to the navigation launcher (see `navigation.ts`). Called
     * from a module's `onload()`, disposed from its `onunload()` — the same
     * contract as `registerDashboardWidget`.
     *
     * Kept independent of the navigator module being active: a module should
     * not have to check whether the launcher is switched on before offering a
     * way into its view.
     */
    registerNavAction(def: NavActionDefinition): () => void {
        return navActions.register(def);
    }
}
