import { sanitizeIconSvg, type SvgProblem } from './iconSvg';

/**
 * The custom-icon registry.
 *
 * Icons in Zenith are referenced by a plain string everywhere — a content
 * type's `icon`, a journal tracker's, a folder's, a module manifest's — and
 * those strings are resolved by Obsidian's `setIcon` or by looking up a
 * lucide-react component. Custom icons join that same namespace under a
 * reserved prefix, so nothing that stores an icon id needs to learn a second
 * shape and old settings keep working untouched.
 *
 * Deliberately NOT `Obsidian.addIcon`, which is the obvious first idea: it is
 * append-only. Uninstall a pack and its icons would linger in Obsidian's global
 * registry until the app restarts, still offered by the picker, still resolving
 * for other plugins. Owning the map is what makes unload mean something.
 */

/** Marks an id as ours. Lucide ids never contain a colon. */
export const ICON_PREFIX = 'zi:';

/**
 * Where an icon came from, so it can be reclaimed as a unit. Only packs now:
 * modules that brought their own artwork left with third-party modules.
 */
export type IconSourceKind = 'pack';

export interface RegisteredIcon {
    /** Full id, e.g. `zi:acme/logo`. */
    id: string;
    /** Name within its source, e.g. `logo`. */
    name: string;
    /** Pack id. */
    source: string;
    sourceKind: IconSourceKind;
    /** Sanitized, ready to inline. */
    svg: string;
}

export interface IconSource {
    id: string;
    kind: IconSourceKind;
    /** Display name from `pack.json` / the module manifest. */
    label: string;
    author?: string;
    icons: RegisteredIcon[];
}

/** Names must survive being used in an id, a CSS class and a file name. */
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function isSafeIconName(name: unknown): name is string {
    return typeof name === 'string' && name.length <= 64 && SAFE_NAME.test(name);
}

/** Build the registry id for a source + name pair. */
export function iconId(source: string, name: string): string {
    return `${ICON_PREFIX}${source}/${name}`;
}

/**
 * True when an id refers to a custom icon rather than a built-in one.
 *
 * Deliberately not a `id is string` type predicate: callers pass
 * `string | undefined`, and a predicate would narrow the *negative* branch to
 * `undefined` — telling TypeScript that a plain lucide name is impossible right
 * where the built-in path handles it.
 */
export function isCustomIconId(id: unknown): boolean {
    return typeof id === 'string' && id.startsWith(ICON_PREFIX);
}

export type IconAddResult =
    | { ok: true; icon: RegisteredIcon }
    | { ok: false; problem: SvgProblem | { kind: 'bad-name'; name: unknown } };

/**
 * A registry instance. One per plugin; passed explicitly rather than reached
 * for as a singleton so tests can build a throwaway one.
 */
export class IconRegistry {
    private icons = new Map<string, RegisteredIcon>();
    private sources = new Map<string, IconSource>();
    private listeners = new Set<() => void>();
    /** Bumped on every change; lets React subscriptions use a cheap snapshot. */
    private revision = 0;

    /** Register (or replace) one icon. The SVG is sanitized here, once. */
    add(
        source: string,
        sourceKind: IconSourceKind,
        name: string,
        rawSvg: string,
        options: { label?: string; author?: string; silent?: boolean } = {}
    ): IconAddResult {
        if (!isSafeIconName(name)) {
            return { ok: false, problem: { kind: 'bad-name', name } };
        }

        const id = iconId(source, name);
        // The id doubles as the prefix for the icon's internal ids, which is
        // what keeps two logos from sharing a `<linearGradient id="a">`.
        const checked = sanitizeIconSvg(rawSvg, { idPrefix: id });
        if (!checked.ok) return { ok: false, problem: checked.problem };

        const icon: RegisteredIcon = { id, name, source, sourceKind, svg: checked.svg };
        this.icons.set(id, icon);

        const bucket = this.ensureSource(source, sourceKind, options.label, options.author);
        const existing = bucket.icons.findIndex((i) => i.id === id);
        if (existing >= 0) bucket.icons[existing] = icon;
        else bucket.icons.push(icon);

        if (!options.silent) this.emit();
        return { ok: true, icon };
    }

    /** Describe a source even before its icons land (an empty pack is a fact). */
    ensureSource(
        source: string,
        kind: IconSourceKind,
        label?: string,
        author?: string
    ): IconSource {
        let bucket = this.sources.get(source);
        if (!bucket) {
            bucket = { id: source, kind, label: label ?? source, author, icons: [] };
            this.sources.set(source, bucket);
        } else {
            if (label) bucket.label = label;
            if (author) bucket.author = author;
        }
        return bucket;
    }

    /**
     * Drop everything one pack or module contributed.
     *
     * This is the whole reason the registry exists rather than deferring to
     * Obsidian: uninstalling has to actually remove the icons.
     */
    removeSource(source: string): void {
        const bucket = this.sources.get(source);
        if (!bucket) return;
        for (const icon of bucket.icons) this.icons.delete(icon.id);
        this.sources.delete(source);
        this.emit();
    }

    get(id: string): RegisteredIcon | undefined {
        return this.icons.get(id);
    }

    /** Inline-ready markup for an id, or undefined when it isn't ours. */
    svg(id: string): string | undefined {
        return this.icons.get(id)?.svg;
    }

    has(id: string): boolean {
        return this.icons.has(id);
    }

    listSources(): IconSource[] {
        return [...this.sources.values()].sort((a, b) => a.label.localeCompare(b.label));
    }

    listIcons(): RegisteredIcon[] {
        return [...this.icons.values()];
    }

    get size(): number {
        return this.icons.size;
    }

    /** Cheap value for `useSyncExternalStore`: changes iff the registry did. */
    getRevision = (): number => this.revision;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Batch a bulk load into a single notification. */
    emit(): void {
        this.revision++;
        for (const listener of this.listeners) {
            try {
                listener();
            } catch (err) {
                console.error('Zenith: icon registry listener threw', err);
            }
        }
    }
}
