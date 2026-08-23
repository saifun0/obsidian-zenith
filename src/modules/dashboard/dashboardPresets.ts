import type { GridConfig, WidgetLayoutItem } from './grid/gridTypes';
import { normalizeGridConfig } from './grid/gridTypes';
import type { WidgetBundle } from './grid/bundleTypes';

/**
 * Saved arrangements of the dashboard.
 *
 * A "layout" is not one setting but five: where the widgets sit, which of them
 * are grouped into bundles, the order they fall into on a phone, which ones
 * were removed, and the geometry of the grid itself. Saving one means capturing
 * all five together — a preset that restored positions but not the column count
 * would put every widget in the wrong place.
 *
 * Everything here is a pure function over plain data. The component decides
 * when to save; this file decides what a save *is*.
 */

/** The settings a preset owns, in the shape the store stores them. */
export interface LayoutSnapshot {
    dashboardLayout: WidgetLayoutItem[];
    dashboardBundles: WidgetBundle[];
    dashboardStackOrder: string[];
    hiddenWidgetIds: string[];
    dashboardGrid: GridConfig;
}

export interface DashboardPreset extends LayoutSnapshot {
    id: string;
    name: string;
    /** ISO timestamp of the last write, for "saved 5 minutes ago". */
    savedAt: string;
}

/** Longest name we'll store. Long enough for a sentence, short enough for a chip. */
export const MAX_PRESET_NAME = 60;

/** How many arrangements one dashboard may keep. */
export const MAX_PRESETS = 12;

/**
 * A deep copy of the arrangement.
 *
 * Copied rather than referenced because the store's arrays are mutated in place
 * by the drag handlers — a preset holding the live array would quietly follow
 * every later change, which is the opposite of saving.
 */
export function captureLayout(source: LayoutSnapshot): LayoutSnapshot {
    return {
        dashboardLayout: source.dashboardLayout.map((item) => ({ ...item })),
        dashboardBundles: source.dashboardBundles.map((bundle) => ({
            ...bundle,
            members: [...bundle.members],
        })),
        dashboardStackOrder: [...source.dashboardStackOrder],
        hiddenWidgetIds: [...source.hiddenWidgetIds],
        dashboardGrid: { ...normalizeGridConfig(source.dashboardGrid) },
    };
}

const layoutKey = (items: WidgetLayoutItem[]): string =>
    items
        .map((i) => `${i.id}:${i.x},${i.y},${i.size},${i.w ?? '-'},${i.h ?? '-'}`)
        .sort()
        .join('|');

const bundleKey = (bundles: WidgetBundle[]): string =>
    bundles
        .map((b) => `${b.id}:${b.members.join(',')}:${b.activeId}:${b.name ?? ''}`)
        .sort()
        .join('|');

/**
 * Whether the dashboard still looks the way the preset saved it.
 *
 * Compared by content, not by identity, and order-insensitively where order
 * carries no meaning: dragging a widget away and back leaves a differently
 * ordered array describing exactly the same arrangement, and calling that
 * "modified" would leave an asterisk nobody could clear.
 */
export function matchesLayout(a: LayoutSnapshot, b: LayoutSnapshot): boolean {
    return (
        layoutKey(a.dashboardLayout) === layoutKey(b.dashboardLayout) &&
        bundleKey(a.dashboardBundles) === bundleKey(b.dashboardBundles) &&
        // Stack order *is* an order, and hidden widgets are a set.
        a.dashboardStackOrder.join(',') === b.dashboardStackOrder.join(',') &&
        [...a.hiddenWidgetIds].sort().join(',') === [...b.hiddenWidgetIds].sort().join(',') &&
        JSON.stringify(normalizeGridConfig(a.dashboardGrid)) ===
            JSON.stringify(normalizeGridConfig(b.dashboardGrid))
    );
}

/** Trim, collapse whitespace and cap the length. Empty means "no name given". */
export function cleanPresetName(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_PRESET_NAME);
}

/**
 * A name no other preset is using.
 *
 * Two arrangements both called "Work" are two arrangements you have to open to
 * tell apart, so a repeat gets a numbered suffix instead of being rejected —
 * the user was trying to save, not to fill in a form correctly.
 */
export function uniquePresetName(
    raw: string,
    presets: DashboardPreset[],
    exceptId?: string
): string {
    const base = cleanPresetName(raw) || 'Layout';
    const taken = new Set(
        presets.filter((p) => p.id !== exceptId).map((p) => p.name.toLocaleLowerCase())
    );
    if (!taken.has(base.toLocaleLowerCase())) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base} ${n}`.slice(0, MAX_PRESET_NAME);
        if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
    }
}

/** An id that doesn't collide, without needing a uuid library. */
function newPresetId(presets: DashboardPreset[]): string {
    const used = new Set(presets.map((p) => p.id));
    for (let n = 1; ; n++) {
        const id = `layout-${n}`;
        if (!used.has(id)) return id;
    }
}

/** Save the current arrangement as a new preset. Returns the list and the new id. */
export function addPreset(
    presets: DashboardPreset[],
    name: string,
    snapshot: LayoutSnapshot,
    now: string
): { presets: DashboardPreset[]; id: string } {
    const id = newPresetId(presets);
    const preset: DashboardPreset = {
        id,
        name: uniquePresetName(name, presets),
        savedAt: now,
        ...captureLayout(snapshot),
    };
    // Oldest goes when the shelf is full: a cap that refused to save would lose
    // the arrangement the user is looking at rather than one they've forgotten.
    const kept = [...presets, preset];
    return {
        presets: kept.length > MAX_PRESETS ? kept.slice(kept.length - MAX_PRESETS) : kept,
        id,
    };
}

/** Overwrite one preset with the current arrangement. */
export function updatePreset(
    presets: DashboardPreset[],
    id: string,
    snapshot: LayoutSnapshot,
    now: string
): DashboardPreset[] {
    return presets.map((p) =>
        p.id === id ? { ...p, savedAt: now, ...captureLayout(snapshot) } : p
    );
}

export function renamePreset(
    presets: DashboardPreset[],
    id: string,
    name: string
): DashboardPreset[] {
    const clean = cleanPresetName(name);
    if (!clean) return presets;
    return presets.map((p) =>
        p.id === id ? { ...p, name: uniquePresetName(clean, presets, id) } : p
    );
}

export function removePreset(presets: DashboardPreset[], id: string): DashboardPreset[] {
    return presets.filter((p) => p.id !== id);
}

/** The settings patch that puts a saved arrangement back on screen. */
export function applyPreset(preset: DashboardPreset): LayoutSnapshot {
    return captureLayout(preset);
}

/**
 * Read a preset list back from disk.
 *
 * `data.json` is a file the user can edit, so anything here may be missing or
 * the wrong type. A malformed entry is dropped rather than repaired: a preset
 * with no layout is not an arrangement, and guessing one would put widgets
 * somewhere nobody chose.
 */
export function normalizePresets(raw: unknown): DashboardPreset[] {
    if (!Array.isArray(raw)) return [];
    const out: DashboardPreset[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const p = entry as Partial<DashboardPreset>;
        if (typeof p.id !== 'string' || !p.id) continue;
        if (!Array.isArray(p.dashboardLayout)) continue;
        out.push({
            id: p.id,
            name: cleanPresetName(typeof p.name === 'string' ? p.name : '') || p.id,
            savedAt: typeof p.savedAt === 'string' ? p.savedAt : '',
            dashboardLayout: p.dashboardLayout.filter(
                (i): i is WidgetLayoutItem =>
                    !!i && typeof i.id === 'string' && typeof i.x === 'number' && typeof i.y === 'number'
            ),
            dashboardBundles: Array.isArray(p.dashboardBundles)
                ? p.dashboardBundles.filter(
                      (b): b is WidgetBundle => !!b && typeof b.id === 'string' && Array.isArray(b.members)
                  )
                : [],
            dashboardStackOrder: Array.isArray(p.dashboardStackOrder)
                ? p.dashboardStackOrder.filter((id): id is string => typeof id === 'string')
                : [],
            hiddenWidgetIds: Array.isArray(p.hiddenWidgetIds)
                ? p.hiddenWidgetIds.filter((id): id is string => typeof id === 'string')
                : [],
            dashboardGrid: normalizeGridConfig(p.dashboardGrid),
        });
        if (out.length >= MAX_PRESETS) break;
    }
    return out;
}
