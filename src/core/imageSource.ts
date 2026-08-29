/**
 * What counts as a picture, and which addresses one may be fetched from.
 *
 * Two features need these answers and need to give the same ones: the board's
 * wallpaper and the picture widget. Kept apart they drift — a list of
 * extensions that no longer matches means the picker offers a file the
 * renderer refuses, and a scheme check that no longer matches means one of the
 * two is laxer than the other, which is the one that decides what the plugin
 * actually allows.
 */

/** What a picture may be. Anything else is a typo or a mistake worth showing. */
export const IMAGE_EXTENSIONS: readonly string[] = [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'avif',
    'bmp',
    'svg',
] as const;

export function isImagePath(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Schemes an address may use.
 *
 * `app:` is what Obsidian hands back for a file in the vault. `data:` is
 * restricted to images so a settings field cannot be turned into a way to
 * smuggle a stylesheet. Everything else — `javascript:` above all — is refused
 * rather than escaped, because there is no correct way to render it.
 */
export const SAFE_IMAGE_SCHEME = /^(?:https?:|app:|capacitor:|data:image\/)/i;

/**
 * An address fit for an `<img src>`, or empty when it is not one.
 *
 * Nothing is escaped, unlike the CSS form: an attribute is not a stylesheet,
 * and React assigns the property rather than writing markup, so there is no
 * quote for the value to close and no declaration for it to open. The scheme
 * check is the whole guard, and it is the same one the wallpaper uses.
 */
export function imageSrc(raw: string): string {
    const url = raw.trim();
    return url && SAFE_IMAGE_SCHEME.test(url) ? url : '';
}
