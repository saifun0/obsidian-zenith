/**
 * Content type configuration.
 *
 * A "content type" (book, movie, anime, or a user-defined one) bundles its
 * presentation (label, icon, colour), what the "creator" field is called for it
 * (Author / Director / Studio …), and which of the curated metadata fields it
 * shows. Types are user-editable in settings; when none are saved the built-in
 * {@link DEFAULT_CONTENT_TYPES} apply.
 *
 * Types saved by an older version also carry a `provider` — the online
 * catalogue it auto-filled from. Nothing reads it any more, and the settings
 * migration to version 11 drops it.
 */

/** The fixed set of metadata fields a type can choose to display. */
export type ContentFieldId =
    | 'year'
    | 'creator'
    | 'genres'
    | 'rating'
    | 'progress'
    | 'tags'
    | 'description';

export interface ContentFieldDef {
    id: ContentFieldId;
    /** Default label; a type may override `creator` via `creatorLabel`. */
    label: string;
    /** Translated label. `label` is the fallback where no dictionary is at hand. */
    labelKey: string;
}

/** Curated fields, in display order. */
export const CONTENT_FIELDS: readonly ContentFieldDef[] = [
    { id: 'year', label: 'Year', labelKey: 'content.field.year' },
    { id: 'creator', label: 'Creator', labelKey: 'content.field.creator' },
    { id: 'genres', label: 'Genres', labelKey: 'content.field.genres' },
    { id: 'rating', label: 'Rating', labelKey: 'content.field.rating' },
    { id: 'progress', label: 'Progress', labelKey: 'content.field.progress' },
    { id: 'tags', label: 'Tags', labelKey: 'content.field.tags' },
    { id: 'description', label: 'Description', labelKey: 'content.field.description' },
] as const;

export const CONTENT_FIELD_IDS: readonly ContentFieldId[] = CONTENT_FIELDS.map((f) => f.id);

export interface ContentTypeConfig {
    /** Stable slug stored as `type` in each item's frontmatter. */
    id: string;
    label: string;
    /** Kebab-case lucide id (rendered via Obsidian's setIcon / <ObsidianIcon>). */
    icon: string;
    /** Accent colour (hex) for the type badge/ribbon. */
    color: string;
    /** What the shared "creator" field is called for this type. */
    creatorLabel?: string;
    /** What one unit of progress is called: "pages", "episodes", "chapters"… */
    progressUnit?: string;
    /** Which curated fields this type displays, in {@link CONTENT_FIELDS} order. */
    fields: ContentFieldId[];
    /**
     * Switched off in settings: out of the tabs, the add form, the statistics
     * and the dashboard. Its items stay in the vault, untouched, and come back
     * the moment it is switched on.
     */
    hidden?: boolean;
}

const ALL_FIELDS: ContentFieldId[] = ['year', 'creator', 'genres', 'rating', 'progress', 'tags', 'description'];
const NO_PROGRESS: ContentFieldId[] = ['year', 'creator', 'genres', 'rating', 'tags', 'description'];

/**
 * Built-in types, applied whenever the user hasn't saved a custom set.
 *
 * Shows, games, music and "other" start switched off: a new library opens on
 * the four things most people keep, and the rest are one switch away. A
 * library from before this keeps them on — see the v15 migration.
 */
export const DEFAULT_CONTENT_TYPES: readonly ContentTypeConfig[] = [
    { id: 'book', label: 'Book', icon: 'book-open', color: '#8b5cf6', creatorLabel: 'Author', progressUnit: 'pages', fields: [...ALL_FIELDS] },
    { id: 'movie', label: 'Movie', icon: 'film', color: '#ec4899', creatorLabel: 'Director', progressUnit: 'minutes', fields: [...NO_PROGRESS] },
    { id: 'show', label: 'Show', icon: 'tv', color: '#3b82f6', creatorLabel: 'Network', progressUnit: 'episodes', fields: [...ALL_FIELDS], hidden: true },
    { id: 'anime', label: 'Anime', icon: 'sparkles', color: '#f59e0b', creatorLabel: 'Studio', progressUnit: 'episodes', fields: [...ALL_FIELDS] },
    { id: 'manga', label: 'Manga', icon: 'book', color: '#10b981', creatorLabel: 'Author', progressUnit: 'chapters', fields: [...ALL_FIELDS] },
    { id: 'game', label: 'Game', icon: 'gamepad-2', color: '#22c55e', creatorLabel: 'Developer', progressUnit: 'hours', fields: [...ALL_FIELDS], hidden: true },
    { id: 'music', label: 'Music', icon: 'music', color: '#eab308', creatorLabel: 'Artist', progressUnit: 'tracks', fields: [...NO_PROGRESS], hidden: true },
    { id: 'other', label: 'Other', icon: 'package', color: '#6b7280', creatorLabel: 'Creator', progressUnit: 'units', fields: [...ALL_FIELDS], hidden: true },
] as const;

/**
 * The effective type list: the user's saved types, or the built-ins when they
 * haven't customised any. Editing in settings materializes the full list.
 *
 * Types saved before a field existed are topped up from the built-in of the
 * same id — `progressUnit` in particular, so an existing "book" reads
 * "88 / 320 pages" rather than "88 / 320 units" without anyone re-saving
 * settings. Anything the user did set is left exactly as it is.
 */
export function effectiveContentTypes(saved: ContentTypeConfig[] | undefined): ContentTypeConfig[] {
    if (!saved || saved.length === 0) {
        return DEFAULT_CONTENT_TYPES.map((t) => ({ ...t, fields: [...t.fields] }));
    }
    if (saved.every((t) => t.progressUnit != null)) return saved;

    return saved.map((t) => {
        if (t.progressUnit != null) return t;
        const builtin = DEFAULT_CONTENT_TYPES.find((d) => d.id === t.id);
        return { ...t, progressUnit: builtin?.progressUnit ?? 'units' };
    });
}

/**
 * The config for a given type id, falling back to the "other" type (or a
 * synthesised default) so an item whose type was deleted still renders.
 */
export function resolveContentType(types: ContentTypeConfig[], id: string): ContentTypeConfig {
    return (
        types.find((t) => t.id === id) ??
        types.find((t) => t.id === 'other') ?? {
            id,
            label: id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Other',
            icon: 'package',
            color: '#6b7280',
           
            creatorLabel: 'Creator',
            progressUnit: 'units',
            fields: [...ALL_FIELDS],
        }
    );
}

/** The types switched on, in their order. */
export function visibleContentTypes(types: ContentTypeConfig[]): ContentTypeConfig[] {
    return types.filter((t) => !t.hidden);
}

/**
 * Whether items of a type id are shown. Only a type that exists and is
 * switched off hides its items: an item whose type was deleted, or never
 * configured, still shows — as "other" — rather than vanishing.
 */
export function isTypeShown(types: ContentTypeConfig[], id: string): boolean {
    return !types.find((t) => t.id === id)?.hidden;
}

/** Whether a type shows a given curated field. */
export function typeShowsField(type: ContentTypeConfig, field: ContentFieldId): boolean {
    return type.fields.includes(field);
}

/** A slug usable as a `type` id, derived from a label. */
export function slugifyTypeId(label: string): string {
    return label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
