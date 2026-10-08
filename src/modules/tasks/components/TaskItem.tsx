import React, { useCallback, useMemo, useRef, useState, type CSSProperties, type FC } from 'react';
import { Notice } from 'obsidian';
import { GripVertical, MoreHorizontal, Paperclip } from 'lucide-react';
import type { Task } from '../../../store/taskSlice';
import { useZenithStore } from '../../../store';
import { useApp } from '../../../context/AppContext';
import { useTranslation, type Translator } from '../../../core/i18n';
import { TaskWriter } from '../services/taskWriter';
import { useFeature } from '../../../core/useFeature';
import { useLongPress } from '../../../core/useLongPress';
import { useSwipeActions } from '../../../core/useSwipeActions';
import { getTodayString } from '../../../core/dateUtils';
import { openFileAtLine } from '../../../core/openInVault';
import { TaskStatusControl } from './taskStatusUi';
import { TaskEditorModal } from './TaskEditorModal';
import { SubtaskTree, flattenSubtasks } from './SubtaskList';
import { TaskAttachments } from './TaskAttachments';
import { TaskTimerButton } from './TaskTimerButton';
import { showLineMenu } from './taskMenu';
import { undoClosing, useTaskActions } from './useTaskActions';
import { formatDuration } from '../services/taskFormat';
import { countSubtasks } from '../services/taskStats';
import { isRunningFor } from '../services/taskTimer';
import { marginText } from '../services/taskMargin';
import { detailKey, setDetailsOpen } from '../services/taskViewState';
import type { Closing } from '../services/closingTasks';
import { useBranchAnchors } from './useBranchAnchors';
import { useSortableRows, type SortableRow } from './useSortableRows';
import type { DropPosition } from '../services/taskMove';

// ── Helpers ──────────────────────────────────────────

/** "Today", "In 3 days", "Oct 12" — for the places that say a date in a sentence. */
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
const firstLine = (text: string) =>
    text
        .split('\n')
        .find((l) => l.trim())
        ?.trim() ?? '';

/**
 * How far the subtasks are, as an arc that closes as they get done — read at a
 * glance where "3/7" has to be read.
 */
export const ProgressArc: FC<{ done: number; total: number; size?: number }> = ({
    done,
    total,
    size = 12,
}) => {
    const r = 5;
    const c = 2 * Math.PI * r;
    const part = total > 0 ? Math.min(1, done / total) : 0;
    return (
        <svg
            className="zenith-arc"
            width={size}
            height={size}
            viewBox="0 0 12 12"
            aria-hidden="true"
        >
            <circle className="zenith-arc__track" cx="6" cy="6" r={r} />
            {part > 0 && (
                <circle
                    className="zenith-arc__done"
                    cx="6"
                    cy="6"
                    r={r}
                    strokeDasharray={`${c * part} ${c}`}
                    transform="rotate(-90 6 6)"
                />
            )}
        </svg>
    );
};

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
    /**
     * The subtasks may be dragged. Apart from `reorderable` because a sort
     * orders tasks and never subtasks: under one this row has no handle of its
     * own and the lines beneath it keep theirs.
     */
    subtasksReorderable?: boolean;
    /** Under a smart group, which already says the day — see `marginText`. */
    grouped?: boolean;
    /** The moment of being closed, while it lasts. */
    closing?: Closing;
}

/**
 * One task, as a line of a planner.
 *
 * In the margin, the day — or under "Today", the hour — and a ↻ when it
 * repeats; a red "!" when it is urgent. Then the ink circle, the title, set
 * heavier as the priority rises, and under it the first line of its note in
 * the planner's italic. To the right, quietly: two tags, how far its subtasks
 * are, a paperclip.
 *
 * The circle closes it. A tap on the title opens the editor; a right-click,
 * or a long press, everything else. On a phone it swipes: right to close,
 * left to move it to tomorrow.
 */
export const TaskItem: FC<TaskItemProps> = ({
    task,
    rowRef,
    dragHandleProps,
    dragging = false,
    dropEdge = null,
    reorderable = false,
    subtasksReorderable = reorderable,
    grouped = false,
    closing,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const [editing, setEditing] = useState(false);
    // Bumped by "add subtask"; the tree opens its field in response.
    const [addSignal, setAddSignal] = useState(0);
    const subtasksOn = useFeature('tasks.subtasks');
    const attachmentsOn = useFeature('tasks.attachments');
    const timerOn = useFeature('tasks.timer');
    const dragOn = useFeature('tasks.dragDrop');
    const reorderMode = useZenithStore((s) => s.taskReorderMode);
    const timerRunning = useZenithStore((s) =>
        isRunningFor(s.settings.activeTimer, task.filePath, task.lineNumber)
    );
    const { changeStatus, schedule, remove, reload } = useTaskActions(task);

    const key = detailKey(task);
    const open = useZenithStore((s) => (s.settings.taskView.open ?? []).includes(key));

    const dimmed = task.status === 'done' || task.status === 'cancelled';
    const active = !dimmed && !closing;

    const swipe = useSwipeActions({
        enabled: active,
        onRight: () => void changeStatus('done'),
        onLeft: () => void schedule('tomorrow'),
    });

    // The row element is wanted by three things: the sortable hook (drop
    // targets), the branch measurement below, and the swipe's claim on touch.
    const rowEl = useRef<HTMLDivElement | null>(null);
    const swipeRowRef = swipe.rowRef;
    const setRow = useCallback(
        (el: HTMLDivElement | null) => {
            rowEl.current = el;
            rowRef?.(el);
            swipeRowRef(el);
        },
        [rowRef, swipeRowRef]
    );
    useBranchAnchors(rowEl);

    // One registry for the whole subtask tree, so a subtask can be dragged
    // between branches rather than only among its immediate siblings.
    const subtaskRows = useMemo(
        () => flattenSubtasks(task.subtasks, task.filePath),
        [task.subtasks, task.filePath]
    );

    const moveSubtask = async (
        source: SortableRow,
        target: SortableRow,
        position: DropPosition
    ) => {
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
        await reload();
    };

    const subtaskSortable = useSortableRows({
        rows: subtaskRows,
        onMove: moveSubtask,
        disabled: !dragOn || !subtasksReorderable,
    });

    const subs = useMemo(() => countSubtasks(task.subtasks), [task.subtasks]);
    const attachments = attachmentsOn ? (task.attachments ?? []) : [];
    const hasSubs = subtasksOn && subs.total > 0;

    // A finished task keeps its title and the day it was closed; what it was
    // made of is history, one tap away in the editor.
    const showDetails = active && open;

    const handleOpen = () => {
        if (task.filePath) void openFileAtLine(app, task.filePath, task.lineNumber - 1);
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
                onSchedule: dimmed ? undefined : (to) => void schedule(to),
                onAddSubtask: subtasksOn && !dimmed ? addSubtask : undefined,
                timer: timerOn && !dimmed,
                onEdit: () => setEditing(true),
                onOpen: handleOpen,
                onDelete: () => void remove(),
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

    const today = getTodayString();
    const margin = marginText(task, today, t, grouped);
    const tags = task.tags.slice(0, TAGS_SHOWN);
    const moreTags = task.tags.length - tags.length;
    const note = active && task.description ? firstLine(task.description) : '';
    const grip = dragOn && reorderable && active;
    const urgent = active && task.priority === 'urgent';
    const idleTimer = active && timerOn && !timerRunning;
    // How many buttons the hover brings up — the row keeps that much clear.
    const actionCount = Number(idleTimer) + Number(active) + Number(grip);

    const undo = () =>
        void undoClosing(closing?.key ?? task.id, reload, () => new Notice(t('tasks.undo.failed')));

    return (
        <>
            <div
                ref={setRow}
                className={[
                    'zenith-trow',
                    dimmed ? 'is-dimmed' : '',
                    showDetails ? 'is-open' : '',
                    dragging ? 'is-dragging' : '',
                    dropEdge ? `is-drop-${dropEdge}` : '',
                    closing ? `is-closing is-${closing.phase}` : '',
                    reorderMode && grip ? 'is-reordering' : '',
                    reorderMode && dragOn && subtasksReorderable && active
                        ? 'is-reordering-subs'
                        : '',
                    swipe.pulling ? `is-pulling-${swipe.pulling}` : '',
                    swipe.armed ? 'is-armed' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                onContextMenu={closing ? undefined : press.onContextMenu}
            >
                {active && (
                    <div className="zenith-trow__under" aria-hidden="true">
                        <span className="zenith-trow__under-done">{t('tasks.swipe.done')}</span>
                        <span className="zenith-trow__under-later">
                            {t('tasks.swipe.tomorrow')}
                        </span>
                    </div>
                )}

                <div className="zenith-trow__sheet" ref={swipe.sheetRef} {...swipe.handlers}>
                    <div className="zenith-trow__line">
                        <span className={`zenith-trow__margin is-${margin.tone}`}>
                            {closing ? (
                                closing.phase === 'held' &&
                                closing.undo && (
                                    <button
                                        type="button"
                                        className="zenith-trow__undo"
                                        onClick={undo}
                                        aria-label={t('tasks.undo.label', { name: task.title })}
                                    >
                                        {t('tasks.undo')}
                                    </button>
                                )
                            ) : (
                                <>
                                    {margin.text}
                                    {task.recurrence && !dimmed && (
                                        <span
                                            className="zenith-trow__repeat"
                                            title={t('tasks.repeats', { rule: task.recurrence })}
                                        >
                                            ↻
                                        </span>
                                    )}
                                </>
                            )}
                        </span>

                        <span className="zenith-trow__mark" aria-hidden={!urgent}>
                            {urgent && <span title={t('priority.urgent')}>!</span>}
                        </span>

                        <TaskStatusControl
                            status={task.status}
                            onChange={(status) => {
                                if (!closing) void changeStatus(status);
                            }}
                        />

                        <div
                            className="zenith-trow__head"
                            role="button"
                            tabIndex={closing ? -1 : 0}
                            data-task-head=""
                            onClick={() => {
                                if (closing || press.swallowClick() || swipe.swallowClick()) return;
                                setEditing(true);
                            }}
                            onKeyDown={(e) => {
                                if (closing) return;
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    setEditing(true);
                                } else if (e.key === ' ') {
                                    e.preventDefault();
                                    void changeStatus(dimmed ? 'todo' : 'done');
                                }
                            }}
                            onPointerDown={press.onPointerDown}
                            onPointerMove={press.onPointerMove}
                            onPointerUp={press.onPointerUp}
                            onPointerCancel={press.onPointerCancel}
                        >
                            <span className={`zenith-trow__title is-p-${task.priority}`}>
                                {/* Inline, so the ink of a closing task follows the words line by line. */}
                                <span className="zenith-trow__ink">{task.title}</span>
                            </span>
                            {note && <span className="zenith-trow__note">{note}</span>}
                        </div>

                        <div
                            className="zenith-trow__end"
                            style={{ '--zenith-tact': actionCount } as CSSProperties}
                        >
                            <div className="zenith-trow__side" onClick={stop}>
                                {active && (
                                    <>
                                        {tags.length > 0 && (
                                            <span
                                                className="zenith-trow__tags"
                                                title={task.tags.map((x) => `#${x}`).join(' ')}
                                            >
                                                {tags.map((tag) => `#${tag}`).join(' ')}
                                                {moreTags > 0 && ` +${moreTags}`}
                                            </span>
                                        )}
                                        {timerOn && task.spentMinutes !== undefined && (
                                            <span className="zenith-trow__spent">
                                                {formatDuration(task.spentMinutes)}
                                            </span>
                                        )}
                                        {hasSubs && (
                                            <button
                                                type="button"
                                                className={`zenith-trow__fold ${subs.done === subs.total ? 'is-complete' : ''}`}
                                                aria-expanded={showDetails}
                                                aria-label={t('tasks.subtasks.progress', {
                                                    done: subs.done,
                                                    total: subs.total,
                                                })}
                                                title={t('tasks.subtasks.progress', {
                                                    done: subs.done,
                                                    total: subs.total,
                                                })}
                                                onClick={toggleDetails}
                                            >
                                                <ProgressArc done={subs.done} total={subs.total} />
                                                {subs.done}/{subs.total}
                                            </button>
                                        )}
                                        {attachments.length > 0 && (
                                            <button
                                                type="button"
                                                className="zenith-trow__fold"
                                                aria-expanded={showDetails}
                                                title={t('tasks.editor.attachments')}
                                                onClick={toggleDetails}
                                            >
                                                <Paperclip size={12} />
                                                {attachments.length}
                                            </button>
                                        )}
                                        {/* A running timer is part of the row — a timer you
                                            cannot see is one you forget. */}
                                        {timerOn && timerRunning && (
                                            <TaskTimerButton
                                                filePath={task.filePath}
                                                lineNumber={task.lineNumber}
                                                title={task.title}
                                                timerMinutes={task.timerMinutes}
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            {/* What can be done to it comes up at the right edge on hover,
                                and what was there moves over for it — see tasks.css. */}
                            {actionCount > 0 && (
                                <div className="zenith-trow__actions" onClick={stop}>
                                    {idleTimer && (
                                        <TaskTimerButton
                                            filePath={task.filePath}
                                            lineNumber={task.lineNumber}
                                            title={task.title}
                                            timerMinutes={task.timerMinutes}
                                        />
                                    )}
                                    {active && (
                                        <button
                                            type="button"
                                            className="zenith-trow__action zenith-trow__more"
                                            aria-label={t('tasks.menu.more')}
                                            title={t('tasks.menu.more')}
                                            onClick={(e) => menu(e.nativeEvent)}
                                        >
                                            <MoreHorizontal size={15} />
                                        </button>
                                    )}
                                    {grip && (
                                        <button
                                            type="button"
                                            className="zenith-trow__action zenith-drag-handle"
                                            aria-label={t('tasks.reorder', { name: task.title })}
                                            title={t('tasks.reorderHint')}
                                            {...dragHandleProps}
                                        >
                                            <GripVertical size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {(showDetails && attachments.length > 0) || (subtasksOn && showDetails) ? (
                        <div className="zenith-trow__details">
                            {attachments.length > 0 && (
                                <TaskAttachments attachments={attachments} />
                            )}
                            {subtasksOn && (
                                <SubtaskTree
                                    filePath={task.filePath}
                                    parentLine={task.lineNumber}
                                    subtasks={task.subtasks}
                                    sortable={subtaskSortable}
                                    openAdd={addSignal}
                                    reorderable={dragOn && subtasksReorderable}
                                />
                            )}
                        </div>
                    ) : null}
                </div>
            </div>

            {editing && (
                <TaskEditorModal
                    editTask={task}
                    onClose={() => setEditing(false)}
                    onSaved={() => reload()}
                />
            )}
        </>
    );
};
