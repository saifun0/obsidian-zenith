import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../../context/AppContext';
import type ZenithPlugin from '../../main';

/**
 * Open one of the module's dialogs from outside any React tree — a command,
 * the settings page. The dialog portals itself over the app; this only gives
 * it a root to live in and takes the root away when it closes.
 */
export function openStudyDialog(
    plugin: ZenithPlugin,
    render: (close: () => void) => ReactElement
): void {
    const host = document.body.createDiv({ cls: 'zenith-study-dialog-host' });
    const root = createRoot(host);
    const close = () => {
        // On a task of its own: the dialog calls this from inside the tree.
        window.setTimeout(() => {
            root.unmount();
            host.remove();
        }, 0);
    };
    root.render(
        createElement(AppContext.Provider, { value: { app: plugin.app, plugin } }, render(close))
    );
}
