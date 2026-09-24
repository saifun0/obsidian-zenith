import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { AppContext } from '../../context/AppContext';
import { translateNow } from '../../core/i18n';
import type ZenithPlugin from '../../main';
import { RitualBody } from './components/RitualBody';
import type { RitualKind } from './services/rituals';

/** The morning or evening ritual, in an Obsidian modal so a command can open it from anywhere. */
export class RitualModal extends Modal {
    private root: Root | null = null;

    constructor(
        app: App,
        private readonly plugin: ZenithPlugin,
        private readonly kind: RitualKind
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(translateNow(`ritual.${this.kind}.title`));
        this.modalEl.addClass('zenith-ritual-modal');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('zenith-root');
        this.root = createRoot(contentEl.createDiv());
        this.root.render(
            createElement(
                AppContext.Provider,
                { value: { app: this.app, plugin: this.plugin } },
                createElement(RitualBody, { kind: this.kind, onClose: () => this.close() })
            )
        );
    }

    onClose(): void {
        // Unmounted on a task of its own: `close()` is called from inside the
        // tree, and React will not unmount a root mid-render.
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
        this.contentEl.empty();
    }
}
