import { useSyncExternalStore } from 'react';

/**
 * Cards before their contents, when the dashboard opens with Obsidian on a
 * phone.
 *
 * A phone's startup is already the slow part of using Obsidian there, and a
 * board is a dozen widgets each reading the vault's worth of tasks, notes and
 * prayer times. Held, the grid draws its cards — headers, sizes, the board's
 * shape — and the widgets fill in once the app has settled. Only the startup
 * open holds it; opening the dashboard later draws everything at once.
 */

let held = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function holdWidgetBodies(): void {
    held = true;
}

export function releaseWidgetBodies(): void {
    if (!held) return;
    held = false;
    listeners.forEach((l) => l());
}

/** Whether a card may draw its widget yet. */
export function useWidgetBodiesReady(): boolean {
    return !useSyncExternalStore(subscribe, () => held);
}
