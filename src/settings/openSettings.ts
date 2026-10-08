import type ZenithPlugin from '../main';

/**
 * Open Zenith's settings, straight onto one module's page when asked.
 *
 * Obsidian opens a plugin's settings tab but has no way to say which page of
 * it; Zenith's settings are one React app with pages of its own. So the page
 * is left here, and the app takes it when it mounts — once, so opening the
 * settings any other way afterwards starts at the front as it always did.
 *
 * `app.setting` is not in the published typings; it is what every plugin's
 * "open settings" goes through, and is asked with care.
 */

let pending: string | null = null;

export function openZenithSettings(plugin: ZenithPlugin, moduleId?: string): void {
    pending = moduleId ?? null;
    const setting = (
        plugin.app as unknown as {
            setting?: { open?: () => void; openTabById?: (id: string) => unknown };
        }
    ).setting;
    setting?.open?.();
    setting?.openTabById?.(plugin.manifest.id);
}

/**
 * Whether a module has anything to show on a settings page.
 *
 * The journal is asked about by name because it brings a hand-written page
 * rather than a schema — the same exception the settings app makes when it
 * draws the page. One function for everything that offers a way there, so no
 * list and no link can offer a page that opens onto nothing.
 */
export function moduleHasSettings(plugin: ZenithPlugin, moduleId: string): boolean {
    return moduleId === 'journal' || !!plugin.moduleManager.get(moduleId)?.getSettingsSchema?.();
}

/** The module page asked for, if any, handed over once. */
export function takeSettingsPage(): string | null {
    const page = pending;
    pending = null;
    return page;
}
