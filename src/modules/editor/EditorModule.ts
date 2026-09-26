import { MarkdownView, type App } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { BaseModule } from '../../core/IModule';
import { isFeatureOn, watchFeature } from '../../core/useFeature';
import type { TranslationTable } from '../../core/i18n';
import type { SettingsSchema } from '../../settings/schema/types';
import type ZenithPlugin from '../../main';
import { codeBlockExtension } from './code/livePreview';
import { decorateCodeBlocks, type CodeBlockOptions } from './code/readingView';
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
 * once per plugin and switched from here: the post-processor reads `live`,
 * and the extension list is emptied or filled and handed back to Obsidian.
 *
 * Code Styler does the same job, and two plugins drawing one block draw it
 * twice. While it is on, this module stands aside and says so in settings.
 */

interface Hooks {
    /** What the post-processor and the extension currently do. */
    live: CodeBlockOptions & { enabled: boolean };
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
        const apply = () => this.apply(own);

        this.disposers.push(watchFeature('editor.codeBlocks', apply));
        this.disposers.push(watchFeature('editor.codeLineNumbers', apply));

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
        if (own) this.set(own, { enabled: false, lineNumbers: own.live.lineNumbers });
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

        const created: Hooks = { live: { enabled: false, lineNumbers: true }, extensions: [] };
        this.plugin.registerMarkdownPostProcessor((el) => {
            if (created.live.enabled) decorateCodeBlocks(el, created.live);
        });
        this.plugin.registerEditorExtension(created.extensions);
        hooks.set(this.plugin, created);
        own = created;
        return own;
    }

    private apply(own: Hooks): void {
        this.set(own, {
            enabled: isFeatureOn('editor.codeBlocks') && !codeStylerOn(this.plugin.app),
            lineNumbers: isFeatureOn('editor.codeLineNumbers'),
        });
    }

    /** Switch both modes to `next`, and redraw what is open — only if something changed. */
    private set(own: Hooks, next: CodeBlockOptions & { enabled: boolean }): void {
        const { live } = own;
        if (live.enabled === next.enabled && live.lineNumbers === next.lineNumbers) return;
        own.live = next;

        own.extensions.length = 0;
        if (next.enabled)
            own.extensions.push(codeBlockExtension({ lineNumbers: next.lineNumbers }));
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
