import { normalizePath } from 'obsidian';
import type ZenithPlugin from '../main';

/**
 * Where third-party modules live, as VAULT-RELATIVE paths.
 *
 * The previous version resolved an absolute filesystem path by joining Node's
 * `path` with `FileSystemAdapter.getBasePath()`. Both are desktop-only, so on
 * iOS the whole feature silently did nothing. Obsidian's `DataAdapter` is
 * vault-root-relative and works identically on every platform — including
 * inside `.obsidian`, which the journal's daily-notes conflict check already
 * relies on.
 */

/**
 * Allowed characters for a module id.
 *
 * The id becomes a folder name, an entry in `activeModuleIds` and a key in
 * `moduleSettings`, so it is validated at every entry point rather than only at
 * discovery — this is what stops an id like `../../evil` from escaping the
 * modules folder.
 */
export const SAFE_MODULE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isSafeModuleId(id: unknown): id is string {
    return typeof id === 'string' && id.length <= 64 && SAFE_MODULE_ID.test(id);
}

export interface ModulePaths {
    /** `<plugin dir>/modules` */
    root: string;
    dir(id: string): string;
    manifest(id: string): string;
    main(id: string): string;
    styles(id: string): string;
}

export interface IconPackPaths {
    /** `<plugin dir>/icons` */
    root: string;
    dir(id: string): string;
    manifest(id: string): string;
}

/**
 * Where icon packs live — beside `modules`, for the same reasons.
 *
 * Deliberately inside the plugin folder rather than in the vault proper: a pack
 * is 40 loose `.svg` files, and in the vault they show up in search, in the file
 * explorer, and in every "attachments" sweep the user runs.
 */
export function iconPackPaths(plugin: ZenithPlugin): IconPackPaths | null {
    const pluginDir = plugin.manifest.dir;
    if (!pluginDir) return null;

    const root = normalizePath(`${pluginDir}/icons`);
    const dir = (id: string) => normalizePath(`${root}/${id}`);

    return { root, dir, manifest: (id) => normalizePath(`${dir(id)}/pack.json`) };
}

/** Null when Obsidian hasn't told us where the plugin lives. */
export function modulePaths(plugin: ZenithPlugin): ModulePaths | null {
    const pluginDir = plugin.manifest.dir;
    if (!pluginDir) return null;

    const root = normalizePath(`${pluginDir}/modules`);
    const dir = (id: string) => normalizePath(`${root}/${id}`);

    return {
        root,
        dir,
        manifest: (id) => normalizePath(`${dir(id)}/manifest.json`),
        main: (id) => normalizePath(`${dir(id)}/main.js`),
        styles: (id) => normalizePath(`${dir(id)}/styles.css`),
    };
}
