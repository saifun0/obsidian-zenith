import React, { useEffect, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { GripVertical, Paperclip } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import type { SubTask } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useFeature } from '../../../core/useFeature';
import { useLongPress } from '../../../core/useLongPress';
import { openFileAtLine } from '../../../core/openInVault';
import { confirmDelete } from '../../../core/ConfirmModal';
import { TaskWriter } from '../services/taskWriter';
import { countSubtasks } from '../services/taskStats';
import { formatDuration } from '../services/taskFormat';
import { TaskStatusControl } from './taskStatusUi';
import { TaskTimerButton } from './TaskTimerButton';
import { SubtaskEditorModal } from './SubtaskEditorModal';
import { showLineMenu } from './taskMenu';
import type { SortableApi, SortableRow } from './useSortableRows';

interface SubtaskTreeProps {
    filePath: string;
    /** Line number of the parent (task or subtask) these subtasks belong to. */
    parentLine: number;
    subtasks: SubTask[];
    depth?: number;
    /**
     * Drag registry shared by every level of one task's tree, so a subtask can
     * be dragged out of one branch and into another. Owned by `TaskItem`.
     */
    sortable: SortableApi;
    /**
     * Bumped by the task's "add subtask" action to open the root field. A
     * counter rather than a boolean: pressing it again after cancelling has to
     * reopen it, and a boolean that is already `true` says nothing.
     */
    openAdd?: number;
    /** The list is in manual order, so the rows carry a handle to drag by. */
    reorderable?: boolean;
}

/** Every subtask in render order — the order a drag reads rows in. */
export function flattenSubtasks(subtasks: SubTask[], filePath: string): SortableRow[] {
    const rows: SortableRow[] = [];
    const walk = (list: SubTask[]) => {
        for (const sub of list) {
            rows.push({
                key: `${filePath}:${sub.lineNumber}`,
                filePath,
                lineNumber: sub.lineNumber,
            });
            walk(sub.subtasks);
        }
    };
    walk(subtasks);
    return rows;
}

/** A note's first line — what a subtask's row can hold of it. */
const firstLine = (text: string) => text.split('\n').find((l) => l.trim())?.trim() ?? '';

/**
 * SubtaskTree — a task's subtasks, as thin lines hanging off its checkbox.
 *
 * A tap opens a subtask's own editor (title, hour, timer, notes, attachments);
 * a right-click or a long press opens the rest — a subtask of its own, the
 * timer, the note it lives in, deleting it. Nothing is laid out as buttons: a
 * tree of five subtasks with four buttons each was the busiest part of the
 * whole view on a phone.
 *
 * Every level of one task's tree shares a single drag registry (owned by
 * `TaskItem`), so a subtask can be dragged out of its branch into another.
 */
export const SubtaskTree: FC<SubtaskTreeProps> = ({
    filePath,
    parentLine,
    subtasks,
    depth = 0,
    sortable,
    openAdd = 0,
    reorderable = false,
}) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    // The parent line we're currently adding a child under (a subtask's line, or
    // `parentLine` for the root add row). null = not adding.
    const [addUnder, setAddUnder] = useState<number | null>(null);
    const [addText, setAddText] = useState('');
    // The subtask whose editor is open.
    const [detailing, setDetailing] = useState<SubTask | null>(null);

    // Only the root level answers the task's action; a nested tree has its own
    // per-row add and would otherwise open a second field at the same time.
    useEffect(() => {
        if (openAdd > 0 && depth === 0) {
            setAddUnder(parentLine);
            setAddText('');
        }
    }, [openAdd, depth, parentLine]);

    const reload = () => plugin.dataService.reloadTasks();
    const writer = () => new TaskWriter(app);

    const setStatus = async (sub: SubTask, status: TaskStatus) => {
        try {
            if (await writer().setStatusInFile(filePath, sub.lineNumber, status, sub.title))
                await reload();
        } catch (err) {
            console.error('Zenith: failed to set subtask status:', err);
        }
    };

    const remove = async (sub: SubTask) => {
        // The same question a task is asked with: a subtask takes its own
        // subtasks with it too.
        const under = countSubtasks(sub.subtasks).total;
        if (under > 0) {
            const question = t.plural('tasks.delete.withSubtasks', under, { name: sub.title });
            if (!(await confirmDelete(app, question))) return;
        }
        try {
            if (await writer().deleteTaskInFile(filePath, sub.lineNumber, sub.title)) await reload();
        } catch (err) {
            console.error('Zenith: failed to delete subtask:', err);
            new Notice(t('tasks.error.delete'));
        }
    };

    const submitAdd = async () => {
        const under = addUnder;
        const text = addText.trim();
        setAddUnder(null);
        setAddText('');
        if (under == null || !text) return;
        try {
            if (await writer().addSubtaskInFile(filePath, under, text)) await reload();
        } catch (err) {
            console.error('Zenith: failed to add subtask:', err);
            new Notice(t('tasks.error.save'));
        }
    };

    const addInput = (
        <input
            className="zenith-input zenith-input--sm zenith-subtask__input"
            value={addText}
            autoFocus
            placeholder={t('tasks.subtask.placeholder')}
            onChange={(e) => setAddText(e.target.value)}
            onBlur={() => void submitAdd()}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitAdd();
                } else if (e.key === 'Escape') {
                    setAddUnder(null);
                    setAddText('');
                }
            }}
        />
    );

    return (
        <ul className="zenith-subtasks">
            {subtasks.map((sub) => (
                <li key={sub.lineNumber} className="zenith-subtask-group">
                    <SubtaskRow
                        sub={sub}
                        filePath={filePath}
                        sortable={sortable}
                        reorderable={reorderable}
                        onStatus={(s) => void setStatus(sub, s)}
                        onEdit={() => setDetailing(sub)}
                        onAddChild={() => {
                            setAddUnder(sub.lineNumber);
                            setAddText('');
                        }}
                        onOpen={() => void openFileAtLine(app, filePath, sub.lineNumber - 1)}
                        onDelete={() => void remove(sub)}
                    />

                    {addUnder === sub.lineNumber && (
                        <div className="zenith-subtask zenith-subtask--nested-add">{addInput}</div>
                    )}

                    {sub.subtasks.length > 0 && (
                        <SubtaskTree
                            filePath={filePath}
                            parentLine={sub.lineNumber}
                            subtasks={sub.subtasks}
                            depth={depth + 1}
                            sortable={sortable}
                            reorderable={reorderable}
                        />
                    )}
                </li>
            ))}

            {/* The field "add subtask" opens at the root, and nothing else:
                adding is one of the task's actions. */}
            {depth === 0 && addUnder === parentLine && (
                <li className="zenith-subtask zenith-subtask--add is-open">{addInput}</li>
            )}
            {detailing && (
                <SubtaskEditorModal
                    filePath={filePath}
                    subtask={detailing}
                    onClose={() => setDetailing(null)}
                    onSaved={reload}
                />
            )}
        </ul>
    );
};

interface SubtaskRowProps {
    sub: SubTask;
    filePath: string;
    sortable: SortableApi;
    reorderable: boolean;
    onStatus: (status: TaskStatus) => void;
    onEdit: () => void;
    onAddChild: () => void;
    onOpen: () => void;
    onDelete: () => void;
}

/** One subtask's line: its checkbox, its title and what it is quietly carrying. */
const SubtaskRow: FC<SubtaskRowProps> = ({
    sub,
    filePath,
    sortable,
    reorderable,
    onStatus,
    onEdit,
    onAddChild,
    onOpen,
    onDelete,
}) => {
    const { app } = useApp();
    const t = useTranslation();
    const timerOn = useFeature('tasks.timer');
    const dragOn = useFeature('tasks.dragDrop');
    const { dragKey, dropTarget, handleProps, registerRow } = sortable;

    const dim = sub.status === 'done' || sub.status === 'cancelled';
    const key = `${filePath}:${sub.lineNumber}`;
    const dropEdge = dropTarget?.kind === 'row' && dropTarget.key === key ? dropTarget.position : null;
    const note = sub.description ? firstLine(sub.description) : '';

    const menu = (at: { x: number; y: number } | MouseEvent) =>
        showLineMenu(
            app,
            t,
            { ...sub, filePath },
            {
                onAddSubtask: onAddChild,
                timer: timerOn && !dim,
                onEdit,
                onOpen,
                onDelete,
            },
            at
        );
    const press = useLongPress(
        (x, y) => menu({ x, y }),
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            menu(e.nativeEvent);
        }
    );

    return (
        <div
            ref={registerRow(key)}
            className={[
                'zenith-subtask',
                dim ? 'is-done' : '',
                dragKey === key ? 'is-dragging' : '',
                dropEdge ? `is-drop-${dropEdge}` : '',
            ]
                .filter(Boolean)
                .join(' ')}
            onContextMenu={press.onContextMenu}
        >
            <TaskStatusControl status={sub.status} onChange={onStatus} size={14} />
            <span
                className="zenith-subtask__title"
                role="button"
                tabIndex={0}
                onClick={() => {
                    if (!press.swallowClick()) onEdit();
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onEdit();
                }}
                onPointerDown={press.onPointerDown}
                onPointerMove={press.onPointerMove}
                onPointerUp={press.onPointerUp}
                onPointerCancel={press.onPointerCancel}
            >
                <span className="zenith-subtask__text">{sub.title}</span>
                {note && <span className="zenith-subtask__note">{note}</span>}
            </span>
            {/* The hour it is due, time spent, and a paperclip — quiet, and only when set. */}
            {sub.dueTime && <span className="zenith-subtask__time">{sub.dueTime}</span>}
            {timerOn && sub.spentMinutes !== undefined && (
                <span className="zenith-subtask__time is-spent">{formatDuration(sub.spentMinutes)}</span>
            )}
            {sub.attachments && sub.attachments.length > 0 && (
                <span className="zenith-subtask__time" title={t('tasks.editor.attachments')}>
                    <Paperclip size={11} />
                    {sub.attachments.length}
                </span>
            )}
            {timerOn && !dim && (
                <TaskTimerButton
                    filePath={filePath}
                    lineNumber={sub.lineNumber}
                    title={sub.title}
                    timerMinutes={sub.timerMinutes}
                    size={12}
                />
            )}
            {dragOn && reorderable && (
                <button
                    type="button"
                    className="zenith-subtask__action zenith-drag-handle"
                    aria-label={t('tasks.reorder', { name: sub.title })}
                    title={t('tasks.reorderHint')}
                    {...handleProps(key)}
                >
                    <GripVertical size={12} />
                </button>
            )}
        </div>
    );
};
