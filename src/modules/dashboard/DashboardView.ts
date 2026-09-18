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
        container.addClass('zenith-root', 'zenith-dash-host');

        // The wallpaper has to reach the pane's edges, and two things sat in
        // the way. Obsidian gives `.view-content` an inset of its own, which
        // under a plain board is pane colour on pane colour and under a
        // picture is a frame of bare pane around it; and this mount point is
        // otherwise an anonymous `div` with no height for a short board to
        // fill. Both are the stylesheet's business — it only needs the two
        // elements named.
        const mountPoint = container.createDiv({ cls: 'zenith-dash-mount' });
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
