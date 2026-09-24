import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import { StrictMode, createElement } from 'react';
import { VIEW_TYPE_PROJECTS } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { ProjectsApp } from './components/ProjectsApp';
import type ZenithPlugin from '../../main';

/**
 * ProjectsView — Obsidian ItemView that mounts the React Projects UI.
 */
export class ProjectsView extends ItemView {
    private root: Root | null = null;
    private plugin: ZenithPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: ZenithPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_PROJECTS;
    }

    getDisplayText(): string {
        return 'Projects';
    }

    getIcon(): string {
        return 'folder-kanban';
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('zenith-root');

        const mountPoint = container.createDiv();
        this.root = createRoot(mountPoint);
        this.root.render(
            createElement(
                StrictMode,
                null,
                createElement(
                    AppContext.Provider,
                    { value: { app: this.app, plugin: this.plugin } },
                    createElement(ProjectsApp)
                )
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
