/**
 * Widget bundles — several widgets sharing one cell of the dashboard grid.
 *
 * A bundle occupies a cell exactly like a widget does: it appears in
 * `dashboardLayout` as an ordinary `WidgetLayoutItem` whose id is prefixed with
 * `bundle:`. Only the *membership* lives in `settings.bundles`.
 *
 * That split is deliberate. The design sketch put `w`/`h` on the bundle itself,
 * but the layout item already carries position, preset and manual span, and two
 * places holding the same geometry is how a grid ends up disagreeing with
 * itself. Everything the grid engine already does — compaction, repacking on a
 * column change, drag placement — then works on bundles for free, because to the
 * engine a bundle is just an item with an unusual id.
 */

import type { WidgetSize } from './gridTypes';
import { widgetIdOf } from './widgetInstances';

/** Marks a layout id as a bundle. Widget ids are `module.widget`, never this. */
export const BUNDLE_PREFIX = 'bundle:';

/** Widgets a bundle may hold before the rail stops being readable. */
export const BUNDLE_MAX_MEMBERS = 8;

/**
 * Pips the rail draws before collapsing the tail into "+N".
 *
 * Six is where the design put the limit: 6×5px + 5×4px = 50px of header, which
 * is what a narrow card can spare next to the widget's own title.
 */
export const BUNDLE_MAX_PIPS = 6;

export interface WidgetBundle {
    /** Layout id, `bundle:<n>` — matches an item in `dashboardLayout`. */
    id: string;
    /** Widget ids in rail order, left to right. */
    members: string[];
    /** Which member is on top. Always one of `members`. */
    activeId: string;
    /** User-given label. Shown only when expanded or while arranging. */
    name?: string;
}

export const isBundleId = (id: string): boolean => id.startsWith(BUNDLE_PREFIX);

/** A fresh bundle id that doesn't collide with an existing one. */
export function newBundleId(existing: WidgetBundle[]): string {
    const used = new Set(existing.map((b) => b.id));
    for (let n = 1; ; n++) {
        const id = `${BUNDLE_PREFIX}${n}`;
        if (!used.has(id)) return id;
    }
}

/**
 * Presets a bundle can offer: the intersection of what its members support.
 *
 * When the intersection is empty the bundle keeps the full set — the design
 * chose to allow the size anyway and render the odd member compactly, because
 * forbidding it would make "Clock + Tasks" impossible to bundle at all, and
 * those two are exactly the pair someone wants to pair.
 */
export function bundleSizes(
    members: string[],
    sizesById: Map<string, { sizes: readonly WidgetSize[]; defaultSize: WidgetSize }>
): { sizes: readonly WidgetSize[]; defaultSize: WidgetSize } {
    const all: WidgetSize[] = ['sm', 'md', 'lg'];
    const supported = members
        .map((id) => sizesById.get(id)?.sizes)
        .filter((s): s is readonly WidgetSize[] => !!s);

    if (supported.length === 0) return { sizes: all, defaultSize: 'md' };

    const shared = all.filter((size) => supported.every((list) => list.includes(size)));
    const sizes = shared.length > 0 ? shared : all;
    return { sizes, defaultSize: sizes.includes('md') ? 'md' : sizes[0] };
}

/** Whether `widgetId` can render at `size` — false means the compact fallback. */
export function supportsSize(
    widgetId: string,
    size: WidgetSize,
    sizesById: Map<string, { sizes: readonly WidgetSize[] }>
): boolean {
    const info = sizesById.get(widgetId);
    return !info || info.sizes.includes(size);
}

/**
 * Coerce stored bundles into usable ones.
 *
 * Settings come back from `data.json`, so this is untrusted input; it also has
 * to survive a module being disabled, which takes its widgets out of the
 * registry. Members that no longer exist are dropped, and a bundle left with
 * fewer than two members stops being a bundle — the design is explicit that a
 * one-widget bundle dissolves rather than lingering as an empty shell.
 *
 * Returns the surviving bundles plus the widget ids that were freed, so the
 * caller can put them back on the grid instead of losing them.
 */
export function normalizeBundles(
    raw: unknown,
    registeredIds: Set<string>
): { bundles: WidgetBundle[]; released: string[] } {
    const bundles: WidgetBundle[] = [];
    const released: string[] = [];
    if (!Array.isArray(raw)) return { bundles, released };

    const seenIds = new Set<string>();
    const claimed = new Set<string>();

    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const { id, members, activeId, name } = entry as Partial<WidgetBundle>;
        if (typeof id !== 'string' || !isBundleId(id) || seenIds.has(id)) continue;
        if (!Array.isArray(members)) continue;

        // A widget belongs to at most one bundle: two bundles claiming the same
        // one would each render it, and the grid would show it twice.
        // `widgetIdOf` because a member may be a further copy of a widget —
        // `picture.frame#2` — and the registry only knows the widget it is a
        // copy of. Checked for the bare id, kept under its own.
        const kept = members.filter(
            (m): m is string =>
                typeof m === 'string' && registeredIds.has(widgetIdOf(m)) && !claimed.has(m)
        );
        const unique = [...new Set(kept)].slice(0, BUNDLE_MAX_MEMBERS);

        if (unique.length < 2) {
            released.push(...unique);
            continue;
        }

        unique.forEach((m) => claimed.add(m));
        seenIds.add(id);
        bundles.push({
            id,
            members: unique,
            activeId: typeof activeId === 'string' && unique.includes(activeId) ? activeId : unique[0],
            ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
        });
    }

    return { bundles, released };
}

/** The bundle holding `widgetId`, if any. */
export function bundleOf(bundles: WidgetBundle[], widgetId: string): WidgetBundle | undefined {
    return bundles.find((b) => b.members.includes(widgetId));
}

/** Every widget id currently inside a bundle. */
export function bundledWidgetIds(bundles: WidgetBundle[]): Set<string> {
    return new Set(bundles.flatMap((b) => b.members));
}

// ── Mutations (pure) ─────────────────────────────────

/** Put `widgetId` at the end of the rail and make it active. */
export function addMember(bundles: WidgetBundle[], bundleId: string, widgetId: string): WidgetBundle[] {
    return bundles.map((b) =>
        b.id === bundleId && !b.members.includes(widgetId) && b.members.length < BUNDLE_MAX_MEMBERS
            ? { ...b, members: [...b.members, widgetId], activeId: widgetId }
            : b
    );
}

/**
 * Take `widgetId` out. A bundle down to one member dissolves — the caller gets
 * the leftover id back so it can be put on the grid in the bundle's place.
 */
export function removeMember(
    bundles: WidgetBundle[],
    bundleId: string,
    widgetId: string
): { bundles: WidgetBundle[]; dissolvedInto?: string } {
    const target = bundles.find((b) => b.id === bundleId);
    if (!target || !target.members.includes(widgetId)) return { bundles };

    const members = target.members.filter((m) => m !== widgetId);
    if (members.length < 2) {
        return {
            bundles: bundles.filter((b) => b.id !== bundleId),
            dissolvedInto: members[0],
        };
    }

    return {
        bundles: bundles.map((b) =>
            b.id === bundleId
                ? { ...b, members, activeId: members.includes(b.activeId) ? b.activeId : members[0] }
                : b
        ),
    };
}

/** Move a member to another slot in the rail. */
export function reorderMembers(
    bundles: WidgetBundle[],
    bundleId: string,
    widgetId: string,
    index: number
): WidgetBundle[] {
    return bundles.map((b) => {
        if (b.id !== bundleId || !b.members.includes(widgetId)) return b;
        const rest = b.members.filter((m) => m !== widgetId);
        const to = Math.max(0, Math.min(index, rest.length));
        return { ...b, members: [...rest.slice(0, to), widgetId, ...rest.slice(to)] };
    });
}

/** Switch which member is on top. */
export function setActive(bundles: WidgetBundle[], bundleId: string, widgetId: string): WidgetBundle[] {
    return bundles.map((b) =>
        b.id === bundleId && b.members.includes(widgetId) ? { ...b, activeId: widgetId } : b
    );
}

/** Rename, or clear the name when given an empty string. */
export function renameBundle(bundles: WidgetBundle[], bundleId: string, name: string): WidgetBundle[] {
    const trimmed = name.trim();
    return bundles.map((b) => {
        if (b.id !== bundleId) return b;
        const next = { ...b };
        if (trimmed) next.name = trimmed;
        else delete next.name;
        return next;
    });
}
