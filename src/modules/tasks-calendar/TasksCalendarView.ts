import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { VIEW_TYPE_TASKS_CALENDAR } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { TasksCalendarApp } from './components/TasksCalendarApp';
import type ZenithPlugin from '../../main';

/**
 * TasksCalendarView — Obsidian ItemView that mounts the React calendar.
 */
export class TasksCalendarView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_TASKS_CALENDAR;
    }

    getDisplayText(): string {
        return 'Tasks Calendar';
    }

    getIcon(): string {
        return 'calendar-days';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('zenith-root');

        // The other Zenith views are content-height and let `.zenith-root`
        // scroll; the calendar has to fill the pane so its six week rows can
        // share the height. A percentage height needs a parent with a definite
        // one, and this wrapper is otherwise an anonymous `div`.
        const mountPoint = container.createDiv({ cls: 'zenith-tcal-mount' });
        this.root = createRoot(mountPoint);

        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(TasksCalendarApp)
            )
        );
    }

    async onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
    }
}
