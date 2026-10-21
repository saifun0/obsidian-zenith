import { BaseModule } from '../../core/IModule';
import { translateNow, type TranslationTable } from '../../core/i18n';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { SearchModal } from './SearchModal';
import { SEARCH_COMMAND_ID, actionsSource, viewsSource } from './builtInSources';
import { NoteIndex } from './noteIndex';
import { notesSource } from './notesSource';
import { searchSettingsSchema } from './settings.schema';
import { searchTranslations } from './i18n';

/**
 * SearchModule — one line to reach anything in Zenith: a view, an action, a
 * task, a project, a library item, a day's note, any note by its name or by
 * what it says; and, when what was typed is not there, to add it as a task.
 *
 * Owns the panel and three groups: the views, the actions, and the vault's
 * notes, whose text it keeps in memory once first asked. Everything else
 * is brought by the module it belongs to, through `registerSearchSource`, so
 * switching a module off takes its rows out of Search with it.
 *
 * No hotkey is set by default (see `HotkeyField`). On a phone it is opened
 * from the ribbon, which there is Obsidian's menu, or from the toolbar.
 */
export class SearchModule extends BaseModule {
    readonly id = 'search';
    readonly name = 'Search';
    readonly description =
        'Find any view, action, task, project, library item or note, and add a task, straight from one line.';
    readonly icon = 'search';

    private disposers: Array<() => void> = [];
    private notes: NoteIndex | null = null;

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    getTranslations(): TranslationTable {
        return searchTranslations;
    }

    onload(): Promise<void> {
        this.addCommand({
            id: SEARCH_COMMAND_ID,
            name: translateNow('command.search'),
            icon: 'search',
            // A command stays registered when the module is switched off; it
            // is only offered while the module is on.
            checkCallback: (checking) => {
                if (!this.plugin.moduleManager.getLoadedModuleIds().includes(this.id)) return false;
                if (!checking) void this.activateView();
                return true;
            },
        });

        this.disposers.push(this.plugin.registerSearchSource(viewsSource(this.plugin)));
        this.disposers.push(this.plugin.registerSearchSource(actionsSource(this.plugin)));

        // Following the vault from the start, but not reading it until Search
        // is first opened. After the layout: before it, every note in the
        // vault is announced as created.
        const notes = new NoteIndex(this.plugin.app);
        this.notes = notes;
        this.plugin.app.workspace.onLayoutReady(() => {
            if (this.notes === notes) notes.start();
        });
        this.disposers.push(() => notes.stop());
        this.disposers.push(this.plugin.registerSearchSource(notesSource(this.plugin, notes)));

        // Beside Zenith's own icon, arriving and leaving with the module — the
        // same reason the sync module adds its own.
        const ribbon = this.plugin.addRibbonIcon(
            'search',
            translateNow('search.ribbon'),
            () => void this.activateView()
        );
        this.disposers.push(() => ribbon.remove());
        return Promise.resolve();
    }

    onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        this.notes = null;
        return Promise.resolve();
    }

    /** No view: "open" is the panel. */
    activateView(): Promise<void> {
        new SearchModal(this.plugin).open();
        return Promise.resolve();
    }

    getSettingsSchema(): SettingsSchema {
        return searchSettingsSchema;
    }
}
