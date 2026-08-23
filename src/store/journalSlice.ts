import type { ZenithSliceCreator } from './types';

// ── Journal Types ────────────────────────────────────

/** What one tracker recorded for a day. */
export type TrackerValue = number | boolean;

/**
 * One daily note, reduced to what the calendar and statistics need.
 *
 * The note body is kept as a plain string (not rendered Markdown) — the day
 * panel shows a short preview and everything longer belongs in the editor, so
 * there's nothing to gain from parsing it further.
 */
export interface JournalEntry {
    /** The day this note is for, `YYYY-MM-DD`. Also the entry's identity. */
    date: string;
    filePath: string;
    /**
     * Recorded values by frontmatter key.
     *
     * Deliberately *not* filtered against the configured trackers: a value for a
     * tracker that was renamed or removed stays readable here, so re-adding the
     * tracker brings its history back instead of finding an empty history.
     */
    values: Record<string, TrackerValue>;
    /**
     * String-valued frontmatter properties, by key.
     *
     * Kept apart from `values` rather than widening it: trackers, their plots
     * and the whole statistics layer are typed on numbers and booleans, and a
     * string leaking in there would be a runtime surprise in a dozen places.
     * This is what carries records whose answer is a word — the prayer module's
     * `fajr: ontime` is the first of them.
     */
    texts: Record<string, string>;
    tags: string[];
    /** Body text with the frontmatter stripped. */
    body: string;
    /** Words in the body — the cheapest honest measure of "did I write today". */
    words: number;
    /** File modification time, for "last touched" style questions. */
    mtime: number;
}

// ── Journal Slice ────────────────────────────────────

export interface JournalSlice {
    journalEntries: JournalEntry[];
    journalLoading: boolean;

    setJournalEntries: (entries: JournalEntry[]) => void;
    /**
     * Swap in the entry parsed from a single file (or drop it when the file
     * stopped being a daily note). Mirrors `replaceTasksForFile`.
     */
    replaceJournalEntryForFile: (filePath: string, entry: JournalEntry | null) => void;
    setJournalLoading: (loading: boolean) => void;
}

export const createJournalSlice: ZenithSliceCreator<JournalSlice> = (set) => ({
    journalEntries: [],
    journalLoading: false,

    setJournalEntries: (entries) => set(() => ({ journalEntries: entries })),

    replaceJournalEntryForFile: (filePath, entry) =>
        set((state) => {
            const rest = state.journalEntries.filter((e) => e.filePath !== filePath);
            return { journalEntries: entry ? [...rest, entry] : rest };
        }),

    setJournalLoading: (loading) => set(() => ({ journalLoading: loading })),
});
