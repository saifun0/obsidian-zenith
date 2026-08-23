import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { VIEW_TYPE_DASHBOARD } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { DashboardApp } from './components/DashboardApp';
import type ZenithPlugin from '../../main';

/**
 * DashboardView — Obsidian ItemView that hosts the React dashboard.
 *
 * Mounts a React 18 root on open, passes the Obsidian App and ZenithPlugin
 * via AppContext.Provider, and unmounts cleanly on close.
 */
export class DashboardView extends ItemView {
    private root: Root | null = null;
    private plugin: ZenithPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: ZenithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_DASHBOARD;
    }

    getDisplayText(): string {
        return 'Zenith Dashboard';
    }

    getIcon(): string {
        return 'layout-dashboard';
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
                    createElement(DashboardApp)
                )
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
