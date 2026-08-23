import type { App } from 'obsidian';

/**
 * Resolve a cover reference to a usable URL. Remote URLs and data URIs are used
 * as-is; anything else is treated as a vault-relative path and resolved through
 * the adapter so local images render.
 */
export function resolveCover(app: App, cover: string | undefined): string | undefined {
    if (!cover) return undefined;
    if (/^(https?:|data:|app:|file:)/.test(cover)) return cover;
    const file =
        app.metadataCache.getFirstLinkpathDest(cover, '') ?? app.vault.getAbstractFileByPath(cover);
    if (file && 'path' in file) {
        return app.vault.adapter.getResourcePath(file.path);
    }
    return cover;
}
