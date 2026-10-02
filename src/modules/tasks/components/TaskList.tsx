import React, { useMemo, type FC } from 'react';
import { Notice } from 'obsidian';
import type { Task } from '../../../store/taskSlice';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import { TaskWriter } from '../services/taskWriter';
import {
    BUCKETS,
    bucketDrop,
    bucketOf,
    canDropInBucket,
    type BucketId,
} from '../services/taskBuckets';
import { isClosingOf, useClosingTasks, type Closing } from '../services/closingTasks';
import { compareTasks, type TaskQuery } from '../services/taskFilter';
import type { DropPosition } from '../services/taskMove';
import { TaskGroup } from './TaskGroup';
import { useSortableRows, type SortableRow } from './useSortableRows';

// ── Props ────────────────────────────────────────────

interface TaskListProps {
    tasks: Task[];
    /** How to group the list. `'none'` renders a flat list. */
    groupMode?: 'smart' | 'file' | 'none';
    /**
     * Whether the current sort reflects file order. Drag-to-reorder edits file
     * order, so in any other sort the list would snap straight back.
     */
    reorderable?: boolean;
    /** The sort in force, which a task being closed is slotted back by. */
    sort?: TaskQuery['sort'];
    /** Shown when the list is empty — what to do about it, not a mood. */
    empty?: React.ReactNode;
}

/** One row of a group: a task, and its moment of closing if it is in one. */
export interface ListItem {
    key: string;
    task: Task;
    closing?: Closing;
}

interface Group {
    id: string;
    title?: string;
    items: ListItem[];
    /** Smart-group id, when this group is a date/status bucket. */
    bucket?: BucketId;
    /** Source file, when grouping by file. */
    filePath?: string;
    /** Shown in an empty bucket while dragging. */
    hint?: string;
}

// ── Helpers ──────────────────────────────────────────

/** Turn a vault path into a readable file/project label. */
function fileLabel(path: string): string {
    const base = path.split('/').pop() ?? path;
    return base.replace(/\.md$/i, '');
}

/** Drop hints for the groups that take a drop; see `bucketDrop`. */
const HINT: Partial<Record<BucketId, string>> = {
    today: 'tasks.drop.today',
    tomorrow: 'tasks.drop.tomorrow',
    week: 'tasks.drop.week',
    nodate: 'tasks.drop.nodate',
    done: 'tasks.drop.done',
    cancelled: 'tasks.drop.cancelled',
};

/**
 * The list's items, with the tasks being closed put back where they were.
 *
 * A task that has just been closed is still in `tasks` when the tab shows
 * finished ones — found by what it was, see `isClosingOf` — and is missing
 * when the tab does not; then its snapshot stands in for it, slotted in by
 * the list's own order.
 */
function withClosing(
    tasks: Task[],
    closings: Record<string, Closing>,
    sort: TaskQuery['sort']
): ListItem[] {
    const entries = Object.entries(closings);
    const items: ListItem[] = tasks.map((task) => {
        const hit = entries.find(([, c]) => isClosingOf(c, task));
        return { key: task.id, task, closing: hit?.[1] };
    });
    const cmp = compareTasks(sort);
    for (const [id, closing] of entries) {
        if (items.some((it) => it.closing === closing)) continue;
        const ghost: ListItem = { key: `closing:${id}`, task: closing.snapshot, closing };
        const at = items.findIndex((it) => cmp(closing.snapshot, it.task) < 0);
        if (at === -1) items.push(ghost);
        else items.splice(at, 0, ghost);
    }
    return items;
}

function buildGroups(
    items: ListItem[],
    groupMode: 'smart' | 'file' | 'none',
    t: Translator,
    today: string
): Group[] {
    if (groupMode === 'none') return [{ id: 'all', items }];

    if (groupMode === 'file') {
        const byFile = new Map<string, ListItem[]>();
        for (const item of items) {
            const key = item.task.filePath || 'Unfiled';
            const list = byFile.get(key) ?? [];
            list.push(item);
            byFile.set(key, list);
        }
        return Array.from(byFile.entries())
            .sort((a, b) => fileLabel(a[0]).localeCompare(fileLabel(b[0])))
            .map(([path, groupItems]) => ({
                id: path,
                title: fileLabel(path),
                items: groupItems,
                filePath: path,
                hint: t('tasks.drop.moveTo', { name: fileLabel(path) }),
            }));
    }

    // Smart: the diary's groups, a task being closed staying in the one it was in.
    const byBucket = new Map<BucketId, ListItem[]>(BUCKETS.map((b) => [b, []]));
    for (const item of items) {
        const bucket = item.closing ? item.closing.bucket : bucketOf(item.task, today);
        byBucket.get(bucket)?.push(item);
    }
    return BUCKETS.map((bucket) => {
        const hint = HINT[bucket];
        return {
            id: bucket,
            title: t(`tasks.group.${bucket}`),
            items: byBucket.get(bucket) ?? [],
            bucket,
            hint: hint ? t(hint) : undefined,
        };
    });
}

// ── Component ────────────────────────────────────────

/**
 * TaskList — the grouped task list, and the owner of task drag-and-drop.
 *
 * The drag lives here rather than in each group because a drop can cross a
 * group boundary, and that means something: within a group it reorders lines in
 * the file, across groups it edits the task until it belongs where you dropped
 * it (schedules it, clears its date, completes it, or moves it to another
 * file). One shared row registry is what lets a single gesture do either.
 */
export const TaskList: FC<TaskListProps> = ({
    tasks,
    groupMode = 'none',
    reorderable = false,
    sort = 'manual',
    empty,
}) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const closings = useClosingTasks((s) => s.items);
    const today = getTodayString();
    const items = useMemo(() => withClosing(tasks, closings, sort), [tasks, closings, sort]);
    const groups = useMemo(
        () => buildGroups(items, groupMode, t, today),
        [items, groupMode, t, today]
    );

    const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
    // A task in its moment of closing is not something to drag.
    const rows: SortableRow[] = useMemo(
        () =>
            groups.flatMap((g) =>
                g.items
                    .filter((it) => !it.closing)
                    .map((it) => ({
                        key: it.task.id,
                        filePath: it.task.filePath,
                        lineNumber: it.task.lineNumber,
                        zone: g.id,
                    }))
            ),
        [groups]
    );

    const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

    const reload = () => plugin.dataService.reloadTasks();

    /** Move a task's block next to another task's, in either file. */
    const relocate = async (task: Task, dest: SortableRow, position: DropPosition) => {
        try {
            const ok = await new TaskWriter(app).moveTask(
                task.filePath,
                task.lineNumber,
                dest.filePath,
                dest.lineNumber,
                position
            );
            if (!ok) new Notice(t('tasks.error.move'));
        } catch (err) {
            console.error('Zenith: failed to move task:', err);
            new Notice(t('tasks.error.move'));
        }
        await reload();
    };

    /** Edit a task until it genuinely belongs in `bucket`. */
    const rebucket = async (task: Task, bucket: BucketId) => {
        const patch = bucketDrop(bucket, task, getTodayString());
        if (!patch) return;
        try {
            const writer = new TaskWriter(app);
            // Dates first, then status: marking done stamps a ✅ and may insert
            // the next occurrence of a recurring task, so it has to go last.
            // Only the date: the rest of the line — its hour, time spent, a
            // completion stamp — is not the drop's to rewrite.
            if (patch.dueDate !== undefined) {
                await writer.updateTaskInFile(
                    task.filePath,
                    task.lineNumber,
                    { dueDate: patch.dueDate },
                    task.title
                );
            }
            if (patch.status && patch.status !== task.status) {
                await writer.setStatusInFile(
                    task.filePath,
                    task.lineNumber,
                    patch.status,
                    task.title
                );
            }
        } catch (err) {
            console.error('Zenith: failed to apply drop:', err);
            new Notice(t('tasks.error.save'));
        }
        await reload();
    };

    const rowOf = (t: Task, zone: string): SortableRow => ({
        key: t.id,
        filePath: t.filePath,
        lineNumber: t.lineNumber,
        zone,
    });

    /** Landing on a specific row. */
    const move = async (source: SortableRow, target: SortableRow, position: DropPosition) => {
        const task = byId.get(source.key);
        if (!task) return;

        const targetGroup = target.zone ? groupById.get(target.zone) : undefined;
        // Crossing into a smart bucket is a data change, not a reorder: the
        // bucket is only a rendering of the task's date and status.
        if (source.zone !== target.zone && targetGroup?.bucket) {
            await rebucket(task, targetGroup.bucket);
            return;
        }
        await relocate(task, target, position);
    };

    /** Landing in a group's empty space or on its header. */
    const dropInZone = async (source: SortableRow, zoneId: string) => {
        const task = byId.get(source.key);
        const group = groupById.get(zoneId);
        if (!task || !group) return;

        if (zoneId !== source.zone && group.bucket) {
            await rebucket(task, group.bucket);
            return;
        }

        // Otherwise it means "put it last here" — anchored on the final row that
        // isn't the task being dragged.
        const last = [...group.items]
            .reverse()
            .find((it) => !it.closing && it.task.id !== source.key);
        if (!last) {
            if (zoneId !== source.zone) new Notice(t('tasks.error.move'));
            return;
        }
        await relocate(task, rowOf(last.task, zoneId), 'after');
    };

    const zoneDroppable = (zoneId: string, source: SortableRow) => {
        const group = groupById.get(zoneId);
        const task = byId.get(source.key);
        if (!group || !task) return false;
        if (zoneId === source.zone) return true;
        if (group.bucket) return canDropInBucket(group.bucket, task, getTodayString());
        // Grouping by file: any other file is a valid destination, as long as it
        // already holds a task to anchor the insert on.
        return group.items.length > 0;
    };

    const sortable = useSortableRows({
        rows,
        onMove: move,
        onDropInZone: dropInZone,
        isZoneDroppable: zoneDroppable,
        disabled: !reorderable,
    });

    if (items.length === 0) return <>{empty}</>;

    const draggedRow = rows.find((r) => r.key === sortable.dragKey);
    const activeZone = sortable.dropTarget?.kind === 'zone' ? sortable.dropTarget.zone : undefined;

    return (
        <div className={`zenith-tlist ${groupMode === 'none' ? 'is-flat' : 'is-grouped'}`}>
            {groups.map((group) => (
                <TaskGroup
                    key={group.id}
                    group={group}
                    sortable={sortable}
                    reorderable={reorderable}
                    grouped={groupMode === 'smart'}
                    /* An empty group is rendered only while a drag is in flight,
                       and only if it would accept what's being dragged. */
                    droppable={!!draggedRow && zoneDroppable(group.id, draggedRow)}
                    zoneActive={activeZone === group.id}
                />
            ))}
        </div>
    );
};

export type { Group as TaskListGroup };
