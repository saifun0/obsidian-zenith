/** The arranging panel's width — `--zenith-arrange-w` in the stylesheet. */
export const PANEL_WIDTH_PX = 320;

/**
 * Whether a pane can hold the board, the arranging panel and the rail in one
 * line without the panel covering any of the board.
 *
 * Open, the panel stands between the board and the rail, and the board moves
 * over for it rather than being narrowed (see `.has-panel` in the grid's
 * stylesheet, which does the placing). This is the same sum, asked once: it
 * decides whether the panel opens by itself with arrange mode, or waits to be
 * asked for because it would have to lie over part of the board.
 *
 * It used to be a fixed pane width, 1240px, which is the answer for one canvas
 * width only: a 920px board in a 1260px pane was "wide enough", the panel
 * opened, and the board was squeezed by its width into a single column.
 *
 * `gutter` is what the board keeps clear either side of itself: the pane's own
 * inset plus the rail and its gap. That is what lets the line be summed from
 * what is on the page without knowing the inset and the gap apart — the line is
 * board + gap + panel + gap + rail, inset either side, which is the board, the
 * panel and both gutters less one rail.
 */
export function panelFitsBeside(pane: number, board: number, gutter: number, rail: number): boolean {
    return board > 0 && board + PANEL_WIDTH_PX + 2 * gutter - rail <= pane;
}
