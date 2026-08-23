/**
 * Pure helpers for keeping the folder-icon map (path → icon id) consistent as
 * files/folders are renamed or deleted. Extracted so the prefix handling — a
 * classic source of bugs (renaming "foo" must not touch "foobar") — is unit
 * tested in isolation.
 */

export type IconMap = Record<string, string>;

/** True if `path` is exactly `base` or a descendant of it (`base/…`). */
function isSelfOrDescendant(path: string, base: string): boolean {
    return path === base || path.startsWith(`${base}/`);
}

/**
 * Remap icon assignments after a rename/move of `oldPath` → `newPath`,
 * including any descendants. Returns the (possibly new) map and whether it changed.
 */
export function remapIconPaths(icons: IconMap, oldPath: string, newPath: string): {
    icons: IconMap;
    changed: boolean;
} {
    let changed = false;
    const next: IconMap = {};

    for (const [key, value] of Object.entries(icons)) {
        if (key === oldPath) {
            next[newPath] = value;
            changed = true;
        } else if (key.startsWith(`${oldPath}/`)) {
            next[newPath + key.slice(oldPath.length)] = value;
            changed = true;
        } else {
            next[key] = value;
        }
    }

    return { icons: changed ? next : icons, changed };
}

/**
 * Drop icon assignments for a deleted `path` and its descendants. Returns the
 * (possibly new) map and whether it changed.
 */
export function pruneIconPaths(icons: IconMap, path: string): { icons: IconMap; changed: boolean } {
    let changed = false;
    const next: IconMap = {};

    for (const [key, value] of Object.entries(icons)) {
        if (isSelfOrDescendant(key, path)) {
            changed = true; // drop it
        } else {
            next[key] = value;
        }
    }

    return { icons: changed ? next : icons, changed };
}
