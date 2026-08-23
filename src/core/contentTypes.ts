/**
 * Content type configuration.
 *
 * A "content type" (book, movie, anime, or a user-defined one) bundles its
 * presentation (label, icon, colour), which keyless metadata provider auto-fills
 * it, what the "creator" field is called for it (Author / Director / Studio …),
 * and which of the curated metadata fields it shows. Types are user-editable in
 * settings; when none are saved the built-in {@link DEFAULT_CONTENT_TYPES} apply.
 */

/**
 * Keyless metadata source a type searches when auto-filling.
 *
 * Each id names a *subject* (movie, anime, game) rather than a single API —
 * behind one id the service may try several keyless sources in order, so a
 * miss on one still fills the form. The `itunes-*` / `jikan-*` ids are the
 * original one-API-per-id names, kept so saved settings keep resolving; see
 * {@link normalizeProviderId}.
 */
export type MetadataProviderId =
    | 'movie'
    | 'show'
    | 'music'
    | 'books'
    | 'anime'
    | 'manga'
    | 'game'
    | 'wikipedia'
    | 'none'
    // ── Legacy aliases (pre-multi-source), never offered in the UI ──
    | 'itunes-movie'
    | 'itunes-show'
    | 'itunes-music'
    | 'jikan-anime'
    | 'jikan-manga';

/** The provider ids offered in settings, in menu order. */
export const METADATA_PROVIDER_IDS: readonly MetadataProviderId[] = [
    'movie',
    'show',
    'anime',
    'manga',
    'books',
    'game',
    'music',
    'wikipedia',
    'none',
] as const;

const LEGACY_PROVIDER_IDS: Record<string, MetadataProviderId> = {
    'itunes-movie': 'movie',
    'itunes-show': 'show',
    'itunes-music': 'music',
    'jikan-anime': 'anime',
    'jikan-manga': 'manga',
};

/** Resolve a stored provider id (possibly a legacy alias) to a current one. */
export function normalizeProviderId(id: MetadataProviderId | string | undefined): MetadataProviderId {
    if (!id) return 'none';
    return LEGACY_PROVIDER_IDS[id] ?? (id as MetadataProviderId);
}

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
}

/** Curated fields, in display order. */
export const CONTENT_FIELDS: readonly ContentFieldDef[] = [
    { id: 'year', label: 'Year' },
    { id: 'creator', label: 'Creator' },
    { id: 'genres', label: 'Genres' },
    { id: 'rating', label: 'Rating' },
    { id: 'progress', label: 'Progress' },
    { id: 'tags', label: 'Tags' },
    { id: 'description', label: 'Description' },
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
    provider: MetadataProviderId;
    /** What the shared "creator" field is called for this type. */
    creatorLabel?: string;
    /** What one unit of progress is called: "pages", "episodes", "chapters"… */
    progressUnit?: string;
    /** Which curated fields this type displays, in {@link CONTENT_FIELDS} order. */
    fields: ContentFieldId[];
}

const ALL_FIELDS: ContentFieldId[] = ['year', 'creator', 'genres', 'rating', 'progress', 'tags', 'description'];
const NO_PROGRESS: ContentFieldId[] = ['year', 'creator', 'genres', 'rating', 'tags', 'description'];

/** Built-in types, applied whenever the user hasn't saved a custom set. */
export const DEFAULT_CONTENT_TYPES: readonly ContentTypeConfig[] = [
    { id: 'book', label: 'Book', icon: 'book-open', color: '#8b5cf6', provider: 'books', creatorLabel: 'Author', progressUnit: 'pages', fields: [...ALL_FIELDS] },
    { id: 'movie', label: 'Movie', icon: 'film', color: '#ec4899', provider: 'movie', creatorLabel: 'Director', progressUnit: 'minutes', fields: [...NO_PROGRESS] },
    { id: 'show', label: 'Show', icon: 'tv', color: '#3b82f6', provider: 'show', creatorLabel: 'Network', progressUnit: 'episodes', fields: [...ALL_FIELDS] },
    { id: 'anime', label: 'Anime', icon: 'sparkles', color: '#f59e0b', provider: 'anime', creatorLabel: 'Studio', progressUnit: 'episodes', fields: [...ALL_FIELDS] },
    { id: 'manga', label: 'Manga', icon: 'book', color: '#10b981', provider: 'manga', creatorLabel: 'Author', progressUnit: 'chapters', fields: [...ALL_FIELDS] },
    { id: 'game', label: 'Game', icon: 'gamepad-2', color: '#22c55e', provider: 'game', creatorLabel: 'Developer', progressUnit: 'hours', fields: [...ALL_FIELDS] },
    { id: 'music', label: 'Music', icon: 'music', color: '#eab308', provider: 'music', creatorLabel: 'Artist', progressUnit: 'tracks', fields: [...NO_PROGRESS] },
    { id: 'other', label: 'Other', icon: 'package', color: '#6b7280', provider: 'wikipedia', creatorLabel: 'Creator', progressUnit: 'units', fields: [...ALL_FIELDS] },
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
            provider: 'wikipedia',
            creatorLabel: 'Creator',
            progressUnit: 'units',
            fields: [...ALL_FIELDS],
        }
    );
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
