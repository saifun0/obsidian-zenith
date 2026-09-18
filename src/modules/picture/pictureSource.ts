/**
 * The picture widget, as data.
 *
 * Everything the widget needs to decide is decided here, as a pure function of
 * the settings and a resolver, which is what lets the awkward cases be tested
 * rather than eyeballed: an address typed by a user going into an `<img>`, a
 * vault path that points at a note, a setting left half-filled.
 *
 * The widget renders one of three things and nothing else, so this returns
 * which of the three rather than a string the widget has to interpret. An
 * empty string would have collapsed "nothing chosen yet" and "you chose
 * something that cannot be shown" into one silent blank card.
 */

import { imageSrc, isImagePath } from '../../core/imageSource';

export type PictureSource = 'url' | 'vault';
export type PictureFit = 'cover' | 'contain';

export const PICTURE_SOURCES: readonly PictureSource[] = ['url', 'vault'] as const;
export const PICTURE_FITS: readonly PictureFit[] = ['cover', 'contain'] as const;

/**
 * One card's worth of settings.
 *
 * Per copy rather than per module: a board may hold several pictures, and two
 * of them forced to show the same photograph would be one picture rendered
 * twice. Stored under the card's layout id — see `dashboard/widgetConfig.ts`.
 */
export interface PictureSettings extends Record<string, unknown> {
    /** A link on the web, or a file in the vault. */
    pictureSource: PictureSource;
    /** Used when the source is `url`. */
    pictureUrl: string;
    /** Vault-relative path, used when the source is `vault`. */
    picturePath: string;
    /** Fill the card and crop, or fit the whole picture inside it. */
    pictureFit: PictureFit;
}

/**
 * A card nobody has configured yet.
 *
 * The vault first: a picture that travels with the vault is the one still
 * there tomorrow, and it costs no request to a stranger's server.
 */
export const DEFAULT_PICTURE_SETTINGS: PictureSettings = {
    pictureSource: 'vault',
    pictureUrl: '',
    picturePath: '',
    pictureFit: 'cover',
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Coerce a stored bucket into usable settings.
 *
 * This comes back from `data.json`, so it is untrusted input in the ordinary
 * sense — hand-edited, written by an older version, or synced from a device
 * running one. Every field falls back rather than throwing: a card that renders
 * its default is recoverable from the panel on its own back, and a card that
 * throws takes the whole board's render down with it.
 */
export function normalizePictureSettings(raw: Record<string, unknown> | undefined): PictureSettings {
    if (!raw) return DEFAULT_PICTURE_SETTINGS;
    return {
        pictureSource: oneOf(raw.pictureSource, PICTURE_SOURCES, DEFAULT_PICTURE_SETTINGS.pictureSource),
        pictureUrl: text(raw.pictureUrl),
        picturePath: text(raw.picturePath),
        pictureFit: oneOf(raw.pictureFit, PICTURE_FITS, DEFAULT_PICTURE_SETTINGS.pictureFit),
    };
}

export type PictureState =
    /** Nothing chosen yet. The widget says where to choose one. */
    | { kind: 'empty' }
    /**
     * Something was chosen and it cannot be shown: a path pointing at a note,
     * or an address in a scheme that is refused. Worth saying out loud — the
     * alternative is a blank card that looks exactly like an unconfigured one.
     */
    | { kind: 'unusable' }
    | { kind: 'ready'; src: string };

/**
 * What to render.
 *
 * `resolve` turns a vault path into something the webview can load — the caller
 * passes Obsidian's resolver, so this file needs no App and stays testable.
 *
 * A vault path is checked against the extension list before it is resolved:
 * Obsidian will happily hand back a resource path for a markdown note, and an
 * `<img>` pointed at one draws nothing at all.
 */
export function pictureState(
    settings: PictureSettings,
    resolve: (path: string) => string
): PictureState {
    if (settings.pictureSource === 'vault') {
        const path = settings.picturePath.trim();
        if (!path) return { kind: 'empty' };
        if (!isImagePath(path)) return { kind: 'unusable' };
        const src = imageSrc(resolve(path));
        return src ? { kind: 'ready', src } : { kind: 'unusable' };
    }

    const url = settings.pictureUrl.trim();
    if (!url) return { kind: 'empty' };
    const src = imageSrc(url);
    return src ? { kind: 'ready', src } : { kind: 'unusable' };
}
