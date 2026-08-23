/**
 * Dashboard grid — shared types and constants.
 *
 * The dashboard is a column grid (iOS-style). Widgets don't get a free
 * width/height: they pick one of a few size presets, so every widget's height is
 * a multiple of the row height and neighbouring cards always line up.
 *
 * Layout items store the *preset*, not w/h, so the concrete dimensions can be
 * retuned — or the column count changed — without rewriting saved layouts.
 */

export type WidgetSize = 'sm' | 'md' | 'lg';

export interface GridDims {
    /** Width in grid columns. */
    w: number;
    /** Height in grid rows. */
    h: number;
}

/** Default column count. Widgets are placed within `0 .. columns - w`. */
export const GRID_COLS = 4;

/**
 * Default height of a single grid row, in px. Chosen so the smallest preset
 * (2 rows = 256px) comfortably fits the densest compact widget — the collapsed
 * weather card — and `lg` (4 rows = 528px) fits the tasks list without
 * scrolling.
 */
export const ROW_HEIGHT = 120;

/** Default gap between cells, in px. Applies both horizontally and vertically. */
export const GRID_GAP = 16;

/** Below this viewport width the grid collapses to a single column. */
export const GRID_STACK_BREAKPOINT = 720;

/**
 * Narrowest a column may get before the grid gives up and stacks.
 *
 * The fixed breakpoint alone isn't enough once the column count is
 * user-configurable: six columns in a 760px pane are ~110px each, which is too
 * narrow to render anything useful in.
 */
export const MIN_COL_WIDTH = 120;

/** Whether a pane of `width` px should fall back to the one-column layout. */
export function shouldStack(width: number, columns: number, gap: number): boolean {
    if (width <= 0) return false;
    if (width < GRID_STACK_BREAKPOINT) return true;
    return (width - (columns - 1) * gap) / columns < MIN_COL_WIDTH;
}

/**
 * User-tunable grid geometry.
 *
 * Only the *frame* is configurable, not each widget's size: presets stay
 * relative to the column count (see {@link sizeDims}), so changing columns
 * re-flows an existing dashboard instead of invalidating it.
 */
export interface GridConfig {
    columns: number;
    rowHeight: number;
    gap: number;
    /**
     * Widest the dashboard canvas may get, in px. `0` means no limit — the
     * grid runs to the edges of whatever pane it's in.
     */
    maxWidth: number;
}

/** Default canvas width, matching the CSS fallback in `dashboard.css`. */
export const CANVAS_WIDTH = 920;

/**
 * Selectable canvas widths, narrowest first, ending in `0` — "full width".
 *
 * A fixed list rather than a free number: the useful values are few and far
 * apart, and "as wide as the pane" has to be reachable as the last step rather
 * than as some arbitrary large number.
 */
export const CANVAS_WIDTHS: readonly number[] = [720, 840, 920, 1040, 1200, 1400, 1600, 0];

export const DEFAULT_GRID_CONFIG: GridConfig = {
    columns: GRID_COLS,
    rowHeight: ROW_HEIGHT,
    gap: GRID_GAP,
    maxWidth: CANVAS_WIDTH,
};

/** Snap a stored canvas width onto the nearest offered step (0 stays "full"). */
export function normalizeCanvasWidth(value: unknown): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) return CANVAS_WIDTH;
    if (n === 0) return 0;
    return CANVAS_WIDTHS.filter((w) => w > 0).reduce((best, w) =>
        Math.abs(w - n) < Math.abs(best - n) ? w : best
    );
}

/** The next/previous canvas width in {@link CANVAS_WIDTHS}. */
export function stepCanvasWidth(current: number, direction: 1 | -1): number {
    const list = CANVAS_WIDTHS;
    const index = list.indexOf(normalizeCanvasWidth(current));
    const next = index + direction;
    return next >= 0 && next < list.length ? list[next] : current;
}

/** Bounds for each knob: `[min, max, step]`. */
export const GRID_LIMITS = {
    columns: [2, 6, 1],
    /** Roomy enough for a widget's header + a line of content at the low end. */
    rowHeight: [80, 200, 10],
    gap: [0, 32, 4],
} as const;

function clampTo(value: unknown, [min, max]: readonly [number, number, number], fallback: number): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/**
 * Coerce a stored config into a usable one. Settings come back from
 * `data.json`, so the values are untrusted — a hand-edited `columns: 0` would
 * otherwise divide the grid by zero.
 */
export function normalizeGridConfig(raw: Partial<GridConfig> | undefined): GridConfig {
    return {
        columns: clampTo(raw?.columns, GRID_LIMITS.columns, DEFAULT_GRID_CONFIG.columns),
        rowHeight: clampTo(raw?.rowHeight, GRID_LIMITS.rowHeight, DEFAULT_GRID_CONFIG.rowHeight),
        gap: clampTo(raw?.gap, GRID_LIMITS.gap, DEFAULT_GRID_CONFIG.gap),
        maxWidth:
            raw?.maxWidth === undefined
                ? DEFAULT_GRID_CONFIG.maxWidth
                : normalizeCanvasWidth(raw.maxWidth),
    };
}

/**
 * A preset's dimensions at a given column count.
 *
 * Presets are proportional rather than absolute: `sm` is half the grid, `md` the
 * full width, `lg` full width and twice as tall. Storing them as fixed column
 * counts would mean a "full width" widget covering two thirds of a 6-column
 * grid, and overflowing a 2-column one. Half rounds *down* so two `sm` widgets
 * always still fit side by side (on 5 columns, 3 + 3 would not).
 */
export function sizeDims(size: WidgetSize, columns: number = GRID_COLS): GridDims {
    const cols = Math.max(1, Math.round(columns));
    const half = Math.max(1, Math.floor(cols / 2));
    switch (size) {
        case 'sm':
            return { w: half, h: 2 };
        case 'lg':
            return { w: cols, h: 4 };
        case 'md':
        default:
            return { w: cols, h: 2 };
    }
}

/**
 * Tallest a single widget may be, in rows. Generous, but bounded: an unbounded
 * height would let one card push everything below it off the bottom of a long
 * dashboard with no obvious way back.
 */
export const MAX_ROWS = 12;

/** All presets, smallest first. */
export const WIDGET_SIZES: readonly WidgetSize[] = ['sm', 'md', 'lg'];

/**
 * One-letter shorthand for a preset, as the size buttons show it.
 *
 * Shared rather than per-component so nothing falls back to `size.toUpperCase()`
 * — "SM MD LG" reads as three unfamiliar words where "S M L" reads as a scale.
 */
export const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L' };

export interface WidgetLayoutItem {
    /** Widget id, matching a registered `DashboardWidgetDefinition`. */
    id: string;
    /** Column index of the left edge. */
    x: number;
    /** Row index of the top edge. */
    y: number;
    size: WidgetSize;
    /**
     * Explicit width in columns, overriding the preset's.
     *
     * Without this the column count is very nearly a no-op: every preset is
     * "half the grid" or "all of it", and half of four columns looks exactly
     * like half of six. An explicit span is what turns extra columns into extra
     * layouts — three 2-wide cards in a row on a 6-column grid. Absent = follow
     * the preset, which is what picking a preset resets it to.
     */
    w?: number;
    /**
     * Explicit height in rows, overriding the preset's. Same rules as `w`:
     * absent means follow the preset, and choosing a preset clears it.
     */
    h?: number;
}

/** A resolved rectangle in grid units. */
export interface GridRect extends GridDims {
    x: number;
    y: number;
}

/**
 * A layout item's actual dimensions: its explicit width if it has one, else the
 * preset's. Always clamped to the grid, so narrowing the grid can't leave a
 * widget wider than the whole thing.
 */
export function dimsOf(item: WidgetLayoutItem, columns: number = GRID_COLS): GridDims {
    const cols = Math.max(1, Math.round(columns));
    const preset = sizeDims(item.size, cols);
    return {
        w: item.w == null ? preset.w : Math.min(cols, Math.max(1, Math.round(item.w))),
        h: item.h == null ? preset.h : Math.min(MAX_ROWS, Math.max(1, Math.round(item.h))),
    };
}

/** Resolve a layout item to its rectangle. */
export function rectOf(item: WidgetLayoutItem, columns: number = GRID_COLS): GridRect {
    const { w, h } = dimsOf(item, columns);
    return { x: item.x, y: item.y, w, h };
}

/** Pixel height of a widget spanning `h` rows (gaps between rows included). */
export function pxHeight(h: number, rowHeight: number = ROW_HEIGHT, gap: number = GRID_GAP): number {
    return h * rowHeight + (h - 1) * gap;
}
