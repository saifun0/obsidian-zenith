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

/** The module page asked for, if any, handed over once. */
export function takeSettingsPage(): string | null {
    const page = pending;
    pending = null;
    return page;
}
