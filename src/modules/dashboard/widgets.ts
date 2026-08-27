import { useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';
import type { App } from 'obsidian';
import type ZenithPlugin from '../../main';
import type { WidgetSize } from './grid/gridTypes';

/**
 * Zenith Dashboard Widget System
 * ──────────────────────────────
 * Any module — built-in or third-party — can contribute a widget to the
 * dashboard by registering a `DashboardWidgetDefinition`. The dashboard renders
 * all registered widgets in a responsive grid, sorted by `order`.
 *
 * Two rendering paths are supported:
 *  • `component` — a React component (used by the bundled modules).
 *  • `mount`     — a framework-agnostic DOM callback, ideal for third-party
 *                  modules that ship as plain `.js` and don't share our React.
 *
 * Register from a module's `onload()` and dispose on `onunload()`:
 * ```ts
 *   this.register(this.plugin.registerDashboardWidget({
 *     id: 'my-module.hello',
 *     title: 'Hello',
 *     icon: 'sparkles',
 *     mount: (el) => { el.setText('Hi from my module'); },
 *   }));
 * ```
 */

export interface DashboardWidgetContext {
    app: App;
    plugin: ZenithPlugin;
}

/**
 * Props every React widget receives. Widgets may ignore them — a plain
 * `React.FC` is still assignable — but they can use `size` to render more
 * detail when the user has given them a bigger cell.
 */
export interface DashboardWidgetProps {
    /**
     * Optional so a widget can be a plain `React.FC` and ignore it entirely —
     * the grid always passes a concrete value.
     */
    size?: WidgetSize;
}

export interface DashboardWidgetDefinition {
    /** Unique id, e.g. "tasks.overview". Namespaced by module by convention. */
    id: string;
    /**
     * Header title. Optional only because a widget may prefer the name derived
     * from its id; every widget gets a header either way.
     */
    title?: string;
    /**
     * One line on what the widget shows, for the add-widget gallery. Without it
     * the gallery can only repeat the widget's own name back at the user.
     */
    description?: string;
    /** Lucide icon name (kebab-case), shown in the header. */
    icon?: string;
    /**
     * Size presets this widget supports, smallest first. The user picks one of
     * these on the dashboard. Omit to derive sensible presets from `span`.
     */
    sizes?: readonly WidgetSize[];
    /** Preset used when the widget is first placed. Defaults to `sizes[0]`. */
    defaultSize?: WidgetSize;
    /**
     * @deprecated Superseded by `sizes`/`defaultSize`. Still honoured as a
     * fallback so third-party widgets written against the old API keep working.
     */
    span?: 1 | 2 | 'full';
    /** Sort order (ascending). Defaults to 100. */
    order?: number;
    /** React render path (bundled widgets). */
    component?: ComponentType<DashboardWidgetProps>;
    /**
     * DOM render path (third-party widgets). Receives a host element and the
     * dashboard context. May return a cleanup function.
     */
    mount?: (el: HTMLElement, ctx: DashboardWidgetContext) => void | (() => void);
}

/**
 * Resolve the size presets for a widget.
 *
 * Widgets that predate the grid (or third-party ones) only declare `span`, so
 * derive presets from it: a full-width widget starts at `md`, a half-width one
 * at `sm`. Both can still be grown, which is what the old layout allowed anyway.
 */
export function widgetSizes(def: DashboardWidgetDefinition): {
    sizes: readonly WidgetSize[];
    defaultSize: WidgetSize;
} {
    const wide = def.span === 'full' || def.span === 2;
    const sizes = def.sizes?.length ? def.sizes : wide ? (['md', 'lg'] as const) : (['sm', 'md'] as const);
    const defaultSize = def.defaultSize && sizes.includes(def.defaultSize) ? def.defaultSize : sizes[0];
    return { sizes, defaultSize };
}

type Listener = () => void;

/** Turn a namespaced widget id into a readable label, e.g. "dashboard.clock" → "Clock". */
export function prettifyWidgetId(id: string): string {
    const last = id.split('.').pop() ?? id;
    return last
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());
}

class DashboardWidgetRegistry {
    private widgets = new Map<string, DashboardWidgetDefinition>();
    private listeners = new Set<Listener>();
    private snapshot: DashboardWidgetDefinition[] = [];

    /** Register (or replace) a widget. Returns a disposer. */
    register(def: DashboardWidgetDefinition): () => void {
        this.widgets.set(def.id, def);
        this.rebuild();
        return () => this.unregister(def.id);
    }

    unregister(id: string): void {
        if (this.widgets.delete(id)) this.rebuild();
    }

    /** Stable, sorted snapshot (safe for useSyncExternalStore). */
    getSnapshot = (): DashboardWidgetDefinition[] => this.snapshot;

    /** Lightweight metadata for every registered widget (for settings UI). */
    listWidgetMeta(): Array<{ id: string; label: string }> {
        return this.snapshot.map((w) => ({
            id: w.id,
            label: w.title ?? prettifyWidgetId(w.id),
        }));
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    private rebuild(): void {
        this.snapshot = Array.from(this.widgets.values()).sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100)
        );
        this.listeners.forEach((l) => l());
    }
}

/** Process-wide registry shared by every module and the dashboard view. */
export const dashboardWidgets = new DashboardWidgetRegistry();

/** React hook: subscribe to the current, sorted list of widgets. */
export function useDashboardWidgets(): DashboardWidgetDefinition[] {
    return useSyncExternalStore(dashboardWidgets.subscribe, dashboardWidgets.getSnapshot);
}
