import { MarkdownView, type App } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { BaseModule } from '../../core/IModule';
import { isFeatureOn } from '../../core/useFeature';
import { useZenithStore } from '../../store';
import type { TranslationTable } from '../../core/i18n';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { codeBlockExtension } from './code/livePreview';
import { currentCodeOptions } from './code/currentOptions';
import { DEFAULT_CODE_OPTIONS, sameOptions, type CodeBlockOptions } from './code/options';
import { decorateCodeBlocks } from './code/readingView';
import { editorSettingsSchema } from './settings.schema';
import { editorTranslations } from './i18n';

/**
 * EditorModule — what makes a note nicer to write and to read. For now, its
 * code blocks: a header with the language's icon and name, a stripe in its
 * colour, line numbers and a copy button, in reading view and in Live Preview
 * alike.
 *
 * Obsidian keeps a post-processor and an editor extension until the plugin
 * unloads; neither can be taken back by one module. So both are registered
 * once per plugin and switched from here: the post-processor reads the hooks'
 * options, and the extension list is emptied or filled and handed back to
 * Obsidian.
 *
 * Code Styler does the same job, and two plugins drawing one block draw it
 * twice. While it is on, this module stands aside and says so in settings.
 */

interface Hooks {
    /** Whether blocks are drawn at all, and how. */
    enabled: boolean;
    options: CodeBlockOptions;
    /** The list registered with Obsidian; refilled to change the editors. */
    extensions: Extension[];
}

const hooks = new WeakMap<ZenithPlugin, Hooks>();

export class EditorModule extends BaseModule {
    readonly id = 'editor';
    readonly name = 'Editor';
    readonly description =
        'Code blocks with the language, its icon, line numbers and a copy button.';
    readonly icon = 'square-code';

    private disposers: Array<() => void> = [];

    constructor(plugin: ZenithPlugin) {
        super(plugin);
    }

    getTranslations(): TranslationTable {
        return editorTranslations;
    }

    onload(): Promise<void> {
        const own = this.hooks();
        const apply = () =>
            this.set(own, {
                enabled: isFeatureOn('editor.codeBlocks') && !codeStylerOn(this.plugin.app),
                options: currentCodeOptions(),
            });

        // Every feature and setting the blocks read, as one key: a change to
        // any of them redraws, and a write to anything else does not.
        this.disposers.push(
            useZenithStore.subscribe(
                () => JSON.stringify([isFeatureOn('editor.codeBlocks'), currentCodeOptions()]),
                apply
            )
        );
        apply();

        // Obsidian says nothing when another plugin is switched on or off, so
        // Code Styler is looked for again whenever the workspace moves.
        const { workspace } = this.plugin.app;
        const ref = workspace.on('layout-change', apply);
        this.disposers.push(() => workspace.offref(ref));
        return Promise.resolve();
    }

    onunload(): Promise<void> {
        this.disposers.forEach((d) => d());
        this.disposers = [];
        const own = hooks.get(this.plugin);
        if (own) this.set(own, { enabled: false, options: own.options });
        return Promise.resolve();
    }

    /** No view of its own. */
    activateView(): Promise<void> {
        return Promise.resolve();
    }

    getSettingsSchema(): SettingsSchema {
        return editorSettingsSchema(codeStylerOn(this.plugin.app));
    }

    private hooks(): Hooks {
        let own = hooks.get(this.plugin);
        if (own) return own;

        const created: Hooks = { enabled: false, options: DEFAULT_CODE_OPTIONS, extensions: [] };
        this.plugin.registerMarkdownPostProcessor((el, ctx) => {
            if (created.enabled) decorateCodeBlocks(el, created.options, ctx);
        });
        this.plugin.registerEditorExtension(created.extensions);
        hooks.set(this.plugin, created);
        own = created;
        return own;
    }

    /** Switch both modes over, and redraw what is open — only if something changed. */
    private set(own: Hooks, next: { enabled: boolean; options: CodeBlockOptions }): void {
        if (own.enabled === next.enabled && sameOptions(own.options, next.options)) return;
        own.enabled = next.enabled;
        own.options = next.options;

        own.extensions.length = 0;
        if (next.enabled) own.extensions.push(codeBlockExtension(next.options));
        this.plugin.app.workspace.updateOptions();

        // Reading view draws once and keeps what it drew.
        for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.getMode() === 'preview') {
                view.previewMode.rerender(true);
            }
        }
    }
}

/** Whether Code Styler is switched on in this vault. Not in the published API, so asked with care. */
function codeStylerOn(app: App): boolean {
    const plugins = (app as unknown as { plugins?: { enabledPlugins?: unknown } }).plugins;
    const enabled = plugins?.enabledPlugins;
    return enabled instanceof Set && enabled.has('code-styler');
}
