import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { PrayerApp } from './components/PrayerApp';
import type ZenithPlugin from '../../main';

/**
 * PrayerModal — the full tracker, over whatever you were doing.
 *
 * This used to be a tab of its own, which was the wrong shape for it: it is
 * opened to answer one question — fill in yesterday, or see how the month is
 * going — and then closed. A tab made that a place you had to navigate to and
 * navigate back from, and it lingered in the workspace afterwards.
 *
 * An Obsidian `Modal` rather than the React `Modal` component on purpose: the
 * dashboard widget, the launcher button and the command all open this, and only
 * the first of those is inside React. One implementation, three callers.
 *
 * `contentEl` gets `zenith-root` because a modal lives at the end of `<body>`,
 * outside the subtree where the `--zenith-*` tokens and the lucide icon-size
 * guard are declared.
 */
export class PrayerModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly plugin: ZenithPlugin
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('zenith-prayer-modal');

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('zenith-root');

        const mountPoint = contentEl.createDiv();
        this.root = createRoot(mountPoint);

        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(PrayerApp)
            )
        );
    }

    onClose(): void {
        // Unmount before emptying: React has to run its cleanup while its nodes
        // are still in the document, or the store subscriptions outlive the DOM.
        this.root?.unmount();
        this.root = null;
        this.contentEl.empty();
    }
}
