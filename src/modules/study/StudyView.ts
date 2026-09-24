import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { VIEW_TYPE_STUDY } from '../../core/constants';
import { AppContext } from '../../context/AppContext';
import { translateNow } from '../../core/i18n';
import { StudyApp } from './components/StudyApp';
import type ZenithPlugin from '../../main';

/** The timetable as a tab of its own. */
export class StudyView extends ItemView {
    private root: Root | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly plugin: ZenithPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_STUDY;
    }

    getDisplayText(): string {
        return translateNow('study.title');
    }

    getIcon(): string {
        return 'graduation-cap';
    }

    onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('zenith-root');
        this.root = createRoot(container.createDiv());
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(StudyApp)
            )
        );
        return Promise.resolve();
    }

    onClose(): Promise<void> {
        this.root?.unmount();
        this.root = null;
        return Promise.resolve();
    }
}
