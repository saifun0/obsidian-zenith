import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createTaskSlice } from './taskSlice';
import { createContentSlice } from './contentSlice';
import { createJournalSlice } from './journalSlice';
import { createSettingsSlice } from './settingsSlice';
import type { ZenithStore } from './types';

// ── Combined Store Type ──────────────────────────────

export type { ZenithStore } from './types';

// ── Zustand Store ────────────────────────────────────

/**
 * Global Zustand store for Zenith plugin.
 * 
 * Combines slices for tasks, content, and settings.
 * Shared across all React component trees (Dashboard, Tasks, Content modules).
 * 
 * Uses subscribeWithSelector middleware for selective subscriptions
 * (e.g., persisting settings on change in main.ts).
 * 
 * Usage in React components:
 * ```tsx
 * import { useZenithStore } from '../../store';
 * const tasks = useZenithStore((s) => s.tasks);
 * ```
 */
export const useZenithStore = create<ZenithStore>()(
    subscribeWithSelector((...args) => ({
        ...createTaskSlice(...args),
        ...createContentSlice(...args),
        ...createJournalSlice(...args),
        ...createSettingsSlice(...args),
    }))
);

/**
 * Reset the store back to its initial state.
 *
 * The store is a module-level singleton that survives a plugin unload/reload
 * (disable → enable, app reload). Calling this on `onunload` prevents stale
 * tasks/content/module lists from leaking into the next load.
 */
export function resetZenithStore(): void {
    const s = useZenithStore.getState();
    s.loadSettings({}); // settings → defaults
    s.setTasks([]);
    s.setTasksLoading(false);
    s.setContentItems([]);
    s.setContentLoading(false);
    s.setJournalEntries([]);
    s.setJournalLoading(false);
    s.setAvailableModules([]);
    s.setLoadedModules([]);
}


// ── Re-exports for convenience ───────────────────────

export type { Task } from './taskSlice';
export type { ContentItem } from './contentSlice';
export type { JournalEntry } from './journalSlice';
export type { ZenithSettings } from './settingsSlice';
