import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../context/AppContext';
import type ZenithPlugin from '../main';

/**
 * Open one of Zenith's React dialogs from outside any React tree — a command,
 * the settings page, the Search panel. The dialog portals itself over the app;
 * this only gives it a root to live in and takes the root away when it closes.
 */
export function openDialog(
    plugin: ZenithPlugin,
    render: (close: () => void) => ReactElement,
    hostClass = 'zenith-dialog-host'
): void {
    const host = document.body.createDiv({ cls: hostClass });
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
