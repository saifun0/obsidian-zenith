import type { ContentStatus } from '../core/constants';
import type { ZenithSliceCreator } from './types';

// ── Content Types ────────────────────────────────────

export interface ContentItem {
    id: string;
    title: string;
    status: ContentStatus;
    rating: number; // 0-10
    coverImage?: string;
    tags: string[];
    type: string; // book, movie, show, game, etc.
    filePath: string;
    description?: string;
    // ── Curated metadata (all optional, all the user's own) ──
    /** Release / publication year. */
    year?: number;
    /** Author / director / studio / … — label varies by type. */
    creator?: string;
    /** Genre labels. */
    genres?: string[];
    /** Raw progress as written in frontmatter — kept for unparseable legacy text. */
    progress?: string;
    /** Units consumed (episodes watched, pages read). Undefined = not tracked. */
    progressCurrent?: number;
    /** Total units, when known (12 episodes, 320 pages). */
    progressTotal?: number;
    /** `YYYY-MM-DD` the item was started, stamped on the status transition. */
    started?: string;
    /** `YYYY-MM-DD` the item was finished. */
    finished?: string;
    /** File creation time (ms) — powers "recently added" sorting. */
    createdAt?: number;
    /** File modification time (ms) — powers "recently updated" sorting. */
    updatedAt?: number;
}

// ── Content Slice ────────────────────────────────────

export interface ContentSlice {
    contentItems: ContentItem[];
    contentLoading: boolean;
    /**
     * An item the library should open on next render, set from outside the
     * gallery (the dashboard widget). Cleared once consumed, so clicking the
     * same card twice works.
     */
    focusContentId: string | null;
    /** A genre the gallery should filter by, set by clicking a genre chip. */
    contentGenreFilter: string | null;

    setContentItems: (items: ContentItem[]) => void;
    setFocusContentId: (id: string | null) => void;
    setContentGenreFilter: (genre: string | null) => void;
    /**
     * Swap in the item a single file holds (or drop it, when `item` is null).
     * Lets a vault change re-read one file instead of the whole folder.
     */
    replaceItemForFile: (filePath: string, item: ContentItem | null) => void;
    updateItemRating: (id: string, rating: number) => void;
    updateItemStatus: (id: string, status: ContentStatus) => void;
    /** Optimistic patch for any subset of an item's fields (progress, …). */
    patchContentItem: (id: string, patch: Partial<ContentItem>) => void;
    setContentLoading: (loading: boolean) => void;
}

export const createContentSlice: ZenithSliceCreator<ContentSlice> = (set) => ({
    contentItems: [],
    contentLoading: false,
    focusContentId: null,
    contentGenreFilter: null,

    setContentItems: (items) =>
        set(() => ({ contentItems: items })),

    setFocusContentId: (id) => set(() => ({ focusContentId: id })),

    setContentGenreFilter: (genre) => set(() => ({ contentGenreFilter: genre })),

    replaceItemForFile: (filePath, item) =>
        set((state) => ({
            contentItems: [
                ...state.contentItems.filter((i) => i.filePath !== filePath),
                ...(item ? [item] : []),
            ],
        })),

    updateItemRating: (id, rating) =>
        set((state) => ({
            contentItems: state.contentItems.map((item) =>
                item.id === id ? { ...item, rating } : item
            ),
        })),

    updateItemStatus: (id, status) =>
        set((state) => ({
            contentItems: state.contentItems.map((item) =>
                item.id === id ? { ...item, status } : item
            ),
        })),

    patchContentItem: (id, patch) =>
        set((state) => ({
            contentItems: state.contentItems.map((item) =>
                item.id === id ? { ...item, ...patch } : item
            ),
        })),

    setContentLoading: (loading) =>
        set(() => ({ contentLoading: loading })),
});
