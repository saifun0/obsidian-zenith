import { App, TFile } from 'obsidian';
import { IMAGE_EXTENSIONS } from '../../core/constants';

const IMAGE_EXT_SET = new Set<string>(IMAGE_EXTENSIONS);

export interface VaultImage {
    path: string;
    name: string;
}

/** Whether a reference is a remote/absolute URL rather than a vault path. */
export function isRemoteRef(ref: string): boolean {
    return /^(https?:|data:|app:|file:)/i.test(ref.trim());
}

/**
 * Resolve an image reference (URL or vault path) to a usable `src`.
 * Returns null if a vault path can't be resolved to a file.
 */
export function resolveMediaSrc(app: App, ref: string): string | null {
    const r = ref.trim();
    if (!r) return null;
    if (isRemoteRef(r)) return r;
    const file =
        app.vault.getAbstractFileByPath(r) ?? app.metadataCache.getFirstLinkpathDest(r, '');
    if (file instanceof TFile) return app.vault.getResourcePath(file);
    return null;
}

/** All image files in the vault, sorted by name. */
export function getVaultImages(app: App): VaultImage[] {
    return app.vault
        .getFiles()
        .filter((f) => IMAGE_EXT_SET.has(f.extension.toLowerCase()))
        .map((f) => ({ path: f.path, name: f.basename }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** A short display label for a reference (filename / URL basename). */
export function mediaLabel(ref: string): string {
    const r = ref.trim();
    if (isRemoteRef(r)) {
        try {
            return decodeURIComponent(new URL(r).pathname.split('/').pop() || r);
        } catch {
            return r;
        }
    }
    return r.split('/').pop() || r;
}
