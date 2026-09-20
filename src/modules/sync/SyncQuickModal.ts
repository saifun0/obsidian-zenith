import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { SyncQuickApp } from './components/SyncQuickApp';
import { translateNow } from '../../core/i18n';
import type ZenithPlugin from '../../main';

/**
 * Vault sync, over whatever you were doing.
 *
 * Replaces `SyncView`, which was a workspace tab. The reasoning is the one
 * `PrayerModal` already set out: this is opened to answer a single question
 * and then closed, and a tab makes that a destination you navigate to and back
 * from, which then sits in the workspace afterwards.
 *
 * A plain Obsidian `Modal` rather than the React portal for the same reason
 * `PrayerModal` is one: three callers, and only one of them is inside React —
 * the ribbon icon, the command, and the dashboard launcher. One implementation
 * that all three can open beats a React component that two of them cannot.
 *
 * `contentEl` gets `zenith-root` because a modal lives at the end of `<body>`,
 * outside the subtree where the `--zenith-*` tokens and the lucide icon-size
 * guard are declared.
 */
export class SyncQuickModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly plugin: ZenithPlugin
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('zenith-syncq-modal');

        const { contentEl, titleEl } = this;
        contentEl.empty();
        contentEl.addClass('zenith-root');
        titleEl.setText(translateNow('sync.quick.title'));

        const mountPoint = contentEl.createDiv();
        this.root = createRoot(mountPoint);

        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(SyncQuickApp, { onClose: () => this.close() })
            )
        );
    }

    onClose(): void {
        // Unmounted on a task of its own: React refuses to unmount while it is
        // rendering, and `close()` can be called from an event handler inside
        // the tree — which is exactly what the confirm button does.
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
