/**
 * Zenith — Global Constants
 * 
 * All view types, plugin IDs, and magic strings centralized here
 * to prevent typos and enable easy refactoring.
 */

// ── Plugin ───────────────────────────────────────────
export const PLUGIN_ID = 'zenith';
export const PLUGIN_NAME = 'Zenith';

// ── View Types ───────────────────────────────────────
export const VIEW_TYPE_DASHBOARD = 'zenith-dashboard-view';
export const VIEW_TYPE_TASKS = 'zenith-tasks-view';
export const VIEW_TYPE_CONTENT = 'zenith-content-view';
export const VIEW_TYPE_MEDIA = 'zenith-media-view';
export const VIEW_TYPE_JOURNAL = 'zenith-journal-view';
export const VIEW_TYPE_TASKS_CALENDAR = 'zenith-tasks-calendar-view';
export const VIEW_TYPE_SYNC = 'zenith-sync-view';
export const VIEW_TYPE_PROJECTS = 'zenith-projects-view';
/**
 * Retired: the prayer tracker is a modal now. Kept only so PrayerModule can
 * detach leaves left in workspace layouts saved while it was still a view.
 */
export const VIEW_TYPE_PRAYER = 'zenith-prayer-view';

// ── Image file extensions (Media module) ─────────────
export const IMAGE_EXTENSIONS = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
] as const;

// ── Default Folder Paths ─────────────────────────────
//
// Every one of these has to name a folder `VAULT_STRUCTURE` actually creates.
// `tasks` and `content` did not, so a vault scaffolded by Zenith's own button
// started life pointing at two folders Zenith had not made — and said so in the
// console, on every reload, for as long as nobody noticed. `defaultFolders.test`
// is what keeps the two lists in step from here.
// Each is a folder of its own inside a scaffolded one, for the same reason the
// journal's is: these folders are SCANNED, and a task folder pointing at a
// general-purpose one turns every stray checkbox in every unfiled note into a
// task. A dedicated subfolder holds only what Zenith put there.
export const DEFAULT_TASKS_FOLDER = '10 Inbox/Tasks';
export const DEFAULT_CONTENT_FOLDER = '30 Content';
export const DEFAULT_PROJECTS_FOLDER = '20 Projects';
/**
 * Daily notes live in their own subfolder of the scaffold's journal folder,
 * which leaves the folder itself free for the weekly/monthly notes and indexes
 * that tend to accumulate beside a journal.
 *
 * Must track `VAULT_STRUCTURE` in `VaultScaffoldService`: a fresh vault gets its
 * folders from there and its journal path from here, and the two disagreeing
 * means the scaffold builds a journal folder the journal never writes to.
 */
export const DEFAULT_JOURNAL_FOLDER = '15 Journal/Daily note';

/**
 * The journal's first default, before daily notes moved into a subfolder and
 * before the folder was renumbered to `15 Journal`.
 *
 * This is only ever READ — it recognises a config that never chose a folder, so
 * the migration in `settingsSlice` can move it to the current default. Nothing
 * in Zenith writes `11 Journal` any more.
 */
export const LEGACY_JOURNAL_FOLDER = '11 Journal';

// ── Journal ──────────────────────────────────────────
/** Filename pattern for a daily note (see `journalDates.ts` for the tokens). */
export const DEFAULT_JOURNAL_FORMAT = 'YYYY-MM-DD';

/**
 * Code-block language that renders the day's check-in inside the note itself:
 *
 * ```zenith-daily
 * ```
 */
export const JOURNAL_BLOCK_LANG = 'zenith-daily';

/**
 * Code-block language that renders the day's prayer tracker inside the note:
 *
 * ```zenith-prayer
 * ```
 */
export const PRAYER_BLOCK_LANG = 'zenith-prayer';

// ── Priority Levels ──────────────────────────────────
// `none` is the default (no explicit priority marker). Ordered ascending by weight.
export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_WEIGHT: Record<Priority, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
};

// ── Task Statuses (4-state checkbox) ─────────────────
// Mapped to Markdown checkbox characters so they round-trip with the Tasks/
// Things convention: `[ ]` todo, `[/]` in-progress, `[x]` done, `[-]` cancelled.
export const TASK_STATUSES = ['todo', 'in-progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_META: Record<TaskStatus, { label: string; char: string }> = {
    todo: { label: 'To do', char: ' ' },
    'in-progress': { label: 'In progress', char: '/' },
    done: { label: 'Done', char: 'x' },
    cancelled: { label: 'Cancelled', char: '-' },
};

/** Map a checkbox character to a task status (unknown → todo). */
export function statusFromChar(ch: string): TaskStatus {
    switch (ch.toLowerCase()) {
        case 'x':
            return 'done';
        case '/':
            return 'in-progress';
        case '-':
            return 'cancelled';
        default:
            return 'todo';
    }
}

/** The checkbox character for a status. */
export function charFromStatus(status: TaskStatus): string {
    return STATUS_META[status].char;
}

// ── Content Statuses ─────────────────────────────────
export const CONTENT_STATUSES = ['backlog', 'in-progress', 'completed', 'dropped'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

// ── Task Filter Tabs ─────────────────────────────────
/** `i18n` is the suffix under `tasks.tab.*`; `label` is the English fallback. */
export const TASK_TABS = [
    { id: 'all', label: 'All', i18n: 'all' },
    { id: 'active', label: 'Active', i18n: 'active' },
    { id: 'in-progress', label: 'In progress', i18n: 'inProgress' },
    { id: 'done', label: 'Done', i18n: 'done' },
] as const;
