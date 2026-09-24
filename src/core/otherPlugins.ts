import type { App } from 'obsidian';

/**
 * Whether another community plugin is switched on — for the few places where
 * two plugins doing the same job would step on each other, and Zenith should
 * say so rather than race it. Not in Obsidian's public API, hence the cast; a
 * build without it reads as "not enabled", which only ever costs a hint.
 */
export function isPluginEnabled(app: App, ...ids: string[]): boolean {
    const enabled = (app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins
        ?.enabledPlugins;
    return !!enabled && ids.some((id) => enabled.has(id));
}
