/**
 * More than one of the same widget on one board.
 *
 * Most widgets are singular: two clocks tell the same time, two weather cards
 * name the same city. A few are not — a picture is only ever *a* picture — and
 * for those the board needs to hold several copies, each configured on its own.
 *
 * The layout already knows how to carry an id that is not a registered widget:
 * a bundle sits in `dashboardLayout` as `bundle:<n>` and resolves to its
 * membership elsewhere. Copies follow the same road. A layout id is either the
 * widget's own id — the first copy, so every board written before this still
 * reads — or that id with `#<n>` after it. Everything that needs the widget
 * behind a layout id asks {@link widgetIdOf}; everything that needs to tell two
 * copies apart uses the layout id itself, which is what the grid, the drag and
 * the per-copy settings are all keyed by.
 *
 * `#` is safe as the separator: widget ids are `module.widget` by convention and
 * the registry never mints one containing it.
 */

/** Separates a widget's id from the copy's number: `picture.frame#2`. */
export const COPY_SEP = '#';

/** The registered widget behind a layout id. `picture.frame#2` → `picture.frame`. */
export function widgetIdOf(layoutId: string): string {
    const cut = layoutId.indexOf(COPY_SEP);
    return cut === -1 ? layoutId : layoutId.slice(0, cut);
}

/** Whether a layout id names a further copy rather than the first one. */
export function isCopyId(layoutId: string): boolean {
    return layoutId.includes(COPY_SEP);
}

/**
 * A layout id for one more copy of `widgetId`.
 *
 * Numbering starts at 2 because the first copy is the bare id — the one every
 * saved board and every bundle already refers to.
 */
export function newCopyId(widgetId: string, used: Iterable<string>): string {
    const taken = new Set(used);
    for (let n = 2; ; n++) {
        const id = `${widgetId}${COPY_SEP}${n}`;
        if (!taken.has(id)) return id;
    }
}
