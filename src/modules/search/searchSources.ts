import { useSyncExternalStore } from 'react';

/**
 * Zenith Search Registry
 * ──────────────────────
 * What the Search panel can find, contributed by the modules that own it: the
 * tasks module brings tasks and the "+ Task" row, the journal brings day notes,
 * and so on. The panel knows none of them. Switch a module off and its source
 * leaves with it; a third-party module adds its own the same way.
 *
 * Register from a module's `onload()`, dispose on `onunload()`:
 * ```ts
 *   this.disposers.push(this.plugin.registerSearchSource({
 *     id: 'my-module',
 *     label: 'My things',
 *     icon: 'sparkles',
 *     items: () => myThings().map((thing) => ({
 *       id: `my-module:${thing.id}`,
 *       title: thing.name,
 *       run: () => openThing(thing),
 *     })),
 *   }));
 * ```
 */

/** One row the panel can find. */
export interface SearchItem {
    /**
     * Stable across sessions: what "recently picked" is remembered by. Prefix
     * it with the source's id, `tasks:…`, so two sources cannot collide.
     */
    id: string;
    title: string;
    /** Other names it answers to: the other language, a command's English. */
    aliases?: readonly string[];
    /** Tags, without `#`. Found a little lower than the title; `#tag` keeps only these. */
    tags?: readonly string[];
    /** A few words on the right: a due date, a status. */
    detail?: string;
    /** Lucide icon name. Falls back to the source's. */
    icon?: string;
    /** A hotkey to show beside it, already printed. */
    hotkey?: string;
    /** Enter, or a tap. The panel closes first. */
    run: () => void | Promise<void>;
    /**
     * Ctrl/Cmd+Enter, or the ✓ on a phone: done. The panel stays open and the
     * row leaves the list, so several can be ticked off in a row.
     */
    complete?: () => void | Promise<void>;
    /** Alt+Enter: the note behind it. */
    reveal?: () => void | Promise<void>;
    /** Not remembered as a recent pick — a row whose meaning drifts, like "yesterday". */
    transient?: boolean;
}

/** A row that creates something out of what was typed. */
export interface SearchCreateRow {
    /** What will be created: the typed text, less anything read from it. */
    title: string;
    /** What kind of thing: "Task", "Project". */
    label: string;
    /** What was read from the text, shown beside it: "tomorrow", "18:00". */
    chips?: readonly string[];
    icon?: string;
    /** Enter, or a tap. The panel closes first. */
    run: () => void | Promise<void>;
}

/**
 * Makes something out of the typed line.
 *
 * With `keywords`, only a line that starts with one of them — "проект Ремонт"
 * — and the row gets the rest. Without, it is the default: offered for any
 * line, as the "+ Task" row is. There is one default; the first registered
 * wins.
 */
export interface SearchCreator {
    keywords?: readonly string[];
    row: (text: string) => SearchCreateRow | null;
}

export interface SearchSource {
    /** Unique id, usually the module's. */
    id: string;
    /** Group heading. Built-in sources give `labelKey`, so it follows Zenith's language. */
    label?: string;
    labelKey?: string;
    /** Lucide icon for its rows, unless a row has its own. */
    icon?: string;
    /** Where the group goes when two groups match equally well. Defaults to 100. */
    order?: number;
    /** Everything it can offer. Read when the panel opens and after a tick. */
    items?: () => SearchItem[];
    /** Rows the query itself calls for: a date → that day's note. */
    suggest?: (query: string) => SearchItem[];
    /** Rows that create something from the line. */
    creators?: () => SearchCreator[];
}

type Listener = () => void;

class SearchSourceRegistry {
    private sources = new Map<string, SearchSource>();
    private listeners = new Set<Listener>();
    private snapshot: SearchSource[] = [];

    /** Register (or replace) a source. Returns a disposer. */
    register(source: SearchSource): () => void {
        if (!source?.id) {
            console.error('Zenith: a search source was registered without an id — ignored.');
            return () => undefined;
        }
        this.sources.set(source.id, source);
        this.rebuild();
        return () => {
            // Only its own registration: a source replaced under the same id
            // since then belongs to someone else.
            if (this.sources.get(source.id) === source) {
                this.sources.delete(source.id);
                this.rebuild();
            }
        };
    }

    /** Stable, sorted snapshot (safe for useSyncExternalStore). */
    getSnapshot = (): SearchSource[] => this.snapshot;

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    private rebuild(): void {
        this.snapshot = Array.from(this.sources.values()).sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100)
        );
        this.listeners.forEach((l) => l());
    }
}

/** Process-wide registry shared by every module and the panel. */
export const searchSources = new SearchSourceRegistry();

/** React hook: the current, sorted list of sources. */
export function useSearchSources(): SearchSource[] {
    return useSyncExternalStore(searchSources.subscribe, searchSources.getSnapshot);
}
