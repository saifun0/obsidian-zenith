import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { VIEW_TYPE_SYNC } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { SyncApp } from './components/SyncApp';
import type ZenithPlugin from '../../main';

/** SyncView — Obsidian ItemView that mounts the React SyncApp. */
export class SyncView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_SYNC;
    }

    getDisplayText(): string {
        return 'Sync';
    }

    getIcon(): string {
        return 'refresh-cw';
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
                createElement(SyncApp)
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
