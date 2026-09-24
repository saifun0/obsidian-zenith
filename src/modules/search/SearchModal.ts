import { Modal } from 'obsidian';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext } from '../../context/AppContext';
import { SearchPanel } from './components/SearchPanel';
import type ZenithPlugin from '../../main';

/**
 * The Search panel's window: an Obsidian modal, dressed as the command palette.
 *
 * A modal rather than a layer of our own because Obsidian then does what a
 * palette needs and a portal would have to imitate: Escape and the phone's
 * back gesture close it, it stacks with other modals, and focus comes back
 * where it was. It takes the shape `SuggestModal` gives itself — `prompt`
 * instead of `modal`, emptied of the title and close button — so themes that
 * style the palette style this too.
 */
export class SearchModal extends Modal {
    private root: Root | null = null;

    constructor(private readonly plugin: ZenithPlugin) {
        super(plugin.app);
    }

    onOpen(): void {
        const { modalEl } = this;
        modalEl.removeClass('modal');
        modalEl.addClass('prompt', 'zenith-search');
        modalEl.empty();

        const root = createRoot(modalEl);
        this.root = root;
        // Drawn at once and focused here, still inside the tap that opened
        // it: iOS only brings up the keyboard for a focus the user's own
        // gesture asked for, and a render left to React's own time is later.
        flushSync(() =>
            root.render(
                createElement(
                    AppContext.Provider,
                    { value: { app: this.app, plugin: this.plugin } },
                    createElement(SearchPanel, { close: () => this.close() })
                )
            )
        );
        modalEl.querySelector('input')?.focus();
    }

    onClose(): void {
        // Unmounted on a task of its own: React refuses to unmount while it is
        // rendering, and `close()` is called from inside the tree.
        const root = this.root;
        this.root = null;
        window.setTimeout(() => root?.unmount(), 0);
    }
}
