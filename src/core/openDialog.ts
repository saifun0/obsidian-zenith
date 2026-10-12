import { createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '../context/AppContext';
import type ZenithPlugin from '../main';

/** The dialogs opened from here that are still on screen, each by the way to take it down. */
const open = new Set<() => void>();

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
    const remove = () => {
        if (!open.delete(remove)) return;
        root.unmount();
        host.remove();
    };
    open.add(remove);
    const close = () => {
        // On a task of its own: the dialog calls this from inside the tree.
        window.setTimeout(remove, 0);
    };
    root.render(
        createElement(AppContext.Provider, { value: { app: plugin.app, plugin } }, render(close))
    );
}

/**
 * Take down every dialog still open. For when the plugin is switched off or
 * updated with one on screen: its root lives on `<body>`, which no view's
 * teardown reaches, so it stayed — a dialog of a plugin that was no longer
 * there, its buttons writing to a store nothing read.
 */
export function closeOpenDialogs(): void {
    for (const remove of [...open]) remove();
}
