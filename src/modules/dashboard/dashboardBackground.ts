import type { CSSProperties } from 'react';
import { IMAGE_EXTENSIONS, SAFE_IMAGE_SCHEME, isImagePath } from '../../core/imageSource';

/**
 * The dashboard's wallpaper, as data.
 *
 * Everything here is a pure function of the settings, which is what lets the
 * awkward parts be tested rather than eyeballed: a user-supplied address going
 * into a `url()`, and a picture that has to stay behind text without eating it.
 *
 * The image is one absolutely-positioned layer inside the board, not a
 * `background` on the board itself and not `background-attachment: fixed`.
 * Fixed attachment is the obvious way to get a wallpaper that does not scroll
 * and it is broken on iOS — Obsidian runs on phones, so the effect that only
 * works on a desktop is not the effect to build.
 */

export type DashboardBgSource = 'none' | 'url' | 'vault';
export type DashboardBgFit = 'cover' | 'contain' | 'tile';

export const DASHBOARD_BG_SOURCES: readonly DashboardBgSource[] = ['none', 'url', 'vault'] as const;
export const DASHBOARD_BG_FITS: readonly DashboardBgFit[] = ['cover', 'contain', 'tile'] as const;

// What a picture is, and which addresses one may come from, are the picture
// widget's questions too — so they live in core and are re-exported here for
// everything that already asks the wallpaper.
export { IMAGE_EXTENSIONS, isImagePath };

/** Characters that could end the `url("` early, plus the whitespace CSS folds. */
const CSS_URL_UNSAFE = /["'()\\\s]/g;

/**
 * A settings string as a CSS `url()`, or empty when it cannot be one.
 *
 * Two things are going on. The scheme check is the real guard: an address that
 * is not one of the kinds above never reaches the stylesheet at all. The
 * escaping is the belt to it — the value cannot close the `url("` and open a
 * declaration of its own, whatever the string was trying to do.
 *
 * Only the dangerous characters are encoded, deliberately. Running the whole
 * address through `encodeURI` was the first attempt and it is wrong: that
 * escapes `%` as well, so Obsidian's own resource path — which arrives already
 * percent-encoded — came back with every `%20` turned into `%2520`, and the
 * picture simply did not load.
 */
export function cssUrl(raw: string): string {
    const url = raw.trim();
    if (!url || !SAFE_IMAGE_SCHEME.test(url)) return '';
    const safe = url.replace(
        CSS_URL_UNSAFE,
        (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`
    );
    return `url("${safe}")`;
}

export interface DashboardBgSettings {
    dashboardBgSource: DashboardBgSource;
    dashboardBgUrl: string;
    dashboardBgPath: string;
    dashboardBgFit: DashboardBgFit;
    /** Percent of black laid over the picture, 0–90. */
    dashboardBgDim: number;
    /** Pixels of blur on the picture, 0–24. */
    dashboardBgBlur: number;
    /**
     * How solid the widget cards stay over it, 30–100. A hundred is opaque,
     * which is the old on/off switch's "off" — a slider says the same thing
     * and everything in between.
     */
    dashboardCardOpacity: number;
    /** Show it on a phone too. */
    dashboardBgMobile: boolean;
}

/**
 * The picture's address, whichever way it was given.
 *
 * `resolve` turns a vault path into something the webview can load — the caller
 * passes Obsidian's resolver, so this file needs no App and stays testable.
 * A path that is not a picture returns nothing: a stylesheet pointed at a
 * markdown note fails silently and looks exactly like the setting being ignored.
 */
export function backgroundAddress(
    settings: DashboardBgSettings,
    resolve: (path: string) => string
): string {
    if (settings.dashboardBgSource === 'url') return settings.dashboardBgUrl.trim();
    if (settings.dashboardBgSource === 'vault') {
        const path = settings.dashboardBgPath.trim();
        return path && isImagePath(path) ? resolve(path) : '';
    }
    return '';
}

const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/**
 * Custom properties for the layer, or null when there is no wallpaper.
 *
 * Properties rather than a finished `background`, so the stylesheet keeps the
 * decisions that belong to it — where the layer sits, how the scrim is built,
 * what a phone does differently — and this only supplies the four values that
 * come from the form.
 */
export function backgroundStyle(
    settings: DashboardBgSettings,
    resolve: (path: string) => string
): CSSProperties | null {
    const image = cssUrl(backgroundAddress(settings, resolve));
    if (!image) return null;

    const tile = settings.dashboardBgFit === 'tile';
    return {
        '--zenith-dash-bg': image,
        '--zenith-dash-bg-size': tile ? 'auto' : settings.dashboardBgFit,
        '--zenith-dash-bg-repeat': tile ? 'repeat' : 'no-repeat',
        // A scrim the text can be read through. Without one a bright photograph
        // makes every muted label on the board disappear, and muted labels are
        // most of what a dashboard is.
        '--zenith-dash-bg-dim': String(clamp(settings.dashboardBgDim, 0, 90) / 100),
        '--zenith-dash-bg-blur': `${clamp(settings.dashboardBgBlur, 0, 24)}px`,
        // A percentage, because that is what `color-mix` takes.
        '--zenith-card-opacity': `${clamp(settings.dashboardCardOpacity, 30, 100)}%`,
    } as CSSProperties;
}

/** Classes the board wears while a wallpaper is on, for the stylesheet to hook. */
export function backgroundClasses(settings: DashboardBgSettings, active: boolean): string {
    if (!active) return '';
    return [
        'has-bg',
        // Fully solid cards want none of the glass machinery — no translucency
        // to see through, and no reason to pay for a backdrop filter per card.
        clamp(settings.dashboardCardOpacity, 30, 100) < 100 ? 'has-bg-glass' : '',
        // A filter costs a compositor layer whether or not it blurs anything,
        // so zero is expressed by the class being absent rather than by
        // `blur(0)`.
        settings.dashboardBgBlur > 0 ? 'has-bg-blur' : '',
        settings.dashboardBgMobile ? '' : 'no-bg-mobile',
    ]
        .filter(Boolean)
        .join(' ');
}
