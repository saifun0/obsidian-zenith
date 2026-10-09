import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';
import { createPortal } from 'react-dom';
import { Layers } from 'lucide-react';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { moduleHasSettings, openZenithSettings } from '../../../settings/openSettings';
import { useTranslation } from '../../../core/i18n';
import {
    prettifyWidgetId,
    widgetDescription,
    widgetLabel,
    useDashboardWidgets,
    widgetSizes,
} from '../widgets';
import {
    addItem,
    bottomOf,
    layoutsEqual,
    moveItem,
    reconcileLayout,
    removeItem,
    repack,
    setHeight,
    setWidth,
    resizeItem,
    sortItems,
    stackOrder,
    type WidgetSizeInfo,
    fitLayout,
    setFixed,
} from '../grid/gridEngine';
import { useGridDrag } from '../grid/useGridDrag';
import {
    MAX_ROWS,
    dimsOf,
    normalizeGridConfig,
    shouldStack,
    pxHeight,
    type GridConfig,
    type WidgetLayoutItem,
} from '../grid/gridTypes';
import {
    BUNDLE_MAX_MEMBERS,
    addMember,
    bundleSizes,
    bundledWidgetIds,
    isBundleId,
    newBundleId,
    normalizeBundles,
    removeMember,
    renameBundle,
    reorderMembers,
    setActive,
    type WidgetBundle,
} from '../grid/bundleTypes';
import { GridWidget } from './GridWidget';
import { BundleCard, BundlePips } from './BundleCard';
import { BundleInspector } from './BundleInspector';
import { AddWidgetSheet, type AddableWidget } from './AddWidgetSheet';
import { ArrangePanel, type ArrangeTab } from './ArrangePanel';
import { isCopyId, newCopyId, widgetIdOf } from '../grid/widgetInstances';
import { cardNameOf, withoutWidgetConfig } from '../widgetConfig';
import { MemberSettings } from './MemberSettings';
import { GridSettingsBar } from './GridSettingsBar';
import { LayoutPresetsBar } from './LayoutPresetsBar';
import { featureEnabled } from '../../../core/features';
import { useFeature } from '../../../core/useFeature';

/**
 * Arrow keys nudge the focused widget one cell — the keyboard equivalent of
 * dragging, so arranging doesn't require a pointer at all.
 */
const ARROW_DELTA: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

/** Track an element's content width (0 until first measure). */
function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T>): number {
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        setWidth(el.getBoundingClientRect().width);
        const ro = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect.width ?? 0;
            setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);

    return width;
}

/**
 * Running pixel tops for a one-column stack of the given items.
 *
 * `needed` is what the cards that follow their content want, in px. In one
 * column there is nothing beside a card to line up with, so such a card is
 * exactly as tall as its content — no rounding up to a row — and never taller
 * than the height it was given.
 */
function stackGeometry(
    items: WidgetLayoutItem[],
    cfg: GridConfig,
    needed?: ReadonlyMap<string, number>
): { tops: number[]; heights: number[]; total: number } {
    const heights = items.map((i) => {
        const ceiling = pxHeight(dimsOf(i, cfg.columns).h, cfg.rowHeight, cfg.gap);
        const px = i.fixed ? undefined : needed?.get(i.id);
        return px === undefined ? ceiling : Math.min(ceiling, Math.max(px, 1));
    });
    const tops: number[] = [];
    let y = 0;
    for (const h of heights) {
        tops.push(y);
        y += h + cfg.gap;
    }
    return { tops, heights, total: Math.max(0, y - cfg.gap) };
}

/** The arranging panel, when it is open: where to draw it and which section. */
export interface ArrangePanelSlot {
    host: HTMLElement;
    tab: ArrangeTab;
    onTab: (tab: ArrangeTab) => void;
    onClose: () => void;
}

interface DashboardGridProps {
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
    panel: ArrangePanelSlot | null;
}

/**
 * DashboardGrid — renders the widget grid from the saved layout.
 *
 * The saved layout is reconciled against what's actually registered on every
 * render (see `reconcileLayout`): newly registered widgets get auto-placed,
 * widgets from unloaded modules drop out, and the repaired result is written
 * back so the two never drift apart.
 *
 * Below `GRID_STACK_BREAKPOINT` the grid becomes a single column. That view has
 * its own order (`dashboardStackOrder`) so rearranging on a phone doesn't
 * rewrite the grid arranged on a desktop. Both views position their cards
 * absolutely, which lets the same drag code serve each of them.
 */
export const DashboardGrid: FC<DashboardGridProps> = ({ editing, onEditingChange, panel }) => {
    /* One card at a time: two open settings faces would be two panels
       competing for the same attention, and the whole point of putting them
       on the card is that there is only ever one. */
    const [flippedId, setFlippedId] = useState<string | null>(null);
    /* The card the gallery has just put on the board. It is added wherever
       there is room, which on a long board is often off screen — so it is
       brought into view and marked for a moment, rather than left for the
       user to go and look for. */
    const [freshId, setFreshId] = useState<string | null>(null);
    /* What each card that follows its content has said it needs, in px. The
       cards report it (see `GridWidget`); this is only where it is kept. */
    const [needed, setNeeded] = useState<ReadonlyMap<string, number>>(() => new Map());
    const reportNeeded = useCallback((id: string, px: number) => {
        setNeeded((prev) => (prev.get(id) === px ? prev : new Map(prev).set(id, px)));
    }, []);

    const t = useTranslation();
    const { plugin } = useApp();
    const allRegistered = useDashboardWidgets();
    // A widget whose feature is off is gone the same way a disabled module's
    // widget is. The selector returns a string so a settings write that does
    // not flip any of these features does not re-render the board.
    const switchedOff = useZenithStore((s) =>
        allRegistered
            .filter((def) => def.feature && !featureEnabled(s.settings, def.feature))
            .map((def) => def.id)
            .join('\n')
    );
    const registered = useMemo(() => {
        const off = new Set(switchedOff.split('\n'));
        return allRegistered.filter((def) => !off.has(def.id));
    }, [allRegistered, switchedOff]);
    const presetsOn = useFeature('dashboard.presets');
    const savedLayout = useZenithStore((s) => s.settings.dashboardLayout);
    const savedBundles = useZenithStore((s) => s.settings.dashboardBundles);
    const savedStackOrder = useZenithStore((s) => s.settings.dashboardStackOrder);
    const hiddenWidgetIds = useZenithStore((s) => s.settings.hiddenWidgetIds);
    const widgetOrder = useZenithStore((s) => s.settings.widgetOrder);
    const savedGrid = useZenithStore((s) => s.settings.dashboardGrid);
    // Read here only so a deleted copy can take its bucket with it; the cards
    // themselves subscribe to their own bucket and to nothing else.
    const widgetConfig = useZenithStore((s) => s.settings.widgetConfig);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    // Normalised on read as well as on load: settings can be replaced by any
    // code path, and every measurement below divides by `columns`.
    const cfg = useMemo(() => normalizeGridConfig(savedGrid), [savedGrid]);

    const containerRef = useRef<HTMLDivElement>(null);
    const width = useElementWidth(containerRef);
    const stacked = shouldStack(width, cfg.columns, cfg.gap);

    /**
     * Bundles, repaired against the registry: members whose module was disabled
     * drop out, and a bundle left with one member stops being a bundle. Those
     * freed widgets are handed back to the grid below rather than vanishing.
     */
    const { bundles, released } = useMemo(
        () => normalizeBundles(savedBundles, new Set(registered.map((d) => d.id))),
        [savedBundles, registered]
    );

    const inBundles = useMemo(() => bundledWidgetIds(bundles), [bundles]);

    /**
     * Copies beyond the first, wherever they are standing.
     *
     * They come from the saved board rather than from the registry, because
     * that is the only record that they exist: the registry knows the widget
     * may be copied, not how many times the user did it.
     */
    const copyIds = useMemo(() => {
        const ids = new Set<string>();
        for (const item of savedLayout) if (isCopyId(item.id)) ids.add(item.id);
        for (const id of inBundles) if (isCopyId(id)) ids.add(id);
        return ids;
    }, [savedLayout, inBundles]);

    /**
     * Everything the grid can be asked about, keyed by *layout* id.
     *
     * A copy answers to the definition it was copied from, so it is entered
     * here under its own id. That is what lets the rest of this component — and
     * the bundles, and the drag — go on doing a plain map lookup instead of
     * each learning to strip a copy number.
     */
    const defsById = useMemo(() => {
        const map = new Map(registered.map((def) => [def.id, def]));
        for (const id of copyIds) {
            const def = map.get(widgetIdOf(id));
            if (def) map.set(id, def);
        }
        return map;
    }, [registered, copyIds]);

    /**
     * What to call a placed item, in the user's language.
     *
     * An id rather than a definition, because the callers hold ids: a bundle's
     * tab strip and a drop target both name a widget they only know by id, and
     * a copy's id is not its widget's. `prettifyWidgetId` is the answer for an
     * id nothing is registered under — a layout that outlived its module.
     */
    const labelOf = useCallback(
        (id: string) => {
            const def = defsById.get(id);
            if (!def) return prettifyWidgetId(id);
            // A card the user named is called that wherever it is named: on
            // its own header, on a bundle's strip, on a drop target.
            return (def.multiple && cardNameOf(widgetConfig, id)) || widgetLabel(def, t);
        },
        [defsById, widgetConfig, t]
    );

    /**
     * The way from a card to its module's settings page, when there is one.
     *
     * Most of what a card shows is decided there rather than on its back — a
     * back holds what differs between two copies of one widget, and a card
     * there can only be one of has nothing of the kind. The module is the
     * widget id's namespace, as in the gallery (`weather.now` → `weather`).
     */
    const moduleSettingsOf = useCallback(
        (id: string): (() => void) | undefined => {
            const def = defsById.get(id);
            const [moduleId, ...rest] = (def?.id ?? '').split('.');
            if (rest.length === 0 || !moduleHasSettings(plugin, moduleId)) return undefined;
            return () => openZenithSettings(plugin, moduleId);
        },
        [defsById, plugin]
    );

    /** Presets per placeable item — widgets by their own, bundles by the
     *  intersection of their members'. */
    const sizesById = useMemo(
        () => new Map([...defsById].map(([id, def]) => [id, widgetSizes(def)])),
        [defsById]
    );

    /**
     * Widgets available for placement, in the user's preferred order. Widgets
     * listed in `widgetOrder` come first; the rest keep registration order
     * (which the registry already sorts by each widget's `order`).
     *
     * A bundle joins this list as a single entry — to the grid engine it's an
     * item like any other — and its members drop out, because they're rendered
     * inside it rather than beside it.
     */
    const available = useMemo<WidgetSizeInfo[]>(() => {
        const rank = new Map(widgetOrder.map((id, i) => [id, i]));
        const ordered = [...registered].sort((a, b) => {
            const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            return ra - rb;
        });
        return [
            ...bundles.map((b) => ({ id: b.id, ...bundleSizes(b.members, sizesById) })),
            ...ordered
                .filter((def) => !inBundles.has(def.id))
                .map((def) => ({ id: def.id, ...widgetSizes(def) })),
            // Copies are never auto-placed — they exist only because someone
            // asked for them — so they enter the list from the board they are
            // already on rather than from the registry.
            ...[...copyIds]
                .filter((id) => !inBundles.has(id))
                .map((id) => {
                    const def = defsById.get(id);
                    return def ? { id, ...widgetSizes(def) } : null;
                })
                .filter((info): info is WidgetSizeInfo => !!info),
        ];
    }, [registered, widgetOrder, bundles, inBundles, copyIds, defsById, sizesById]);

    const layout = useMemo(
        () => reconcileLayout(savedLayout, available, hiddenWidgetIds, cfg.columns),
        [savedLayout, available, hiddenWidgetIds, cfg.columns]
    );

    // Bundles that lost members below the minimum released their leftovers —
    // put them back on the grid instead of leaving them nowhere.
    useEffect(() => {
        if (released.length === 0) return;
        updateSettings({
            dashboardBundles: bundles,
            hiddenWidgetIds: hiddenWidgetIds.filter((id) => !released.includes(id)),
        });
    }, [released, bundles, hiddenWidgetIds, updateSettings]);

    // Persist the repaired layout so settings and reality stay in sync. Guarded
    // by an equality check so this can't loop.
    useEffect(() => {
        if (!layoutsEqual(layout, savedLayout)) {
            updateSettings({ dashboardLayout: layout });
        }
    }, [layout, savedLayout, updateSettings]);

    useEffect(() => {
        if (!freshId) return;
        const card = containerRef.current?.querySelector<HTMLElement>(
            `[data-instance-id="${CSS.escape(freshId)}"]`
        );
        card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const timer = window.setTimeout(() => setFreshId(null), 1500);
        return () => window.clearTimeout(timer);
        // The layout is named so the scroll waits for the card to be on the board.
    }, [freshId, layout]);

    /** Presets for anything the grid can place, bundles included. */
    const presetsFor = useCallback(
        (id: string) =>
            isBundleId(id)
                ? bundleSizes(bundles.find((b) => b.id === id)?.members ?? [], sizesById)
                : sizesById.get(id),
        [bundles, sizesById]
    );

    const colWidth = width > 0 ? (width - (cfg.columns - 1) * cfg.gap) / cfg.columns : 0;

    const commitBundles = useCallback(
        (next: WidgetBundle[]) => updateSettings({ dashboardBundles: next }),
        [updateSettings]
    );

    const commitLayout = useCallback(
        (next: WidgetLayoutItem[]) => updateSettings({ dashboardLayout: next }),
        [updateSettings]
    );
    const commitStackOrder = useCallback(
        (ids: string[]) => updateSettings({ dashboardStackOrder: ids }),
        [updateSettings]
    );
    const enterEditing = useCallback(() => onEditingChange(true), [onEditingChange]);

    /**
     * Removal has to record the widget in `hiddenWidgetIds` as well — otherwise
     * `reconcileLayout` would treat it as newly registered and put it straight
     * back on the next render.
     */
    const removeWidget = useCallback(
        (id: string) => {
            // Taking a bundle off the dashboard dissolves it rather than hiding
            // it: a hidden bundle would keep owning its members, and they'd be
            // gone from both the grid and the add panel with no way back.
            if (isBundleId(id)) {
                updateSettings({
                    dashboardBundles: bundles.filter((b) => b.id !== id),
                    dashboardLayout: removeItem(layout, id, cfg.columns),
                    hiddenWidgetIds: [
                        ...hiddenWidgetIds,
                        ...(bundles.find((b) => b.id === id)?.members ?? []),
                    ],
                });
                return;
            }
            // A further copy has nowhere to be put back to — it is not in the
            // registry and the add panel offers the widget, not this one of it
            // — so taking it off the board deletes it, settings and all. Hiding
            // it instead would leave a bucket behind for whichever copy was
            // next given the same number to inherit.
            if (isCopyId(id)) {
                updateSettings({
                    dashboardLayout: removeItem(layout, id, cfg.columns),
                    widgetConfig: withoutWidgetConfig(widgetConfig, id),
                });
                return;
            }
            updateSettings({
                hiddenWidgetIds: hiddenWidgetIds.includes(id)
                    ? hiddenWidgetIds
                    : [...hiddenWidgetIds, id],
                dashboardLayout: removeItem(layout, id, cfg.columns),
            });
        },
        [bundles, hiddenWidgetIds, layout, updateSettings, cfg.columns, widgetConfig]
    );

    const addWidget = useCallback(
        (id: string) => {
            // Asking again for a widget that is already standing there means one
            // more of it, not "put it back" — and only for the widgets that say
            // they can be copied. For everything else the id is already free,
            // because the panel only offers what is off the board.
            const onBoard = layout.some((i) => i.id === id) || inBundles.has(id);
            const target =
                defsById.get(id)?.multiple && onBoard
                    ? newCopyId(id, [...layout.map((i) => i.id), ...inBundles])
                    : id;
            const size = presetsFor(target)?.defaultSize ?? presetsFor(id)?.defaultSize ?? 'sm';
            updateSettings({
                hiddenWidgetIds: hiddenWidgetIds.filter((h) => h !== target),
                dashboardLayout: addItem(layout, target, size, cfg.columns),
            });
            setFreshId(target);
        },
        [hiddenWidgetIds, layout, inBundles, defsById, presetsFor, updateSettings, cfg.columns]
    );

    // ── Bundle operations ────────────────────────────

    /** Take a widget out of its bundle and give it its own cell again. */
    const extractMember = useCallback(
        (bundleId: string, widgetId: string) => {
            if (!bundles.some((b) => b.id === bundleId)) return;
            const result = removeMember(bundles, bundleId, widgetId);
            const size = sizesById.get(widgetId)?.defaultSize ?? 'sm';

            // Once one member is left the bundle dissolves, and the survivor
            // takes over the cell — so nothing appears to move. The extracted
            // widget goes to the first free spot.
            const survivor = result.dissolvedInto;
            const withSurvivor = survivor
                ? layout.map((i) => (i.id === bundleId ? { ...i, id: survivor } : i))
                : layout;
            const nextLayout = addItem(withSurvivor, widgetId, size, cfg.columns);

            updateSettings({
                dashboardBundles: result.bundles,
                dashboardLayout: nextLayout,
                hiddenWidgetIds: hiddenWidgetIds.filter((h) => h !== widgetId),
            });
        },
        [bundles, layout, sizesById, cfg.columns, hiddenWidgetIds, updateSettings]
    );

    const handleItemKey = useCallback(
        (e: React.KeyboardEvent, item: WidgetLayoutItem) => {
            const delta = ARROW_DELTA[e.key];
            if (!delta) return;
            e.preventDefault();
            commitLayout(moveItem(layout, item.id, item.x + delta[0], item.y + delta[1], cfg.columns));
        },
        [commitLayout, layout, cfg.columns]
    );

    const describe = useCallback(
        (def: (typeof registered)[number]): AddableWidget => ({
            id: def.id,
            label: widgetLabel(def, t),
            icon: def.icon,
            description: widgetDescription(def, t),
            defaultSize: widgetSizes(def).defaultSize,
        }),
        // `widgetLabel` reads the translator, so an empty list froze every
        // widget name in the language the dashboard first rendered in.
        [t]
    );

    /** Registered widgets that aren't currently on the grid. */
    const addable = useMemo<AddableWidget[]>(() => {
        const placed = new Set(layout.map((i) => i.id));
        // A widget that can be copied never leaves the offer: its button means
        // "one more", and there is no state in which that stops making sense.
        return registered.filter((def) => def.multiple || !placed.has(def.id)).map(describe);
    }, [registered, layout, describe]);

    /** Widgets already on the grid — listed as "added" so the sheet shows the
        whole catalogue rather than looking empty once everything is placed. */
    const placedWidgets = useMemo<AddableWidget[]>(() => {
        const placed = new Set(layout.map((i) => i.id));
        // Copyable widgets are left out: a tick that removes "the" picture says
        // nothing about which of three, and the card's own × does say it.
        return registered.filter((def) => !def.multiple && placed.has(def.id)).map(describe);
    }, [registered, layout, describe]);

    // Committed one-column order and its geometry (what a drag measures against).
    const stackItems = useMemo(() => stackOrder(layout, savedStackOrder), [layout, savedStackOrder]);
    const committedStack = useMemo(() => stackGeometry(stackItems, cfg), [stackItems, cfg]);

    /**
     * Two widgets merge; a widget joins a bundle. Two bundles don't merge —
     * the members would have to be concatenated and one of the two names
     * silently thrown away, and there's no reading of that a user could predict.
     */
    const canMerge = useCallback(
        (sourceId: string, targetId: string) => {
            if (isBundleId(sourceId)) return false;
            const target = bundles.find((b) => b.id === targetId);
            if (target) return target.members.length < BUNDLE_MAX_MEMBERS;
            return !isBundleId(targetId);
        },
        [bundles]
    );

    /** Drop a widget onto another card: join its bundle, or start a new one. */
    const mergeInto = useCallback(
        (sourceId: string, targetId: string) => {
            const existing = bundles.find((b) => b.id === targetId);
            if (existing) {
                updateSettings({
                    dashboardBundles: addMember(bundles, existing.id, sourceId),
                    dashboardLayout: removeItem(layout, sourceId, cfg.columns),
                });
                return;
            }
            // A new bundle takes over the target's cell — the receiving card
            // keeps its place and size, the dragged one gives up its own.
            const id = newBundleId(bundles);
            const bundle: WidgetBundle = {
                id,
                members: [targetId, sourceId],
                activeId: sourceId,
            };
            const withoutSource = removeItem(layout, sourceId, cfg.columns);
            updateSettings({
                dashboardBundles: [...bundles, bundle],
                dashboardLayout: withoutSource.map((i) => (i.id === targetId ? { ...i, id } : i)),
            });
        },
        [bundles, layout, cfg.columns, updateSettings]
    );

    useEffect(() => {
        // Leaving arrange mode puts every card face up again: whatever was
        // being set up there is done with.
        if (!editing) setFlippedId(null);
    }, [editing]);

    // Esc turns a card back, the way it leaves arrange mode.
    useEffect(() => {
        if (!flippedId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setFlippedId(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [flippedId]);

    const drag = useGridDrag({
        layout,
        stackItems,
        stackTops: committedStack.tops,
        stackHeights: committedStack.heights,
        colWidth,
        cols: cfg.columns,
        rowHeight: cfg.rowHeight,
        gap: cfg.gap,
        editing,
        stacked,
        containerRef,
        canMerge,
        onMerge: mergeInto,
        onCommitLayout: commitLayout,
        onCommitStackOrder: commitStackOrder,
        onLongPress: enterEditing,
    });

    // A bundle is exactly one cell tall, whatever it holds, so the laid-out
    // grid is the grid — nothing grows underneath the drag preview.
    const effective = drag.preview ?? layout;
    const effectiveStack = useMemo(() => {
        if (!drag.stackPreview) return stackItems;
        const byId = new Map(stackItems.map((i) => [i.id, i]));
        return drag.stackPreview
            .map((id) => byId.get(id))
            .filter((i): i is WidgetLayoutItem => !!i);
    }, [drag.stackPreview, stackItems]);
    /* Which cards follow their content right now. Not while arranging: there
       every card is its saved cell, so what is dragged and sized is what was
       saved, and the ceilings can be seen for what they are.

       A bundle follows its content when every member is content: it is then
       as tall as its tallest member, measured whether or not that member is on
       top (see `BundleCard`) — not as tall as the one on top, since a cell
       that changed size with every switch would throw the board about under
       it. One member that fills its cell, and the bundle is held at the height
       it was given. */
    const canFollow = useCallback(
        (id: string): boolean => {
            if (!isBundleId(id)) return !!defsById.get(id)?.autoHeight;
            const bundle = bundles.find((b) => b.id === id);
            return (
                !!bundle &&
                bundle.members.length > 0 &&
                bundle.members.every((m) => !!defsById.get(m)?.autoHeight)
            );
        },
        [defsById, bundles]
    );
    const follows = useCallback(
        (item: WidgetLayoutItem) => !editing && !item.fixed && canFollow(item.id),
        [editing, canFollow]
    );
    const neededNow = useMemo(() => {
        const map = new Map<string, number>();
        for (const item of effective) {
            // A card turned over stands at the height it was given, not at its
            // content's: its back is a form, which a card fitted to one line
            // of text has no room for, and the height being set there is that
            // ceiling — so it is what the steppers should be seen to change.
            if (item.id === flippedId) continue;
            const px = needed.get(item.id);
            if (px !== undefined && follows(item)) map.set(item.id, px);
        }
        return map;
    }, [effective, needed, follows, flippedId]);

    /** The grid as it is drawn: fitted cards at the rows they need, the rest floated up. */
    const shown = useMemo(
        () => fitLayout(effective, neededNow, cfg.rowHeight, cfg.gap, cfg.columns),
        [effective, neededNow, cfg.rowHeight, cfg.gap, cfg.columns]
    );
    const liveStack = useMemo(
        () => stackGeometry(effectiveStack, cfg, neededNow),
        [effectiveStack, cfg, neededNow]
    );
    const stackIndexById = useMemo(
        () => new Map(effectiveStack.map((i, idx) => [i.id, idx])),
        [effectiveStack]
    );

    // Nothing placed and not arranging: nudge the user rather than show a void.
    // While arranging, fall through so the add panel below is reachable.
    if (layout.length === 0 && !editing) {
        return (
            <div className="zenith-dashboard__empty">
                {t(addable.length > 0 ? 'dashboard.empty' : 'dashboard.noWidgets')}
            </div>
        );
    }

    const cellStyle = (item: WidgetLayoutItem): CSSProperties => {
        const { w, h } = dimsOf(item, cfg.columns);
        if (stacked) {
            const idx = stackIndexById.get(item.id) ?? 0;
            return {
                transform: `translate3d(0, ${liveStack.tops[idx] ?? 0}px, 0)`,
                width: '100%',
                height: liveStack.heights[idx] ?? pxHeight(h, cfg.rowHeight, cfg.gap),
            };
        }
        return {
            transform: `translate3d(${item.x * (colWidth + cfg.gap)}px, ${
                item.y * (cfg.rowHeight + cfg.gap)
            }px, 0)`,
            width: w * colWidth + (w - 1) * cfg.gap,
            height: pxHeight(h, cfg.rowHeight, cfg.gap),
        };
    };

    /** The dragged widget follows the pointer from where it actually sits. */
    const dragStyle = (item: WidgetLayoutItem): CSSProperties => {
        const committed = layout.find((i) => i.id === item.id) ?? item;
        const { w, h } = dimsOf(committed, cfg.columns);
        if (stacked) {
            const idx = stackItems.findIndex((i) => i.id === item.id);
            const top = (committedStack.tops[idx] ?? 0) + drag.offset.dy;
            return {
                transform: `translate3d(0, ${top}px, 0)`,
                width: '100%',
                height: pxHeight(h, cfg.rowHeight, cfg.gap),
            };
        }
        return {
            transform: `translate3d(${
                committed.x * (colWidth + cfg.gap) + drag.offset.dx
            }px, ${committed.y * (cfg.rowHeight + cfg.gap) + drag.offset.dy}px, 0)`,
            width: w * colWidth + (w - 1) * cfg.gap,
            height: pxHeight(h, cfg.rowHeight, cfg.gap),
        };
    };

    // While a merge is armed the landing-spot highlight is suppressed: the card
    // isn't going to land in a cell, and showing both signals at once would ask
    // the user to guess which one wins.
    const dropTarget =
        drag.dragId && !drag.mergeTargetId
            ? (stacked ? effectiveStack : effective).find((i) => i.id === drag.dragId)
            : undefined;

    const mergeRect = drag.mergeTargetId
        ? layout.find((i) => i.id === drag.mergeTargetId)
        : undefined;
    // Every widget is drawn at every size now, so there is nothing to warn of:
    // this used to say a widget "does not come in" the bundle's size, and the
    // bundle then drew a strip in its place.
    const mergeLabel = drag.mergeTargetId ? t('dashboard.bundle.mergeHint') : null;

    const rendered = stacked ? effectiveStack : sortItems(shown);
    /** The height a card was given — its ceiling, when it follows its content. */
    const ceilingPx = (id: string): number => {
        const saved = layout.find((i) => i.id === id);
        return saved ? pxHeight(dimsOf(saved, cfg.columns).h, cfg.rowHeight, cfg.gap) : 0;
    };

    return (
        <>
            <div
                ref={containerRef}
                className={`zenith-grid ${stacked ? 'is-stacked' : ''} ${
                    editing ? 'is-editing' : ''
                } ${drag.dragId ? 'is-dragging-any' : ''} ${
                    drag.mergeTargetId ? 'is-merging' : ''
                } ${flippedId ? 'has-flipped' : ''}`}
                style={{
                    height: stacked
                        ? liveStack.total
                        : pxHeight(bottomOf(shown, cfg.columns), cfg.rowHeight, cfg.gap),
                }}
            >
                {/* Where the dragged widget will land. */}
                {dropTarget && <div className="zenith-grid__placeholder" style={cellStyle(dropTarget)} />}

                {/* Held long enough over another card: this is what release does. */}
                {mergeRect && mergeLabel && (
                    <div className="zenith-grid__merge" style={cellStyle(mergeRect)}>
                        <span className="zenith-grid__merge-badge">
                            <Layers size={13} />
                            {mergeLabel}
                        </span>
                    </div>
                )}

                {/* Wait for the first measure so widgets don't flash at x=0. */}
                {width > 0 &&
                    rendered.map((item) => {
                        const isDragging = drag.dragId === item.id;
                        const presets = presetsFor(item.id);
                        const bundle = bundles.find((b) => b.id === item.id);

                        // A bundle is a grid item like any other — same cell
                        // chrome, same drag handles, same size panel — but its
                        // body is the bundle rather than one widget's component.
                        if (bundle) {
                            return (
                                <GridWidget
                                    key={item.id}
                                    def={{
                                        id: bundle.id,
                                        // Named, it is called that; otherwise it
                                        // goes by the widget on top, as its
                                        // front does.
                                        title: bundle.name || labelOf(bundle.activeId),
                                        icon: bundle.name
                                            ? 'layers'
                                            : (defsById.get(bundle.activeId)?.icon ?? 'layers'),
                                    }}
                                    instanceId={bundle.id}
                                    style={isDragging ? dragStyle(item) : cellStyle(item)}
                                    editing={editing}
                                    dragging={isDragging}
                                    flipped={flippedId === item.id}
                                    fresh={freshId === item.id}
                                    onFlip={(on) => setFlippedId(on ? item.id : null)}
                                    dragProps={{
                                        ...drag.getItemProps(item.id),
                                        tabIndex: editing && !stacked ? 0 : undefined,
                                        onKeyDown:
                                            editing && !stacked
                                                ? (e: React.KeyboardEvent) => handleItemKey(e, item)
                                                : undefined,
                                        ...(drag.mergeTargetId === item.id
                                            ? { 'data-merge-target': '' }
                                            : {}),
                                    }}
                                    /* A widget inside a bundle had no way to
                                       its own settings short of being taken
                                       out of it. The back of the bundle is the
                                       back of one of its widgets: headed with
                                       that widget's name, opening with its
                                       settings where a card's own would be —
                                       and carrying the rail, so the next
                                       widget is one tap away rather than a
                                       turn back, a switch and a turn over.
                                       Every member is on it: there is no
                                       swipe here to reach the ones a front's
                                       rail folds into "+N". */
                                    backTitle={labelOf(bundle.activeId)}
                                    backIcon={defsById.get(bundle.activeId)?.icon}
                                    backHeader={
                                        <>
                                            <BundlePips
                                                members={bundle.members}
                                                activeId={bundle.activeId}
                                                defsById={defsById}
                                                labelOf={labelOf}
                                                onPick={(widgetId) =>
                                                    commitBundles(
                                                        setActive(bundles, bundle.id, widgetId)
                                                    )
                                                }
                                            />
                                            <span className="zenith-bundle__sep" aria-hidden="true" />
                                        </>
                                    }
                                    panelLead={
                                        // Keyed: two texts in one bundle share a
                                        // settings component, and one must not
                                        // inherit what the other was typing.
                                        <MemberSettings
                                            key={bundle.activeId}
                                            def={defsById.get(bundle.activeId)}
                                            instanceId={bundle.activeId}
                                        />
                                    }
                                    panelExtra={
                                        <BundleInspector
                                            bundle={bundle}
                                            members={bundle.members.map((id) => ({
                                                id,
                                                label: labelOf(id),
                                                sizes: sizesById.get(id)?.sizes ?? [],
                                            }))}
                                            onRename={(name) =>
                                                commitBundles(
                                                    renameBundle(bundles, bundle.id, name)
                                                )
                                            }
                                            onExtract={(widgetId) =>
                                                extractMember(bundle.id, widgetId)
                                            }
                                            onReorder={(widgetId, index) =>
                                                commitBundles(
                                                    reorderMembers(
                                                        bundles,
                                                        bundle.id,
                                                        widgetId,
                                                        index
                                                    )
                                                )
                                            }
                                        />
                                    }
                                    size={item.size}
                                    sizes={presets?.sizes ?? [item.size]}
                                    width={dimsOf(item, cfg.columns).w}
                                    columns={cfg.columns}
                                    height={dimsOf(item, cfg.columns).h}
                                    maxRows={MAX_ROWS}
                                    customWidth={item.w != null || item.h != null}
                                    onSetWidth={(w) =>
                                        commitLayout(setWidth(layout, item.id, w, cfg.columns))
                                    }
                                    onSetHeight={(h) =>
                                        commitLayout(setHeight(layout, item.id, h, cfg.columns))
                                    }
                                    onResize={(next) =>
                                        commitLayout(resizeItem(layout, item.id, next, cfg.columns))
                                    }
                                    onRemove={() => removeWidget(item.id)}
                                    onModuleSettings={moduleSettingsOf(bundle.activeId)}
                                    canFit={canFollow(item.id)}
                                    fixed={!!item.fixed}
                                    onSetFixed={(hold) =>
                                        commitLayout(setFixed(layout, item.id, hold))
                                    }
                                >
                                    <BundleCard
                                        bundle={bundle}
                                        defsById={defsById}
                                        size={item.size}
                                        fit={
                                            follows(item)
                                                ? {
                                                      ceilingPx: ceilingPx(item.id),
                                                      onNeeded: (px) => reportNeeded(item.id, px),
                                                  }
                                                : null
                                        }
                                        editing={editing}
                                        onSetActive={(widgetId) =>
                                            commitBundles(setActive(bundles, bundle.id, widgetId))
                                        }
                                        labelOf={labelOf}
                                        onConfigure={() => setFlippedId(item.id)}
                                    />
                                </GridWidget>
                            );
                        }

                        const def = defsById.get(item.id);
                        if (!def) return null;
                        return (
                            <GridWidget
                                key={item.id}
                                def={def}
                                instanceId={item.id}
                                style={isDragging ? dragStyle(item) : cellStyle(item)}
                                editing={editing}
                                dragging={isDragging}
                                flipped={flippedId === item.id}
                                fresh={freshId === item.id}
                                fit={
                                    follows(item)
                                        ? { ceilingPx: ceilingPx(item.id), onNeeded: reportNeeded }
                                        : null
                                }
                                canFit={!!def.autoHeight}
                                fixed={!!item.fixed}
                                onSetFixed={(hold) =>
                                    commitLayout(setFixed(layout, item.id, hold))
                                }
                                onFlip={(on) => setFlippedId(on ? item.id : null)}
                                dragProps={{
                                    ...drag.getItemProps(item.id),
                                    // Focusable only while arranging, so tab order
                                    // stays clean during normal use.
                                    tabIndex: editing && !stacked ? 0 : undefined,
                                    onKeyDown:
                                        editing && !stacked
                                            ? (e: React.KeyboardEvent) => handleItemKey(e, item)
                                            : undefined,
                                    'aria-label':
                                        editing && !stacked
                                            ? t('dashboard.widget.arrangeHint', {
                                                  name: widgetLabel(def, t),
                                              })
                                            : undefined,
                                }}
                                size={item.size}
                                sizes={presets?.sizes ?? [item.size]}
                                width={dimsOf(item, cfg.columns).w}
                                columns={cfg.columns}
                                height={dimsOf(item, cfg.columns).h}
                                maxRows={MAX_ROWS}
                                customWidth={item.w != null || item.h != null}
                                onSetWidth={(w) =>
                                    commitLayout(setWidth(layout, item.id, w, cfg.columns))
                                }
                                onSetHeight={(h) =>
                                    commitLayout(setHeight(layout, item.id, h, cfg.columns))
                                }
                                onResize={(next) =>
                                    commitLayout(resizeItem(layout, item.id, next, cfg.columns))
                                }
                                onRemove={() => removeWidget(item.id)}
                                onModuleSettings={moduleSettingsOf(item.id)}
                            />
                        );
                    })}
            </div>

            {/* The gallery, the grid and the saved arrangements, in the panel
                beside the board. They were three bars under it — the one place
                a board being arranged cannot be seen from. */}
            {editing &&
                panel &&
                createPortal(
                    <ArrangePanel
                        tab={panel.tab}
                        onTab={panel.onTab}
                        onClose={panel.onClose}
                        widgets={
                            <AddWidgetSheet
                                widgets={addable}
                                placed={placedWidgets}
                                onAdd={addWidget}
                                onRemove={removeWidget}
                            />
                        }
                        grid={
                            <GridSettingsBar
                                config={cfg}
                                stacked={stacked}
                                onChange={(next) =>
                                    updateSettings(
                                        // A new column count invalidates every saved x, so
                                        // re-lay the grid in reading order rather than
                                        // letting compaction push widgets downwards.
                                        next.columns === cfg.columns
                                            ? { dashboardGrid: next }
                                            : {
                                                  dashboardGrid: next,
                                                  dashboardLayout: repack(layout, next.columns),
                                              }
                                    )
                                }
                            />
                        }
                        presets={presetsOn ? <LayoutPresetsBar /> : undefined}
                    />,
                    panel.host
                )}
        </>
    );
};
