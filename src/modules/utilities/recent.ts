import type { WidgetSize } from '../dashboard/grid/gridTypes';

/**
 * The recent-notes widget, as data.
 *
 * Two lists that answer two questions: what did I change, and where was I. The
 * first is the vault's notes by the time they were last written; the second is
 * the workspace's own memory of what was opened. Sorting and cutting are here,
 * apart from Obsidian, so they can be tested with plain objects.
 */

export type RecentBy = 'modified' | 'opened';
export const RECENT_BYS: readonly RecentBy[] = ['modified', 'opened'] as const;

export interface RecentSettings extends Record<string, unknown> {
    recentBy: RecentBy;
}

export const DEFAULT_RECENT_SETTINGS: RecentSettings = { recentBy: 'modified' };

export function normalizeRecentSettings(raw: Record<string, unknown> | undefined): RecentSettings {
    return raw?.recentBy === 'opened' ? { recentBy: 'opened' } : DEFAULT_RECENT_SETTINGS;
}

/**
 * How many rows a card asks for. The small card shows one column of them, the
 * wide ones flow into as many columns as fit, so they ask for more.
 */
export const RECENT_LIMIT: Record<WidgetSize, number> = { sm: 6, md: 12, lg: 24 };

/** What the lists are made from: a file, as little of it as is needed. */
export interface RecentSource {
    path: string;
    /** Epoch ms of the last write. */
    mtime: number;
}

export interface RecentEntry {
    path: string;
    /** The file's name without its folder or `.md`. */
    name: string;
    /** The folder it is in; empty at the vault's root. */
    folder: string;
    mtime: number;
}

function entry(file: RecentSource): RecentEntry {
    const slash = file.path.lastIndexOf('/');
    return {
        path: file.path,
        name: file.path.slice(slash + 1).replace(/\.md$/i, ''),
        folder: slash > 0 ? file.path.slice(0, slash) : '',
        mtime: file.mtime,
    };
}

/** The notes written last, newest first. */
export function recentlyModified(files: readonly RecentSource[], limit: number): RecentEntry[] {
    return files
        .slice()
        .sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path))
        .slice(0, Math.max(0, limit))
        .map(entry);
}

/**
 * The files opened last, in the workspace's own order.
 *
 * The workspace remembers paths, not files, and keeps one after its file is
 * gone — so each is looked up, and a path that names nothing any more is
 * skipped rather than drawn as a row that opens nothing.
 */
export function recentlyOpened(
    paths: readonly string[],
    lookup: (path: string) => RecentSource | null,
    limit: number
): RecentEntry[] {
    const out: RecentEntry[] = [];
    const seen = new Set<string>();
    for (const path of paths) {
        if (out.length >= limit) break;
        if (seen.has(path)) continue;
        seen.add(path);
        const file = lookup(path);
        if (file) out.push(entry(file));
    }
    return out;
}
