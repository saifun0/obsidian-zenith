import { addIcon } from 'obsidian';

/**
 * Zenith's own mark: the sun's ring, the point at the top of it, and a Z.
 *
 * It is what the ribbon shows. Until it was drawn the ribbon borrowed Lucide's
 * `brain`, which says nothing about a dashboard and which other plugins use.
 * The same drawing is the logo in the README (docs/images/logo.svg), there on
 * a tile and in white.
 */
export const ZENITH_ICON = 'zenith';

/**
 * Drawn on Lucide's 24-unit grid, in its manner: lines, round ends, no fills
 * but the point.
 *
 * Obsidian wraps a registered icon in a `0 0 100 100` box, so the drawing is
 * scaled up to it rather than redrawn — and the stroke width is left unsaid,
 * so that it is the one Obsidian gives every icon (`--icon-stroke`, which the
 * user can change) and comes out as heavy as its neighbours in the ribbon.
 */
const DRAWING =
    '<g transform="scale(4.16667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8.74 2.54A10 10 0 1 0 15.26 2.54"/>' +
    '<circle cx="12" cy="2.2" r="1.4" fill="currentColor" stroke="none"/>' +
    '<path d="M8.5 8.5h7l-7 7h7"/>' +
    '</g>';

/** Make the mark known to Obsidian. Safe to call again: the last drawing wins. */
export function registerZenithIcon(): void {
    addIcon(ZENITH_ICON, DRAWING);
}
