import type { App } from 'obsidian';
import { imageSrc } from '../../../core/imageSource';

/**
 * Resolve a cover reference to a usable URL, or undefined when there is none.
 *
 * A vault path is resolved through the adapter so local images render; an
 * address is used as written. Either way the result has passed the same scheme
 * check as the wallpaper and the picture widget — a cover comes from a note's
 * frontmatter or an import file, and `javascript:` or `data:text/html` in one
 * is not a picture, whatever the field is called. A path that does not lead
 * to a file is no cover either, rather than an address that cannot load.
 */
export function resolveCover(app: App, cover: string | undefined): string | undefined {
    const ref = cover?.trim();
    if (!ref) return undefined;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return imageSrc(ref) || undefined;
    const file =
        app.metadataCache.getFirstLinkpathDest(ref, '') ?? app.vault.getAbstractFileByPath(ref);
    if (file && 'path' in file) {
        return imageSrc(app.vault.adapter.getResourcePath(file.path)) || undefined;
    }
    return undefined;
}
