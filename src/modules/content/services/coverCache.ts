import { App, normalizePath, requestUrl } from 'obsidian';

/**
 * Download remote cover art into the vault.
 *
 * Providers hand back URLs on their own CDNs, so a library assembled online is
 * a wall of grey rectangles the moment you open the vault on a plane — and one
 * dead CDN from losing its art permanently. Caching turns each cover into an
 * ordinary vault file that syncs and backs up with everything else.
 *
 * Failures are never fatal: the caller keeps the original URL, which still
 * works whenever there is a connection.
 */

/** Where cached covers live, relative to the content folder. */
export const COVER_FOLDER = 'covers';

/** Extensions we're willing to write, mapped from the response content type. */
const EXT_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
};

/** Whether this reference points outside the vault and could be cached. */
export function isRemoteCover(cover: string | undefined): boolean {
    return !!cover && /^https?:\/\//i.test(cover);
}

/**
 * A stable, filesystem-safe basename for an item's cover.
 *
 * Derived from the title rather than the URL: the same work re-fetched from a
 * different CDN path should overwrite its cover, not accumulate copies.
 */
export function coverBaseName(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9Ѐ-ӿ]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return slug || 'cover';
}

/** Pick a file extension from the response's content type, or from the URL. */
export function extensionFor(contentType: string | undefined, url: string): string {
    const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
    if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
    const fromUrl = url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1];
    return fromUrl ? fromUrl.toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

/**
 * Fetch `url` into `<contentFolder>/covers/` and return the new vault path, or
 * null if anything went wrong.
 */
export async function cacheCover(
    app: App,
    contentFolder: string,
    title: string,
    url: string
): Promise<string | null> {
    if (!isRemoteCover(url)) return null;

    try {
        const res = await requestUrl({ url, throw: false });
        if (res.status >= 400 || !res.arrayBuffer?.byteLength) return null;

        const folder = normalizePath(
            [contentFolder.replace(/\/+$/, ''), COVER_FOLDER].filter(Boolean).join('/')
        );
        if (!app.vault.getAbstractFileByPath(folder)) {
            try {
                await app.vault.createFolder(folder);
            } catch {
                // Raced with another download — fine either way.
            }
        }

        const ext = extensionFor(res.headers?.['content-type'], url);
        const path = normalizePath(`${folder}/${coverBaseName(title)}.${ext}`);

        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.adapter.writeBinary(path, res.arrayBuffer);
        else await app.vault.createBinary(path, res.arrayBuffer);

        return path;
    } catch (err) {
        console.error('Zenith: could not cache cover:', err);
        return null;
    }
}
