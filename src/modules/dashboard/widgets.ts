import { useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';
import type { App } from 'obsidian';
import type ZenithPlugin from '../../main';
import type { Translator } from '../../core/i18n';
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
    /**
     * This copy's layout id — the same string its settings are stored under.
     *
     * Only widgets that can be placed more than once have any use for it; for
     * every other widget it is simply the widget's own id. See
     * `grid/widgetInstances.ts`.
     */
    instanceId?: string;
}

/**
 * Props the panel on the back of a widget's card receives.
 *
 * A widget's settings are per copy, never per widget: two pictures on one board
 * that had to show the same photograph would be one picture rendered twice.
 */
export interface WidgetSettingsProps {
    /** The copy being configured — the key its settings are stored under. */
    instanceId: string;
}

export interface DashboardWidgetDefinition {
    /** Unique id, e.g. "tasks.overview". Namespaced by module by convention. */
    id: string;
    /**
     * Header title. Optional only because a widget may prefer the name derived
     * from its id; every widget gets a header either way.
     *
     * A plain string, and therefore in whatever language its author wrote it —
     * which is why `titleKey` exists and is preferred for anything shipped with
     * Zenith. A card reading "CONTENT" over a body reading "элементов" is one
     * card in two languages.
     */
    title?: string;
    /**
     * Translation key for the header title, winning over `title` when the
     * dictionary has it.
     *
     * Both, rather than one: a third-party widget cannot add keys to Zenith's
     * dictionary and must be able to pass a literal, while everything built in
     * has to follow the user's language. `title` stays as the fallback for the
     * locale that has no translation.
     */
    titleKey?: string;
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
    /**
     * The feature this widget is, when it can be switched off apart from its
     * module (`tasks.widget`). Off, the dashboard treats it the way it treats
     * the widget of a module that is off: not on the board, not in the
     * gallery. See `core/features.ts`.
     */
    feature?: string;
    /**
     * May be placed more than once, each copy configured on its own.
     *
     * Off by default, because most widgets are singular — two clocks tell the
     * same time. A widget that says yes is one whose content the user supplies,
     * so two of them are genuinely two different things.
     */
    multiple?: boolean;
    /**
     * A form for this copy, drawn on the back of the card beneath the size
     * controls.
     *
     * Settings that belong to a copy rather than to the widget live here rather
     * than on the module's settings page: the page has no way to say *which*
     * copy, and a board with three pictures on it needs to say that three
     * times. See `widgetConfig.ts` for where the values are kept.
     */
    settings?: ComponentType<WidgetSettingsProps>;
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

/**
 * What to call a widget on screen, in the user's own language.
 *
 * Three answers in order of authority: the translated key, the author's
 * literal, then the id made readable. Every place that used to write
 * `def.title ?? prettifyWidgetId(def.id)` goes through this instead — there
 * were seven of them, and a header, a gallery card and a bundle's tab strip
 * disagreeing about a widget's name is worse than any of them being wrong.
 */
export function widgetLabel(
    def: Pick<DashboardWidgetDefinition, 'id' | 'title' | 'titleKey'>,
    t: Translator
): string {
    if (def.titleKey && t.has(def.titleKey)) return t(def.titleKey);
    return def.title ?? prettifyWidgetId(def.id);
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

    /**
     * Lightweight metadata for every registered widget (for settings UI).
     *
     * The untranslated label, deliberately: this is a registry method with no
     * translator to hand, and the callers that show a name to the user go
     * through `widgetLabel` with the one they have.
     */
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
