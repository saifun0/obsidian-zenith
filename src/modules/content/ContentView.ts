import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { VIEW_TYPE_CONTENT } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { ContentApp } from './components/ContentApp';
import type ZenithPlugin from '../../main';

/**
 * ContentView — Obsidian ItemView that mounts the React Content UI.
 */
export class ContentView extends ItemView {
    private root: Root | null = null;
    private plugin: ZenithPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: ZenithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_CONTENT;
    }

    getDisplayText(): string {
        return 'Content';
    }

    getIcon(): string {
        return 'library';
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('zenith-root');

        const mountPoint = container.createDiv();
        this.root = createRoot(mountPoint);
        this.root.render(
            createElement(StrictMode, null,
                createElement(AppContext.Provider,
                    { value: { app: this.app, plugin: this.plugin } },
                    createElement(ContentApp)
                )
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
