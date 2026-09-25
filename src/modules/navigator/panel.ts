/**
 * The side panel's data: the buttons the user put in it, and the order the
 * navigation is listed in. Pure, so the rules are testable without Obsidian.
 */

/** A button in the side panel: a command to run, named and drawn as the user chose. */
export interface PanelButton {
    /** Full Obsidian command id: "zenith:quick-add-task", or another plugin's. */
    command: string;
    /** The user's own name for it. Absent means the command's own. */
    label?: string;
    /** The user's own icon. Absent means the command's own, or a generic one. */
    icon?: string;
}

/**
 * What a new panel starts with: the things done every day rather than once.
 * A button whose module is off stays hidden until it is switched on, so the
 * list can name modules the user may not run.
 */
export const DEFAULT_PANEL_BUTTONS: PanelButton[] = [
    { command: 'zenith:quick-add-task', icon: 'plus' },
    { command: 'zenith:search', icon: 'search' },
    { command: 'zenith:mark-current-prayer', icon: 'moon-star' },
    // The notes, not the settings: those merge in the background by themselves.
    { command: 'zenith:sync-files-now', icon: 'refresh-cw' },
];

/** Shown for a command that brought no icon and was given none. */
export const FALLBACK_BUTTON_ICON = 'terminal';

/**
 * Buttons as read back from `data.json`, which the user can edit by hand:
 * anything that is not a button is dropped, and a command listed twice keeps
 * its first button — the picker never offers one that is already there.
 */
export function normalizePanelButtons(raw: unknown): PanelButton[] {
    if (!Array.isArray(raw)) return DEFAULT_PANEL_BUTTONS.map((b) => ({ ...b }));
    const seen = new Set<string>();
    const out: PanelButton[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const { command, label, icon } = item as Record<string, unknown>;
        if (typeof command !== 'string' || !command || seen.has(command)) continue;
        seen.add(command);
        const button: PanelButton = { command };
        if (typeof label === 'string' && label.trim()) button.label = label.trim();
        if (typeof icon === 'string' && icon) button.icon = icon;
        out.push(button);
    }
    return out;
}

/**
 * Items in the user's order. Ones the order doesn't name — a module installed
 * since it was saved — follow in their own order rather than waiting to be
 * found; ids the order names but nothing has any more are skipped.
 */
export function applyOrder<T extends { id: string }>(
    items: readonly T[],
    order: readonly string[]
): T[] {
    const rank = new Map(order.map((id, i) => [id, i]));
    const listed = items.filter((item) => rank.has(item.id));
    const rest = items.filter((item) => !rank.has(item.id));
    listed.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    return [...listed, ...rest];
}

/** A copy of the list with one item moved from one place to another. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const out = [...list];
    if (from < 0 || from >= out.length) return out;
    const [item] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
    return out;
}
