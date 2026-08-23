import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { VIEW_TYPE_JOURNAL } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { JournalApp } from './components/JournalApp';
import type ZenithPlugin from '../../main';

/**
 * JournalView — Obsidian ItemView that mounts the React JournalApp.
 */
export class JournalView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_JOURNAL;
    }

    getDisplayText(): string {
        return 'Journal';
    }

    getIcon(): string {
        return 'calendar-days';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('zenith-root');

        const mountPoint = container.createDiv();
        this.root = createRoot(mountPoint);

        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(JournalApp)
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
