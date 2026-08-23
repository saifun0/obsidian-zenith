import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import type ZenithPlugin from '../main';

// ── Context Type ─────────────────────────────────────

interface AppContextValue {
    /** Obsidian App instance — access vault, workspace, etc. */
    app: App;
    /** ZenithPlugin instance — access module manager, settings */
    plugin: ZenithPlugin;
}

// ── Context ──────────────────────────────────────────

export const AppContext = createContext<AppContextValue | undefined>(undefined);

// ── Hook ─────────────────────────────────────────────

/**
 * Access Obsidian App and ZenithPlugin instances from any React component.
 * Must be used within an AppContext.Provider (mounted by each module's ItemView).
 * 
 * @example
 * ```tsx
 * const { app, plugin } = useApp();
 * const files = app.vault.getMarkdownFiles();
 * ```
 */
export function useApp(): AppContextValue {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error(
            'useApp() must be used within an <AppContext.Provider>. ' +
            'Ensure the React tree is mounted inside a Zenith ItemView.'
        );
    }
    return context;
}
