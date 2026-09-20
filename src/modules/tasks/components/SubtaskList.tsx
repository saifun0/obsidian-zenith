import React, { useEffect, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { Pencil, Trash2, Plus, GripVertical } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import type { SubTask } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { TaskWriter } from '../services/taskWriter';
import { formatDuration } from '../services/taskFormat';
import { TaskStatusControl } from './taskStatusUi';
import { TaskTimerButton } from './TaskTimerButton';
import { TaskAttachments } from './TaskAttachments';
import { SubtaskEditorModal } from './SubtaskEditorModal';
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
     * counter rather than a boolean: pressing the button again after cancelling
     * has to reopen it, and a boolean that is already `true` says nothing.
     */
    openAdd?: number;
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

/**
 * SubtaskTree — a recursive, fully manageable subtask list. At every level you
 * can change status (same 4-state menu), edit text inline, delete, add a child
 * (so subtasks can have their own subtasks), and drag to reorder. Every mutation
 * writes to the source file and reloads via the DataService.
 *
 * Every level of one task's tree shares a single drag registry (owned by
 * `TaskItem`), so a subtask can be dragged out of its branch and dropped into
 * another one — it lands as a sibling of whatever row it's released on and
 * takes that row's indentation. Unlike the task list this needs no "manual
 * sort" mode: subtasks always render in file order, so a drag is always visible.
 */
export const SubtaskTree: FC<SubtaskTreeProps> = ({
    filePath,
    parentLine,
    subtasks,
    depth = 0,
    sortable,
    openAdd = 0,
}) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const [editingLine, setEditingLine] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    // The parent line we're currently adding a child under (a subtask's line, or
    // `parentLine` for the root add row). null = not adding.
    const [addUnder, setAddUnder] = useState<number | null>(null);
    const [addText, setAddText] = useState('');
    // The subtask whose full editor is open — notes, attachments, hour, timer.
    const [detailing, setDetailing] = useState<SubTask | null>(null);

    // Only the root level answers the task's button; a nested tree has its own
    // per-row add and would otherwise open a second field at the same time.
    useEffect(() => {
        if (openAdd > 0 && depth === 0) {
            setAddUnder(parentLine);
            setAddText('');
        }
    }, [openAdd, depth, parentLine]);

    const reload = () => plugin.dataService.reloadTasks();
    const writer = () => new TaskWriter(app);

    const { dragKey, dropTarget, handleProps, registerRow } = sortable;

    const setStatus = async (sub: SubTask, status: TaskStatus) => {
        try {
            if (await writer().setStatusInFile(filePath, sub.lineNumber, status, sub.title))
                await reload();
        } catch (err) {
            console.error('Zenith: failed to set subtask status:', err);
        }
    };

    const beginEdit = (sub: SubTask) => {
        setEditingLine(sub.lineNumber);
        setEditText(sub.title);
    };

    const saveEdit = async (sub: SubTask) => {
        const text = editText.trim();
        setEditingLine(null);
        if (!text || text === sub.title) return;
        try {
            if (await writer().setLineTitleInFile(filePath, sub.lineNumber, text)) await reload();
        } catch (err) {
            console.error('Zenith: failed to edit subtask:', err);
            new Notice(t('tasks.error.save'));
        }
    };

    const remove = async (sub: SubTask) => {
        try {
            if (await writer().deleteTaskInFile(filePath, sub.lineNumber, sub.title))
                await reload();
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

    const addInput = (autoFocus: boolean) => (
        <input
            className="zenith-subtask__input"
            value={addText}
            autoFocus={autoFocus}
            placeholder={t('tasks.subtask.placeholder')}
            onChange={(e) => setAddText(e.target.value)}
            onBlur={submitAdd}
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
            {subtasks.map((sub) => {
                const dim = sub.status === 'done' || sub.status === 'cancelled';
                const isEditing = editingLine === sub.lineNumber;
                const key = `${filePath}:${sub.lineNumber}`;
                const dropEdge =
                    dropTarget?.kind === 'row' && dropTarget.key === key
                        ? dropTarget.position
                        : null;
                return (
                    <li key={sub.lineNumber} className="zenith-subtask-group">
                        <div
                            ref={registerRow(key)}
                            /* Focusable by tap, not by Tab. Touch has no hover,
                               so a tapped row is how it says "this one" — and
                               `:focus-within` is what reveals its controls. A
                               positive tabindex would put every subtask in the
                               keyboard order for the sake of that. */
                            tabIndex={-1}
                            className={[
                                'zenith-subtask',
                                dim ? 'is-done' : '',
                                dragKey === key ? 'is-dragging' : '',
                                dropEdge ? `is-drop-${dropEdge}` : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <TaskStatusControl
                                status={sub.status}
                                onChange={(s) => setStatus(sub, s)}
                                size={14}
                            />
                            {isEditing ? (
                                <input
                                    className="zenith-subtask__input"
                                    value={editText}
                                    autoFocus
                                    onChange={(e) => setEditText(e.target.value)}
                                    onBlur={() => saveEdit(sub)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void saveEdit(sub);
                                        } else if (e.key === 'Escape') {
                                            setEditingLine(null);
                                        }
                                    }}
                                />
                            ) : (
                                <span
                                    className="zenith-subtask__title"
                                    onDoubleClick={() => beginEdit(sub)}
                                    title={t('tasks.subtask.editHint')}
                                >
                                    {sub.title}
                                </span>
                            )}
                            {/* The hour it is due, and how long has gone into
                                it — quiet, and only when set. */}
                            {!isEditing && sub.dueTime && (
                                <span className="zenith-subtask__time">{sub.dueTime}</span>
                            )}
                            {!isEditing && sub.spentMinutes !== undefined && (
                                <span className="zenith-subtask__time is-spent">
                                    {formatDuration(sub.spentMinutes)}
                                </span>
                            )}

                            {/* Outside the hover cluster: a subtask being timed
                                has to keep showing its clock, and the cluster
                                collapses to nothing when the pointer leaves. */}
                            {!isEditing && sub.status !== 'done' && sub.status !== 'cancelled' && (
                                <TaskTimerButton
                                    filePath={filePath}
                                    lineNumber={sub.lineNumber}
                                    title={sub.title}
                                    timerMinutes={sub.timerMinutes}
                                    size={12}
                                />
                            )}
                            {!isEditing && (
                                <div className="zenith-subtask__actions">
                                    {/* Right-hand cluster, not the left gutter —
                                        the tree connectors own that column. */}
                                    <button
                                        type="button"
                                        className="zenith-subtask__action zenith-drag-handle"
                                        aria-label={t('tasks.reorder', { name: sub.title })}
                                        title={t('tasks.reorderHint')}
                                        {...handleProps(key)}
                                    >
                                        <GripVertical size={12} />
                                    </button>
                                    <button
                                        className="zenith-subtask__action"
                                        onClick={() => setDetailing(sub)}
                                        aria-label={t('common.edit')}
                                        title={t('common.edit')}
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    <button
                                        className="zenith-subtask__action"
                                        onClick={() => {
                                            setAddUnder(sub.lineNumber);
                                            setAddText('');
                                        }}
                                        aria-label={t('tasks.subtask.add')}
                                        title={t('tasks.subtask.add')}
                                    >
                                        <Plus size={12} />
                                    </button>
                                    <button
                                        className="zenith-subtask__action zenith-subtask__action--danger"
                                        onClick={() => remove(sub)}
                                        aria-label={t('common.delete')}
                                        title={t('common.delete')}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {(sub.description || (sub.attachments && sub.attachments.length > 0)) && (
                            <div className="zenith-subtask__detail">
                                {sub.description && (
                                    <p className="zenith-task-notes">{sub.description}</p>
                                )}
                                {sub.attachments && sub.attachments.length > 0 && (
                                    <TaskAttachments attachments={sub.attachments} />
                                )}
                            </div>
                        )}

                        {addUnder === sub.lineNumber && (
                            <div className="zenith-subtask zenith-subtask--nested-add">
                                {addInput(true)}
                            </div>
                        )}

                        {sub.subtasks.length > 0 && (
                            <SubtaskTree
                                filePath={filePath}
                                parentLine={sub.lineNumber}
                                subtasks={sub.subtasks}
                                depth={depth + 1}
                                sortable={sortable}
                            />
                        )}
                    </li>
                );
            })}

            {/* Root-level add row. There is no button here any more — adding a
                subtask is one of the task's actions, and lives in that cluster
                with the others; this is only the field it opens. */}
            {depth === 0 && addUnder === parentLine && (
                <li className="zenith-subtask zenith-subtask--add is-open">{addInput(true)}</li>
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
