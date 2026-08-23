import React, { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import {
    Calendar,
    Tag,
    Repeat,
    Pencil,
    Trash2,
    ExternalLink,
    CheckCircle2,
    GripVertical,
    ListChecks,
    Timer,
    Plus,
} from 'lucide-react';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { TaskWriter } from '../services/taskWriter';
import { isOverdue, isToday } from '../../../core/dateUtils';
import { openFileAtLine } from '../../../core/openInVault';
import { TaskStatusControl } from './taskStatusUi';
import { TaskEditorModal } from './TaskEditorModal';
import { SubtaskTree, flattenSubtasks } from './SubtaskList';
import { TaskAttachments } from './TaskAttachments';
import { TaskTimerButton } from './TaskTimerButton';
import { formatDuration } from '../services/taskFormat';
import { countSubtasks } from '../services/taskStats';
import { useBranchAnchors } from './useBranchAnchors';
import { useSortableRows, type SortableRow } from './useSortableRows';
import type { DropPosition } from '../services/taskMove';

// ── Helpers ──────────────────────────────────────────

// Priority is drawn by `zenith-task-item--priority-*` as a wash under the row
// (see tasks.css), so nothing here needs a colour for it.

function formatDueDate(dueDate: string, t: Translator): string {
    const date = new Date(dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

    if (diffDays === 0) return t('date.today');
    if (diffDays === 1) return t('date.tomorrow');
    if (diffDays === -1) return t('date.yesterday');
    if (diffDays > 0 && diffDays <= 7) return t('date.inDays', { count: diffDays });
    if (diffDays < 0 && diffDays >= -7) return t('date.daysAgo', { count: Math.abs(diffDays) });
    return date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
}

interface TaskItemProps {
    task: Task;
    /** Measured by the sortable hook to work out drop targets. */
    rowRef?: (el: HTMLElement | null) => void;
    dragHandleProps?: {
        onPointerDown: (e: React.PointerEvent) => void;
        onPointerMove: (e: React.PointerEvent) => void;
        onPointerUp: (e: React.PointerEvent) => void;
        onPointerCancel: (e: React.PointerEvent) => void;
    };
    /** This row is the one being dragged. */
    dragging?: boolean;
    /** Draw the drop line above or below this row. */
    dropEdge?: 'before' | 'after' | null;
    /** Dragging is only meaningful while the list is in manual (file) order. */
    reorderable?: boolean;
}

export const TaskItem: FC<TaskItemProps> = ({
    task,
    rowRef,
    dragHandleProps,
    dragging = false,
    dropEdge = null,
    reorderable = false,
}) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);
    const removeTask = useZenithStore((s) => s.removeTask);
    const [editing, setEditing] = useState(false);
    // Bumped by the "add subtask" action; the tree opens its field in response.
    const [addSignal, setAddSignal] = useState(0);

    // The row element is wanted by two things: the sortable hook (to work out
    // drop targets) and the branch measurement below.
    const rowEl = useRef<HTMLDivElement | null>(null);
    const setRow = useCallback(
        (el: HTMLDivElement | null) => {
            rowEl.current = el;
            rowRef?.(el);
        },
        [rowRef]
    );
    useBranchAnchors(rowEl);

    // One registry for the whole subtask tree, so a subtask can be dragged
    // between branches rather than only among its immediate siblings. Rows are
    // flattened in render order, which is the order a drag reads them in.
    const subtaskRows = useMemo(
        () => flattenSubtasks(task.subtasks, task.filePath),
        [task.subtasks, task.filePath]
    );

    const moveSubtask = async (source: SortableRow, target: SortableRow, position: DropPosition) => {
        try {
            const ok = await new TaskWriter(app).moveTask(
                source.filePath,
                source.lineNumber,
                target.filePath,
                target.lineNumber,
                position
            );
            // `moveTask` refuses to drop a subtask inside its own subtree, which
            // would take its children with it and orphan them.
            if (!ok) new Notice(t('tasks.error.moveSubtask'));
        } catch (err) {
            console.error('Zenith: failed to move subtask:', err);
            new Notice(t('tasks.error.moveSubtask'));
        }
        await plugin.dataService.reloadTasks();
    };

    const subtaskSortable = useSortableRows({ rows: subtaskRows, onMove: moveSubtask });

    // Subtask completion, rolled up so the row says how much is left without
    // needing the tree expanded.
    const subs = useMemo(() => countSubtasks(task.subtasks), [task.subtasks]);

    const overdue = !task.completed && isOverdue(task.dueDate);
    const today = !task.completed && isToday(task.dueDate);
    const dimmed = task.status === 'done' || task.status === 'cancelled';

    const changeStatus = async (status: TaskStatus) => {
        const prev = task.status;
        setTaskStatus(task.id, status); // optimistic
        if (!task.filePath) return;
        try {
            const ok = await new TaskWriter(app).setStatusInFile(task.filePath, task.lineNumber, status);
            if (!ok) {
                setTaskStatus(task.id, prev);
                new Notice(t('tasks.error.update'));
            } else if (status === 'done' && task.recurrence) {
                // A recurring task inserted a new occurrence — reload to reflect it.
                void plugin.dataService.reloadTasks();
            }
        } catch (err) {
            console.error('Zenith: failed to set status:', err);
            setTaskStatus(task.id, prev);
            new Notice(t('tasks.error.save'));
        }
    };


    const handleOpen = () => {
        if (task.filePath) void openFileAtLine(app, task.filePath, task.lineNumber - 1);
    };

    const handleDelete = async () => {
        if (!task.filePath) return;
        removeTask(task.id); // optimistic
        try {
            const ok = await new TaskWriter(app).deleteTaskInFile(task.filePath, task.lineNumber);
            if (!ok) {
                new Notice(t('tasks.error.delete'));
                await plugin.dataService.reloadTasks();
            } else {
                void plugin.dataService.reloadTasks();
            }
        } catch (err) {
            console.error('Zenith: failed to delete task:', err);
            new Notice(t('tasks.error.delete'));
            await plugin.dataService.reloadTasks();
        }
    };

    return (
        <>
            <div
                ref={setRow}
                className={[
                    'zenith-task-item',
                    `zenith-task-item--priority-${task.priority}`,
                    dimmed ? 'zenith-task-item--dimmed' : '',
                    dragging ? 'is-dragging' : '',
                    dropEdge ? `is-drop-${dropEdge}` : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <TaskStatusControl status={task.status} onChange={changeStatus} />

                <div className="zenith-task-item__content">
                    <div className="zenith-task-item__title-row">
                        <span
                            className={`zenith-task-item__title ${dimmed ? 'is-dimmed' : ''}`}
                            onClick={handleOpen}
                            role="button"
                            title={t('common.openInFile')}
                        >
                            {task.title}
                        </span>
                    </div>

                    <div className="zenith-task-meta">
                        {task.recurrence && (
                            <span className="zenith-task-pill">
                                <Repeat size={12} />
                                {task.recurrence}
                            </span>
                        )}
                        {task.dueDate && (
                            <span className={`zenith-task-pill zenith-task-pill--date ${overdue ? 'is-overdue' : ''} ${today ? 'is-today' : ''}`}>
                                <Calendar size={12} />
                                {formatDueDate(task.dueDate, t)}
                                {/* The hour rides with the date rather than in a
                                    pill of its own: it qualifies that date and
                                    means nothing apart from it. */}
                                {task.dueTime && (
                                    <span className="zenith-task-pill__time">{task.dueTime}</span>
                                )}
                            </span>
                        )}
                        {task.spentMinutes !== undefined && (
                            <span className="zenith-task-pill zenith-task-pill--spent">
                                <Timer size={12} />
                                {t('tasks.spent', { time: formatDuration(task.spentMinutes) })}
                            </span>
                        )}
                        {task.completed && task.doneDate && (
                            <span className="zenith-task-pill zenith-task-pill--done">
                                <CheckCircle2 size={12} />
                                {task.doneDate}
                            </span>
                        )}
                        {subs.total > 0 && (
                            <span
                                className={`zenith-task-pill zenith-task-pill--subs ${
                                    subs.done === subs.total ? 'is-complete' : ''
                                }`}
                                title={t('tasks.editor.subtasks')}
                            >
                                <ListChecks size={12} />
                                {t('tasks.subtasksDone', { done: subs.done, total: subs.total })}
                            </span>
                        )}
                        {task.tags.map((tag) => (
                            <span key={tag} className="zenith-task-pill zenith-task-pill--tag">
                                <Tag size={12} />
                                {tag}
                            </span>
                        ))}
                    </div>

                    {task.description && (
                        <p className="zenith-task-notes">{task.description}</p>
                    )}

                    {task.attachments && task.attachments.length > 0 && (
                        <TaskAttachments attachments={task.attachments} />
                    )}

                    <SubtaskTree
                        filePath={task.filePath}
                        parentLine={task.lineNumber}
                        subtasks={task.subtasks}
                        sortable={subtaskSortable}
                        openAdd={addSignal}
                    />
                </div>

                <div className="zenith-task-item__actions">
                    {/* First in the cluster, and the only one that stays visible
                        while it runs — a timer you cannot see is one you forget
                        you left going. */}
                    {!dimmed && (
                        <TaskTimerButton
                            filePath={task.filePath}
                            lineNumber={task.lineNumber}
                            title={task.title}
                            timerMinutes={task.timerMinutes}
                        />
                    )}
                    {/* Lives with the other row actions rather than in the left
                        gutter: that column belongs to the tree connectors, and a
                        handle there pushed every checkbox out from under them. */}
                    <button
                        type="button"
                        className="zenith-task-item__action zenith-drag-handle"
                        aria-label={t('tasks.reorder', { name: task.title })}
                        title={t(reorderable ? 'tasks.reorderHint' : 'tasks.reorderUnavailable')}
                        disabled={!reorderable}
                        {...dragHandleProps}
                    >
                        <GripVertical size={14} />
                    </button>
                    <button
                        className="zenith-task-item__action"
                        onClick={handleOpen}
                        aria-label={t('common.openInFile')}
                        title={t('common.openInFile')}
                    >
                        <ExternalLink size={14} />
                    </button>
                    <button
                        className="zenith-task-item__action"
                        onClick={() => setAddSignal((n) => n + 1)}
                        aria-label={t('tasks.subtask.add')}
                        title={t('tasks.subtask.add')}
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        className="zenith-task-item__action"
                        onClick={() => setEditing(true)}
                        aria-label={t('common.edit')}
                        title={t('common.edit')}
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        className="zenith-task-item__action zenith-task-item__action--danger"
                        onClick={handleDelete}
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {editing && (
                <TaskEditorModal
                    editTask={task}
                    onClose={() => setEditing(false)}
                    onSaved={() => plugin.dataService.reloadTasks()}
                />
            )}
        </>
    );
};
