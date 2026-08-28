import { BaseModule } from '../../core/IModule';
import { contentSettingsSchema } from './settings.schema';
import type { SettingsSchema } from '../../settings/schema/types';
import { VIEW_TYPE_CONTENT } from '../../core/constants';
import { ContentView } from './ContentView';
import { ContentWidget } from './components/ContentWidget';
import type ZenithPlugin from '../../main';
import { contentTranslations } from './i18n';
import type { TranslationTable } from '../../core/i18n';

/**
 * ContentModule — gallery-style content tracker.
 * Parses .md files with YAML frontmatter for books, movies, shows, games, etc.
 */
export class ContentModule extends BaseModule {
    readonly id = 'content';
    readonly name = 'Content';
    readonly description = 'Manage your articles, notes, and long-form content.';
    readonly icon = 'file-text';

    getTranslations(): TranslationTable {
        return contentTranslations;
    }

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    async onload(): Promise<void> {
        this.registerView(
            VIEW_TYPE_CONTENT,
            (leaf) => new ContentView(leaf, this.plugin)
        );

        this.addCommand({
            id: 'open-content',
            name: 'Open Content Library',
            callback: () => this.activateView(),
        });

        // Contribute the Content widget to the dashboard.
        this.disposers.push(
            this.plugin.registerDashboardWidget({
                id: 'content.overview',
                title: 'Content',
                description: 'Library status at a glance and what to continue next.',
                icon: 'library',
                sizes: ['md', 'lg'],
                defaultSize: 'md',
                order: 40,
                component: ContentWidget,
            })
        );

        this.disposers.push(
            this.plugin.registerNavAction({
                id: 'content.view',
                labelKey: 'nav.content',
                descriptionKey: 'nav.content.desc',
                icon: 'library',
                order: 40,
                viewType: VIEW_TYPE_CONTENT,
            })
        );
    }

    async onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        // NOTE: leaves are intentionally left attached (see TasksModule).
    }

    async activateView(): Promise<void> {
        await this.openView(VIEW_TYPE_CONTENT);
    }

    getSettingsSchema(): SettingsSchema {
        return contentSettingsSchema;
    }
}
