import type { JournalEntry } from '../syncTypes';

/**
 * The history, with the repetition taken out of it.
 *
 * A journal line is written per publish, and a publish happens whenever a
 * setting changes — so dragging one widget across a dashboard writes six lines
 * that all say `dashboardBgSource`, and the page then showed six identical rows
 * with six identical timestamps. Thirty of those is what the history looked
 * like: a scrolling wall in which the one line that mattered — the merge that
 * changed a setting on this device — was indistinguishable from the noise.
 *
 * So consecutive lines that say exactly the same thing become one row with a
 * count. Consecutive rather than global: the order is chronological and it has
 * to stay that way, because "sent, then received, then sent again" is a story
 * and "sent ×2, received ×1" is not.
 */
export interface HistoryGroup {
    /** Stable across renders — the newest entry's clock is already unique. */
    id: string;
    kind: JournalEntry['kind'];
    keys: string[];
    /** How many journal lines this row stands for. */
    count: number;
    /** Wall time of the newest line in the run. */
    at: number;
    /**
     * The newest line, which is what an undo acts on.
     *
     * Undoing the whole run is the wrong offer: each line's `before` is the
     * state just before THAT line, so replaying them backwards is the only
     * correct way to unwind several, and one press that silently does six is
     * not something to build out of a row that exists to save vertical space.
     */
    latest: JournalEntry;
    /** Whether that newest line recorded enough to be undone. */
    undoable: boolean;
}

/** The same keys, in the same set — order is an artefact of the diff. */
function sameKeys(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sorted = [...b].sort();
    return [...a].sort().every((key, i) => key === sorted[i]);
}

function undoable(entry: JournalEntry): boolean {
    return !!entry.before && Object.keys(entry.before).length > 0;
}

/** `entries` newest first, as `readHistory` returns them. */
export function groupHistory(entries: JournalEntry[]): HistoryGroup[] {
    const groups: HistoryGroup[] = [];

    for (const entry of entries) {
        const last = groups[groups.length - 1];
        if (last && last.kind === entry.kind && sameKeys(last.keys, entry.keys)) {
            last.count++;
            continue;
        }

        groups.push({
            id: `${entry.at}-${entry.kind}`,
            kind: entry.kind,
            keys: entry.keys,
            count: 1,
            at: entry.wall,
            latest: entry,
            undoable: undoable(entry),
        });
    }

    return groups;
}
