import React, { useMemo, type FC } from 'react';
import { Notice } from 'obsidian';
import {
    ClipboardList,
    AlertCircle,
    CalendarClock,
    Inbox,
    CheckCircle2,
    FileText,
    CircleX,
} from 'lucide-react';
import type { Task } from '../../../store/taskSlice';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { getTodayString, isOverdue, isToday } from '../../../core/dateUtils';
import { TaskWriter } from '../services/taskWriter';
import { bucketDrop, canDropInBucket, type BucketId } from '../services/taskBuckets';
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
}

interface Group {
    id: string;
    title?: string;
    icon?: React.ReactNode;
    tasks: Task[];
    /** Smart-bucket id, when this group is a date/status bucket. */
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

function buildGroups(tasks: Task[], groupMode: 'smart' | 'file' | 'none', t: Translator): Group[] {
    if (groupMode === 'none') return [{ id: 'all', tasks }];

    if (groupMode === 'file') {
        const byFile = new Map<string, Task[]>();
        for (const task of tasks) {
            const key = task.filePath || 'Unfiled';
            const list = byFile.get(key) ?? [];
            list.push(task);
            byFile.set(key, list);
        }
        return Array.from(byFile.entries())
            .sort((a, b) => fileLabel(a[0]).localeCompare(fileLabel(b[0])))
            .map(([path, groupTasks]) => ({
                id: path,
                title: fileLabel(path),
                icon: <FileText size={14} />,
                tasks: groupTasks,
                filePath: path,
                hint: t('tasks.drop.moveTo', { name: fileLabel(path) }),
            }));
    }

    // 'smart' — date buckets for active tasks, then done/cancelled groups.
    const active = tasks.filter((t) => t.status === 'todo' || t.status === 'in-progress');
    return [
        {
            id: 'overdue',
            title: t('tasks.group.overdue'),
            icon: <AlertCircle size={14} />,
            tasks: active.filter((t) => isOverdue(t.dueDate)),
            bucket: 'overdue',
        },
        {
            id: 'today',
            title: t('tasks.group.today'),
            icon: <CalendarClock size={14} />,
            tasks: active.filter((t) => isToday(t.dueDate)),
            bucket: 'today',
            hint: t('tasks.drop.today'),
        },
        {
            id: 'later',
            title: t('tasks.group.later'),
            icon: <Inbox size={14} />,
            tasks: active.filter((t) => !isOverdue(t.dueDate) && !isToday(t.dueDate)),
            bucket: 'later',
            hint: t('tasks.drop.later'),
        },
        {
            id: 'done',
            title: t('tasks.group.done'),
            icon: <CheckCircle2 size={14} />,
            tasks: tasks.filter((t) => t.status === 'done'),
            bucket: 'done',
            hint: t('tasks.drop.done'),
        },
        {
            id: 'cancelled',
            title: t('tasks.group.cancelled'),
            icon: <CircleX size={14} />,
            tasks: tasks.filter((t) => t.status === 'cancelled'),
            bucket: 'cancelled',
            hint: t('tasks.drop.cancelled'),
        },
    ];
}

// ── Component ────────────────────────────────────────

/**
 * TaskList — the grouped task list, and the owner of task drag-and-drop.
 *
 * The drag lives here rather than in each group because a drop can cross a
 * group boundary, and that means something: within a group it reorders lines in
 * the file, across groups it edits the task until it belongs where you dropped
 * it (schedules it for today, clears its date, completes it, or moves it to
 * another file). One shared row registry is what lets a single gesture do
 * either.
 */
export const TaskList: FC<TaskListProps> = ({ tasks, groupMode = 'none', reorderable = false }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const groups = useMemo(() => buildGroups(tasks, groupMode, t), [tasks, groupMode, t]);

    const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
    const rows: SortableRow[] = useMemo(
        () =>
            groups.flatMap((g) =>
                g.tasks.map((t) => ({
                    key: t.id,
                    filePath: t.filePath,
                    lineNumber: t.lineNumber,
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
        const last = [...group.tasks].reverse().find((t) => t.id !== source.key);
        if (!last) {
            if (zoneId !== source.zone) new Notice(t('tasks.error.move'));
            return;
        }
        await relocate(task, rowOf(last, zoneId), 'after');
    };

    const zoneDroppable = (zoneId: string, source: SortableRow) => {
        const group = groupById.get(zoneId);
        const task = byId.get(source.key);
        if (!group || !task) return false;
        if (zoneId === source.zone) return true;
        if (group.bucket) return canDropInBucket(group.bucket, task, getTodayString());
        // Grouping by file: any other file is a valid destination, as long as it
        // already holds a task to anchor the insert on.
        return group.tasks.length > 0;
    };

    const sortable = useSortableRows({
        rows,
        onMove: move,
        onDropInZone: dropInZone,
        isZoneDroppable: zoneDroppable,
        disabled: !reorderable,
    });

    if (tasks.length === 0) {
        return (
            <div
                className="zenith-tasks-empty"
                style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}
            >
                <ClipboardList
                    size={48}
                    strokeWidth={1}
                    style={{ opacity: 0.5, marginBottom: '16px' }}
                />
                <div style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-normal)' }}>
                    {t('tasks.empty')}
                </div>
                <div style={{ fontSize: '0.9rem', marginTop: '8px' }}>{t('tasks.emptyHint')}</div>
            </div>
        );
    }

    const draggedRow = rows.find((r) => r.key === sortable.dragKey);
    const activeZone = sortable.dropTarget?.kind === 'zone' ? sortable.dropTarget.zone : undefined;

    return (
        <div className={groupMode === 'none' ? undefined : 'zenith-task-list-grouped'}>
            {groups.map((group) => (
                <TaskGroup
                    key={group.id}
                    group={group}
                    sortable={sortable}
                    reorderable={reorderable}
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
