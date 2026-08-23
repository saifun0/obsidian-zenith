import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { VIEW_TYPE_TASKS } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { TasksApp } from './components/TasksApp';
import type ZenithPlugin from '../../main';

/**
 * TasksView — Obsidian ItemView that mounts the React TasksApp.
 */
export class TasksView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_TASKS;
    }

    getDisplayText(): string {
        return 'Tasks';
    }

    getIcon(): string {
        return 'check-square';
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
                createElement(TasksApp)
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
