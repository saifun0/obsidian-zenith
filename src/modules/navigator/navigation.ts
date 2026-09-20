import { useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { Translator } from '../../core/i18n';
import { prettifyWidgetId } from '../dashboard/widgets';
import type ZenithPlugin from '../../main';

/**
 * Zenith Navigation Registry
 * ──────────────────────────
 * The dashboard's launcher widget draws one button per registered
 * `NavActionDefinition`. Every module — built-in or third-party — contributes
 * its own, so the launcher lists exactly the views that are actually there:
 * disable a module and its button leaves with it, install one and its button
 * appears without the navigator knowing anything about it.
 *
 * Two ways to say what a button does:
 *  • `viewType` — an Obsidian view type. Reveals an existing leaf, or opens a
 *                 new tab. This is what a module with a view wants.
 *  • `onClick`  — anything else (a modal, a command, a file). Used by modules
 *                 that have no view of their own.
 *
 * Register from a module's `onload()` and dispose on `onunload()`:
 * ```ts
 *   this.register(this.plugin.registerNavAction({
 *     id: 'my-module.view',
 *     label: 'My Module',
 *     icon: 'sparkles',
 *     viewType: MY_VIEW_TYPE,
 *   }));
 * ```
 */

export interface NavActionContext {
    app: App;
    plugin: ZenithPlugin;
}

export interface NavActionDefinition {
    /** Unique id, e.g. "tasks.view". Namespaced by module by convention. */
    id: string;
    /**
     * Button text. Third-party modules use this; it is shown as written, since
     * a module's own strings are the only ones that can be right for it.
     */
    label?: string;
    /**
     * Translation key for the label, preferred by the built-in modules so the
     * launcher follows Zenith's language setting. Falls back to `label` (then
     * to the id) when the key resolves to nothing.
     */
    labelKey?: string;
    /** One line of explanation, shown under the label in the list layout. */
    description?: string;
    /** Translation key for `description`, same fallback rules. */
    descriptionKey?: string;
    /** Lucide icon name (kebab-case) or a Zenith custom id (`zi:acme/logo`). */
    icon?: string;
    /** Sort order (ascending). Defaults to 100. */
    order?: number;
    /** Obsidian view type to reveal or open. */
    viewType?: string;
    /** Anything a view type can't express. Ignored when `viewType` is set. */
    onClick?: (ctx: NavActionContext) => void | Promise<void>;
}

/** Text for a button, honouring `labelKey` before `label`. */
export function navActionLabel(def: NavActionDefinition, t: Translator): string {
    // `translate` returns the key itself when nothing matches, which would put
    // "nav.tasks" on a button — so treat that as "not translated" and fall
    // through to whatever the module supplied.
    if (def.labelKey) {
        const translated = t(def.labelKey);
        if (translated !== def.labelKey) return translated;
    }
    return def.label ?? prettifyWidgetId(def.id);
}

/** Description for a button, or undefined when it has none. */
export function navActionDescription(
    def: NavActionDefinition,
    t: Translator
): string | undefined {
    if (def.descriptionKey) {
        const translated = t(def.descriptionKey);
        if (translated !== def.descriptionKey) return translated;
    }
    return def.description;
}

/**
 * Run a nav action.
 *
 * A `viewType` reveals the leaf that already shows it rather than piling up
 * duplicates — the same rule `BaseModule.openView` follows, so clicking a
 * button and running the module's command land in the same place. `newTab`
 * (ctrl/cmd- or middle-click) is the deliberate opt-out.
 */
export async function runNavAction(
    def: NavActionDefinition,
    ctx: NavActionContext,
    opts: { newTab?: boolean } = {}
): Promise<void> {
    // Nothing here may reject: the widget fires this and forgets it, so a
    // failing button would surface as an unhandled rejection rather than as a
    // button that didn't work.
    try {
        if (def.viewType) {
            const { workspace } = ctx.app;
            if (!opts.newTab) {
                const existing = workspace.getLeavesOfType(def.viewType);
                if (existing.length > 0) {
                    await workspace.revealLeaf(existing[0]);
                    return;
                }
            }
            const leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: def.viewType, active: true });
            await workspace.revealLeaf(leaf);
            return;
        }

        await def.onClick?.(ctx);
    } catch (err) {
        console.error(`Zenith: nav action "${def.id}" failed`, err);
    }
}

type Listener = () => void;

class NavActionRegistry {
    private actions = new Map<string, NavActionDefinition>();
    private listeners = new Set<Listener>();
    private snapshot: NavActionDefinition[] = [];

    /** Register (or replace) a nav action. Returns a disposer. */
    register(def: NavActionDefinition): () => void {
        if (!def?.id) {
            console.error('Zenith: a nav action was registered without an id — ignored.');
            return () => undefined;
        }
        // A button that cannot do anything is worse than a missing one: it
        // looks like the feature is broken rather than absent.
        if (!def.viewType && !def.onClick) {
            console.error(
                `Zenith: nav action "${def.id}" has neither viewType nor onClick — ignored.`
            );
            return () => undefined;
        }
        this.actions.set(def.id, def);
        this.rebuild();
        return () => this.unregister(def.id);
    }

    unregister(id: string): void {
        if (this.actions.delete(id)) this.rebuild();
    }

    /** Stable, sorted snapshot (safe for useSyncExternalStore). */
    getSnapshot = (): NavActionDefinition[] => this.snapshot;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    private rebuild(): void {
        this.snapshot = Array.from(this.actions.values()).sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100)
        );
        this.listeners.forEach((l) => l());
    }
}

/** Process-wide registry shared by every module and the launcher widget. */
export const navActions = new NavActionRegistry();

/** React hook: subscribe to the current, sorted list of nav actions. */
export function useNavActions(): NavActionDefinition[] {
    return useSyncExternalStore(navActions.subscribe, navActions.getSnapshot);
}
