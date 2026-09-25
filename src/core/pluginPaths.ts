import { normalizePath } from 'obsidian';
import type ZenithPlugin from '../main';

/**
 * Folders Zenith keeps inside its plugin folder, as VAULT-RELATIVE paths.
 *
 * Obsidian's `DataAdapter` is vault-root-relative and works identically on
 * every platform — including inside `.obsidian`, which Node's `path` and
 * `FileSystemAdapter.getBasePath()` do not on iOS.
 */

/**
 * Allowed characters for a folder id, such as an icon pack's.
 *
 * The id becomes a folder name, so it is validated wherever one arrives — this
 * is what stops an id like `../../evil` from escaping the folder it belongs in.
 */
export const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isSafeId(id: unknown): id is string {
    return typeof id === 'string' && id.length <= 64 && SAFE_ID.test(id);
}

export interface IconPackPaths {
    /** `<plugin dir>/icons` */
    root: string;
    dir(id: string): string;
    manifest(id: string): string;
}

/**
 * Where icon packs live.
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
