import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { VIEW_TYPE_NAV_PANEL } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { NavPanel } from './components/NavPanel';
import type ZenithPlugin from '../../main';

/**
 * NavPanelView — the side panel, as a tab in Obsidian's sidebar.
 *
 * `zenith-root` goes on the mount point rather than on `contentEl`: the views
 * in the main area are the ones that keep clear of a phone's camera and
 * buttons (`core/mobileInsets.ts` finds them by `.view-content.zenith-root`),
 * and a sidebar drawer is already kept clear by Obsidian.
 */
export class NavPanelView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_NAV_PANEL;
    }

    getDisplayText(): string {
        return 'Zenith';
    }

    getIcon(): string {
        return 'compass';
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();

        const mountPoint = container.createDiv('zenith-root zenith-panel-root');
        this.root = createRoot(mountPoint);
        this.root.render(
            createElement(
                StrictMode,
                null,
                createElement(
                    AppContext.Provider,
                    { value: { app: this.app, plugin: this.plugin } },
                    createElement(NavPanel)
                )
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
