import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { translateNow } from '../../core/i18n';
import type ZenithPlugin from '../../main';
import { YearReview } from './components/YearReview';

/** The year in review, in a modal so a command or a year's summary can open it. */
export class YearReviewModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly plugin: ZenithPlugin,
        private readonly year: number
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(translateNow('review.year.title'));
        this.modalEl.addClass('zenith-yreview-modal');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('zenith-root');
        this.root = createRoot(contentEl.createDiv());
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(YearReview, { initialYear: this.year })
            )
        );
    }

    onClose(): void {
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
