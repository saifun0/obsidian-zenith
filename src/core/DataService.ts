import { TAbstractFile, TFile, debounce } from 'obsidian';
import { useZenithStore } from '../store';
import { TaskParser } from '../modules/tasks/services/taskParser';
import { ContentParser } from '../modules/content/services/contentParser';
import { JournalParser } from '../modules/journal/services/journalParser';
import { ProjectParser } from '../modules/projects/services/projectParser';
import { buildDateMatcher } from '../modules/journal/services/journalDates';
import type { ZenithSettings } from '../store/settingsSlice';
import type ZenithPlugin from '../main';

type Debounced = ReturnType<typeof debounce>;

/**
 * Whether anything that's switched on cares about daily notes.
 *
 * The journal is the obvious one; the prayer tracker keeps its record in the
 * same notes' frontmatter, so with only it enabled an edit still has to reach
 * the store. Gating on the journal alone meant a prayer marked from the
 * dashboard sat invisible until something forced a full re-parse.
 */
function watchesDailyNotes(settings: ZenithSettings): boolean {
    const { activeModuleIds } = settings;
    return activeModuleIds.includes('journal') || activeModuleIds.includes('prayer');
}

/**
 * DataService — the single source of truth that keeps the Zustand store in sync
 * with the vault.
 *
 * Previously each view parsed the folders on mount / on a Refresh click, so
 * edits made to the `.md` files outside the plugin were invisible until a
 * manual refresh, and a Task's cached `lineNumber` could drift — meaning a
 * toggle wrote to the wrong line. This service instead watches the vault
 * (`modify`/`create`/`delete`/`rename`) for the configured task & content
 * folders and re-parses whenever something relevant changes. All components
 * then simply read the store; the Refresh buttons become an explicit
 * force-reload.
 *
 * Vault events are handled **incrementally**: a change re-reads only the file
 * that changed and swaps that file's items in the store. Re-reading the whole
 * folder each time is fine for a handful of notes and quietly quadratic as a
 * vault grows — every "+1" on a progress bar would re-parse the entire library.
 * The full parse is kept for the initial load, the Refresh buttons, and folder
 * path changes.
 */
export class DataService {
    private readonly taskParser: TaskParser;
    private readonly contentParser: ContentParser;
    private readonly journalParser: JournalParser;
    private readonly projectParser: ProjectParser;

    /** Paths touched since the last flush, per collection. */
    private readonly dirtyTasks = new Set<string>();
    private readonly dirtyContent = new Set<string>();
    private readonly dirtyJournal = new Set<string>();
    private readonly dirtyProjects = new Set<string>();
    private readonly flushDebounced: Debounced;

    constructor(private readonly plugin: ZenithPlugin) {
        this.taskParser = new TaskParser(plugin.app);
        this.contentParser = new ContentParser(plugin.app);
        this.journalParser = new JournalParser(plugin.app);
        this.projectParser = new ProjectParser(plugin.app);
        // Short window: this only coalesces the burst of events a single save
        // produces, not the user's typing — the work behind it is now one file.
        this.flushDebounced = debounce(() => void this.flushDirty(), 150, false);
    }

    /** Register vault listeners and do the initial parse. */
    start(): void {
        const { vault, metadataCache } = this.plugin.app;

        // registerEvent ties the listener to the plugin lifecycle (auto-removed
        // on plugin unload), so we never leak vault subscriptions.
        this.plugin.registerEvent(vault.on('create', (f) => this.onChange(f)));
        this.plugin.registerEvent(vault.on('delete', (f) => this.onChange(f)));
        this.plugin.registerEvent(
            vault.on('rename', (f, oldPath) => this.onChange(f, oldPath))
        );

        // Content changes are taken from the metadata cache's own event, NOT
        // from `vault.on('modify')`.
        //
        // `modify` fires as soon as the bytes land, before Obsidian re-indexes
        // the file — so a parse triggered by it reads the new text against the
        // old `listItems` cache. That mismatch is not theoretical: it is what
        // made a just-added task fail to appear, and a just-deleted one leave a
        // blank row behind (its cached line no longer existed in the file).
        // `changed` fires after the re-index, so text and cache agree.
        this.plugin.registerEvent(metadataCache.on('changed', (f) => this.onChange(f)));

        // The first parse waits for the workspace.
        //
        // A plugin's `onload` runs before Obsidian has finished indexing the
        // vault, so `getAbstractFileByPath` answers null for folders that are
        // sitting right there — and the parse then reports a perfectly good
        // journal folder as missing and reads nothing out of it. Waiting costs
        // nothing: `onLayoutReady` fires immediately when the layout is already
        // up, which is the case whenever a module is switched on by hand.
        //
        // The listeners above are registered straight away regardless, so a
        // change arriving during startup is still noticed.
        this.plugin.app.workspace.onLayoutReady(() => void this.reloadAll());
    }

    /** Force a full reload of every collection (used by Refresh buttons). */
    async reloadAll(): Promise<void> {
        await Promise.all([this.reloadTasks(), this.reloadContent(), this.reloadJournal()]);
        await this.reloadProjects();
    }

    async reloadTasks(): Promise<void> {
        const store = useZenithStore.getState();
        store.setTasksLoading(true);
        try {
            const tasks = await this.taskParser.parseFolders(this.taskFolders());
            useZenithStore.getState().setTasks(tasks);
            this.dirtyTasks.clear();
        } catch (err) {
            console.error('Zenith: Failed to parse tasks:', err);
        } finally {
            useZenithStore.getState().setTasksLoading(false);
        }
    }

    async reloadProjects(): Promise<void> {
        const store = useZenithStore.getState();
        const { projectsFolderPath, activeModuleIds } = store.settings;
        if (!activeModuleIds.includes('projects') || !projectsFolderPath?.trim()) {
            store.setProjects([]);
            return;
        }
        store.setProjectsLoading(true);
        try {
            const allTasks = store.tasks;
            const projects = await this.projectParser.parseProjects(projectsFolderPath, allTasks);
            useZenithStore.getState().setProjects(projects);
            this.dirtyProjects.clear();
        } catch (err) {
            console.error('Zenith: Failed to parse projects:', err);
        } finally {
            useZenithStore.getState().setProjectsLoading(false);
        }
    }

    async reloadJournal(): Promise<void> {
        const store = useZenithStore.getState();
        const { journalFolderPath, journalDateFormat } = store.settings;
        store.setJournalLoading(true);
        try {
            const entries = await this.journalParser.parseJournal(journalFolderPath, journalDateFormat);
            useZenithStore.getState().setJournalEntries(entries);
            this.dirtyJournal.clear();
        } catch (err) {
            console.error('Zenith: Failed to parse the journal:', err);
        } finally {
            useZenithStore.getState().setJournalLoading(false);
        }
    }

    /**
     * Folders scanned for tasks: the tasks folder, plus the journal folder while
     * the journal module is active.
     *
     * Daily notes are where captured tasks land, so leaving them out would make
     * a task disappear from the Tasks view the moment it was created. The
     * journal folder is included whenever the module is on — not only when
     * capture is — because notes written before the setting changed (or by hand)
     * hold tasks just the same.
     */
    private taskFolders(): string[] {
        const { tasksFolderPath, journalFolderPath, projectsFolderPath, activeModuleIds } =
            useZenithStore.getState().settings;
        const folders = [tasksFolderPath];
        if (activeModuleIds.includes('journal') && journalFolderPath.trim()) {
            folders.push(journalFolderPath);
        }
        if (activeModuleIds.includes('projects') && projectsFolderPath?.trim()) {
            folders.push(projectsFolderPath);
        }
        return folders;
    }

    async reloadContent(): Promise<void> {
        const store = useZenithStore.getState();
        const folder = store.settings.contentFolderPath;
        store.setContentLoading(true);
        try {
            const items = await this.contentParser.parseContent(folder);
            useZenithStore.getState().setContentItems(items);
            this.dirtyContent.clear();
        } catch (err) {
            console.error('Zenith: Failed to parse content:', err);
        } finally {
            useZenithStore.getState().setContentLoading(false);
        }
    }

    /**
     * A vault event fired. Record which watched files it touched and schedule a
     * flush; a rename counts as touching both paths.
     */
    private onChange(file: TAbstractFile, oldPath?: string): void {
        // Only Markdown files carry tasks/content; ignore other assets. On
        // delete/rename the TFile may no longer resolve, so also test oldPath.
        const isMd = file instanceof TFile ? file.extension === 'md' : true;
        if (!isMd && !oldPath) return;

        const settings = useZenithStore.getState().settings;
        const { contentFolderPath, journalFolderPath, projectsFolderPath } = settings;
        const taskFolders = this.taskFolders();
        const dailyNotesWatched = watchesDailyNotes(settings);
        const paths = [file.path, oldPath].filter((p): p is string => !!p);

        let scheduled = false;
        for (const path of paths) {
            if (taskFolders.some((folder) => this.isInFolder(path, folder))) {
                this.dirtyTasks.add(path);
                scheduled = true;
            }
            if (this.isInFolder(path, contentFolderPath)) {
                this.dirtyContent.add(path);
                scheduled = true;
            }
            if (projectsFolderPath && this.isInFolder(path, projectsFolderPath)) {
                this.dirtyProjects.add(path);
                scheduled = true;
            }
            // A daily note is both a journal entry and a possible task source,
            // so a single edit can mark it dirty for both collections.
            if (dailyNotesWatched && this.isInFolder(path, journalFolderPath)) {
                this.dirtyJournal.add(path);
                scheduled = true;
            }
        }
        if (scheduled) this.flushDebounced();
    }

    /**
     * Re-read every file marked dirty and swap its items into the store.
     *
     * A path that no longer resolves to a Markdown file was deleted or renamed
     * away, so its items are simply dropped. Note this never touches the
     * `…Loading` flags: those drive skeleton placeholders, and flashing them for
     * a one-file edit is what used to make open modals blink.
     */
    private async flushDirty(): Promise<void> {
        const taskPaths = [...this.dirtyTasks];
        const contentPaths = [...this.dirtyContent];
        const journalPaths = [...this.dirtyJournal];
        const projectPaths = [...this.dirtyProjects];
        this.dirtyTasks.clear();
        this.dirtyContent.clear();
        this.dirtyJournal.clear();
        this.dirtyProjects.clear();

        for (const path of taskPaths) {
            try {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                const tasks = file instanceof TFile ? await this.taskParser.parseFile(file) : [];
                useZenithStore.getState().replaceTasksForFile(path, tasks);
            } catch (err) {
                console.error(`Zenith: Failed to parse tasks in "${path}":`, err);
            }
        }

        for (const path of contentPaths) {
            try {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                const item = file instanceof TFile ? await this.contentParser.parseFile(file) : null;
                useZenithStore.getState().replaceItemForFile(path, item);
            } catch (err) {
                console.error(`Zenith: Failed to parse content in "${path}":`, err);
            }
        }

        for (const path of projectPaths) {
            try {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                const project =
                    file instanceof TFile
                        ? await this.projectParser.parseFile(file, useZenithStore.getState().tasks)
                        : null;
                useZenithStore.getState().replaceProjectForFile(path, project);
            } catch (err) {
                console.error(`Zenith: Failed to parse project in "${path}":`, err);
            }
        }

        if (taskPaths.length > 0 && projectPaths.length === 0) {
            void this.reloadProjects();
        }

        if (journalPaths.length > 0) {
            const { journalFolderPath, journalDateFormat } = useZenithStore.getState().settings;
            // Compiled once per flush rather than once per file — it's a regex
            // built from the filename pattern, and the pattern can't change
            // mid-flush.
            const matcher = buildDateMatcher(journalDateFormat);
            for (const path of journalPaths) {
                try {
                    const file = this.plugin.app.vault.getAbstractFileByPath(path);
                    const entry =
                        file instanceof TFile
                            ? await this.journalParser.parseFile(file, journalFolderPath, matcher)
                            : null;
                    useZenithStore.getState().replaceJournalEntryForFile(path, entry);
                } catch (err) {
                    console.error(`Zenith: Failed to parse the daily note "${path}":`, err);
                }
            }
        }
    }

    /** Whether a vault path lives inside (or is) a configured folder. */
    private isInFolder(path: string, folder: string): boolean {
        const f = folder.replace(/^\/+|\/+$/g, '');
        if (!f) return true; // vault root configured → everything matches
        return path === f || path.startsWith(`${f}/`);
    }
}
