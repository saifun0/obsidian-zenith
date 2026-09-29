import React, { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import {
    Calendar,
    ChevronDown,
    Flag,
    GripVertical,
    ListChecks,
    MoreHorizontal,
    Paperclip,
    Repeat,
    Timer,
} from 'lucide-react';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { TaskWriter } from '../services/taskWriter';
import { useFeature } from '../../../core/useFeature';
import { useLongPress } from '../../../core/useLongPress';
import { isOverdue, isToday } from '../../../core/dateUtils';
import { openFileAtLine } from '../../../core/openInVault';
import { TaskStatusControl } from './taskStatusUi';
import { TaskEditorModal } from './TaskEditorModal';
import { SubtaskTree, flattenSubtasks } from './SubtaskList';
import { TaskAttachments } from './TaskAttachments';
import { TaskTimerButton } from './TaskTimerButton';
import { showLineMenu } from './taskMenu';
import { formatDuration } from '../services/taskFormat';
import { countSubtasks } from '../services/taskStats';
import { detailKey, setDetailsOpen } from '../services/taskViewState';
import { useBranchAnchors } from './useBranchAnchors';
import { useSortableRows, type SortableRow } from './useSortableRows';
import type { DropPosition } from '../services/taskMove';

// ── Helpers ──────────────────────────────────────────

export function formatDueDate(dueDate: string, t: Translator): string {
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

/** Tags shown in the row; the rest are a count. */
const TAGS_SHOWN = 2;

/** A note's first line — what the row can hold of it. */
const firstLine = (text: string) => text.split('\n').find((l) => l.trim())?.trim() ?? '';

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

/**
 * One task as a line of the list.
 *
 * The title, and under it one quiet line of what decides when to do it — the
 * deadline, a repeat, a raised priority, the subtasks, two tags, time spent, a
 * paperclip — and the first line of its note. A tap opens the editor; a right
 * click, or a long press on a phone, opens everything else. The subtasks and
 * attachments fold away behind their counter and stay as they were left.
 *
 * It used to be a card with a row of six buttons under it on a phone, and a
 * five-subtask task took half the screen. What a task *is* now takes one or
 * two lines; what can be *done* to it waits behind a gesture.
 */
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
    // Bumped by "add subtask"; the tree opens its field in response.
    const [addSignal, setAddSignal] = useState(0);
    const subtasksOn = useFeature('tasks.subtasks');
    const attachmentsOn = useFeature('tasks.attachments');
    const timerOn = useFeature('tasks.timer');
    const dragOn = useFeature('tasks.dragDrop');

    const key = detailKey(task);
    const open = useZenithStore((s) => (s.settings.taskView.open ?? []).includes(key));

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
    // between branches rather than only among its immediate siblings.
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

    const subtaskSortable = useSortableRows({
        rows: subtaskRows,
        onMove: moveSubtask,
        disabled: !dragOn || !reorderable,
    });

    const subs = useMemo(() => countSubtasks(task.subtasks), [task.subtasks]);
    const attachments = attachmentsOn ? (task.attachments ?? []) : [];
    const hasSubs = subtasksOn && subs.total > 0;

    const overdue = !task.completed && isOverdue(task.dueDate);
    const today = !task.completed && isToday(task.dueDate);
    const dimmed = task.status === 'done' || task.status === 'cancelled';
    // A finished task keeps its title and the day it was closed; what it was
    // made of is history, one tap away in the editor.
    const showDetails = !dimmed && open;

    const changeStatus = async (status: TaskStatus) => {
        const prev = task.status;
        setTaskStatus(task.id, status); // optimistic
        if (!task.filePath) return;
        try {
            const ok = await new TaskWriter(app).setStatusInFile(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
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
            const ok = await new TaskWriter(app).deleteTaskInFile(
                task.filePath,
                task.lineNumber,
                task.title
            );
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

    const addSubtask = () => {
        if (!open) setDetailsOpen(key, true);
        setAddSignal((n) => n + 1);
    };

    const menu = (at: { x: number; y: number } | MouseEvent) =>
        showLineMenu(
            app,
            t,
            task,
            {
                onStatus: (s) => void changeStatus(s),
                onAddSubtask: subtasksOn && !dimmed ? addSubtask : undefined,
                timer: timerOn && !dimmed,
                onEdit: () => setEditing(true),
                onOpen: handleOpen,
                onDelete: () => void handleDelete(),
            },
            at
        );

    const press = useLongPress(
        (x, y) => menu({ x, y }),
        (e) => {
            e.preventDefault();
            menu(e.nativeEvent);
        }
    );

    const toggleDetails = (e: React.MouseEvent) => {
        e.stopPropagation();
        setDetailsOpen(key, !open);
    };

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    const tags = task.tags.slice(0, TAGS_SHOWN);
    const moreTags = task.tags.length - tags.length;
    const closedOn = task.status === 'done' ? task.doneDate : task.cancelledDate;
    const note = !dimmed && task.description ? firstLine(task.description) : '';
    const grip = dragOn && reorderable;

    return (
        <>
            <div
                ref={setRow}
                className={[
                    'zenith-task-item',
                    dimmed ? 'zenith-task-item--dimmed' : '',
                    showDetails ? 'is-open' : '',
                    dragging ? 'is-dragging' : '',
                    dropEdge ? `is-drop-${dropEdge}` : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                onContextMenu={press.onContextMenu}
            >
                <TaskStatusControl status={task.status} onChange={(status) => void changeStatus(status)} />

                <div className="zenith-task-item__content">
                    <div
                        className="zenith-task-item__head"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            if (!press.swallowClick()) setEditing(true);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') setEditing(true);
                        }}
                        onPointerDown={press.onPointerDown}
                        onPointerMove={press.onPointerMove}
                        onPointerUp={press.onPointerUp}
                        onPointerCancel={press.onPointerCancel}
                    >
                        <span className={`zenith-task-item__title ${dimmed ? 'is-dimmed' : ''}`}>
                            {task.title}
                        </span>

                        {!dimmed && (
                            <span className="zenith-tmeta">
                                {task.dueDate && (
                                    <span
                                        className={`zenith-tmeta__due ${overdue ? 'is-overdue' : ''} ${today ? 'is-today' : ''}`}
                                    >
                                        <Calendar size={11} />
                                        {formatDueDate(task.dueDate, t)}
                                        {task.dueTime && ` ${task.dueTime}`}
                                    </span>
                                )}
                                {task.recurrence && (
                                    <span className="zenith-tmeta__icon" title={task.recurrence}>
                                        <Repeat size={11} />
                                    </span>
                                )}
                                {(task.priority === 'high' || task.priority === 'urgent') && (
                                    <span
                                        className={`zenith-tmeta__icon zenith-tmeta__flag is-${task.priority}`}
                                        title={t(`priority.${task.priority}`)}
                                    >
                                        <Flag size={11} />
                                    </span>
                                )}
                                {hasSubs && (
                                    <button
                                        type="button"
                                        className={`zenith-tmeta__subs ${subs.done === subs.total ? 'is-complete' : ''}`}
                                        aria-expanded={showDetails}
                                        title={t('tasks.editor.subtasks')}
                                        onClick={toggleDetails}
                                    >
                                        <ListChecks size={11} />
                                        {t('tasks.subtasksDone', { done: subs.done, total: subs.total })}
                                        <ChevronDown size={11} className="zenith-tmeta__chevron" />
                                    </button>
                                )}
                                {tags.map((tag) => (
                                    <span key={tag} className="zenith-tmeta__tag">
                                        #{tag}
                                    </span>
                                ))}
                                {moreTags > 0 && (
                                    <span className="zenith-tmeta__tag" title={task.tags.slice(TAGS_SHOWN).join(', ')}>
                                        +{moreTags}
                                    </span>
                                )}
                                {timerOn && task.spentMinutes !== undefined && (
                                    <span className="zenith-tmeta__spent">
                                        <Timer size={11} />
                                        {formatDuration(task.spentMinutes)}
                                    </span>
                                )}
                                {attachments.length > 0 && (
                                    <button
                                        type="button"
                                        className="zenith-tmeta__clip"
                                        aria-expanded={showDetails}
                                        title={t('tasks.editor.attachments')}
                                        onClick={toggleDetails}
                                    >
                                        <Paperclip size={11} />
                                        {attachments.length}
                                    </button>
                                )}
                            </span>
                        )}

                        {note && <span className="zenith-task-item__note">{note}</span>}
                    </div>

                    {showDetails && attachments.length > 0 && <TaskAttachments attachments={attachments} />}

                    {subtasksOn && showDetails && (
                        <SubtaskTree
                            filePath={task.filePath}
                            parentLine={task.lineNumber}
                            subtasks={task.subtasks}
                            sortable={subtaskSortable}
                            openAdd={addSignal}
                            reorderable={dragOn && reorderable}
                        />
                    )}
                </div>

                <div className="zenith-task-item__side" onClick={stop}>
                    {dimmed ? (
                        closedOn && <span className="zenith-task-item__closed">{formatDueDate(closedOn, t)}</span>
                    ) : (
                        <>
                            {/* Shown on hover, and always while it runs — a
                                timer you cannot see is one you forget. */}
                            {timerOn && (
                                <TaskTimerButton
                                    filePath={task.filePath}
                                    lineNumber={task.lineNumber}
                                    title={task.title}
                                    timerMinutes={task.timerMinutes}
                                />
                            )}
                            <button
                                type="button"
                                className="zenith-task-item__action zenith-task-item__more"
                                aria-label={t('tasks.menu.more')}
                                title={t('tasks.menu.more')}
                                onClick={(e) => menu(e.nativeEvent)}
                            >
                                <MoreHorizontal size={15} />
                            </button>
                        </>
                    )}
                    {grip && (
                        <button
                            type="button"
                            className="zenith-task-item__action zenith-drag-handle"
                            aria-label={t('tasks.reorder', { name: task.title })}
                            title={t('tasks.reorderHint')}
                            {...dragHandleProps}
                        >
                            <GripVertical size={14} />
                        </button>
                    )}
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
