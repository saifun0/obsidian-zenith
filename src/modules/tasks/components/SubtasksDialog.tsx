import React, { useEffect, useRef, useState, type FC } from 'react';
import { Notice } from 'obsidian';
import { ArrowUpRight, Pencil } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { SubTask } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { Modal } from '../../../components/shared/Modal';
import { TaskWriter } from '../services/taskWriter';
import { countSubtasks } from '../services/taskStats';
import { marginText } from '../services/taskMargin';
import { diffTaskFields } from '../services/taskFormat';
import { askForTask } from '../services/taskViewState';
import { TaskStatusControl } from './taskStatusUi';

interface SubtasksDialogProps {
    /** The task whose subtasks these are — read from the store, so the list is live. */
    taskId: string;
    onClose: () => void;
}

const closed = (status: TaskStatus) => status === 'done' || status === 'cancelled';

/**
 * A task's subtasks, as a page of their own.
 *
 * On the dashboard's card they used to unfold in place: the card has a budget
 * of rows, so it showed the first few that were still open, pushed the tasks
 * below them off the card, and said "+2 more" about the rest. Here all of
 * them are, in the order the note has them, with the ones already done struck
 * through — and a line to write the next one on.
 *
 * It ticks, it adds and it renames: the pencil at the end of a row turns the
 * name into a field. A subtask's hour, timer and notes are edited where the
 * rest of the task is, in the Tasks view — one mark away, beside the close
 * button, which opens that view on this task.
 */
export const SubtasksDialog: FC<SubtasksDialogProps> = ({ taskId, onClose }) => {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const task = useZenithStore((s) => s.tasks.find((x) => x.id === taskId));
    const [text, setText] = useState('');
    const [adding, setAdding] = useState(false);
    const addRef = useRef<HTMLInputElement>(null);
    /** The subtask being renamed, by its line, and what its name is being changed to. */
    const [renaming, setRenaming] = useState<{ line: number; text: string } | null>(null);
    /**
     * The same text, where the moment of saving reads it — and empties it.
     * Enter saves and takes the field away, and a field taken away may still
     * say it lost the focus: read from here, the second saving finds nothing.
     */
    const draft = useRef<string | null>(null);
    const retitle = (line: number, text: string | null) => {
        draft.current = text;
        setRenaming(text === null ? null : { line, text });
    };

    // The task was finished or deleted from somewhere else: nothing to show.
    useEffect(() => {
        if (!task) onClose();
    }, [task, onClose]);
    if (!task) return null;

    const { done, total } = countSubtasks(task.subtasks);
    const when = marginText(task, getTodayString(), t, false);
    const writer = () => new TaskWriter(app);
    const reload = () => plugin.dataService.reloadTasks();

    const setStatus = async (sub: SubTask, status: TaskStatus) => {
        try {
            if (await writer().setStatusInFile(task.filePath, sub.lineNumber, status, sub.title)) {
                await reload();
            } else {
                new Notice(t('tasks.error.update'));
            }
        } catch (err) {
            console.error('Zenith: failed to set subtask status:', err);
        }
    };

    const add = async () => {
        const title = text.trim();
        if (!title || adding) return;
        setAdding(true);
        try {
            if (await writer().addSubtaskInFile(task.filePath, task.lineNumber, title)) {
                setText('');
                await reload();
            } else {
                new Notice(t('tasks.error.save'));
            }
        } catch (err) {
            console.error('Zenith: failed to add subtask:', err);
            new Notice(t('tasks.error.save'));
        } finally {
            setAdding(false);
            // Still on the line: the usual reason to add one is to add three.
            addRef.current?.focus();
        }
    };

    const rename = async (sub: SubTask) => {
        const typed = draft.current;
        retitle(sub.lineNumber, null);
        if (typed === null) return;
        const next = typed.trim();
        // An emptied name is not a name: the subtask keeps the one it had.
        if (!next || next === sub.title) return;
        try {
            const patch = diffTaskFields(sub, { title: next });
            if (await writer().updateLineExtras(task.filePath, sub.lineNumber, patch)) {
                await reload();
            } else {
                new Notice(t('tasks.error.update'));
            }
        } catch (err) {
            console.error('Zenith: failed to rename subtask:', err);
            new Notice(t('tasks.error.save'));
        }
    };

    const openInList = () => {
        askForTask(task);
        onClose();
        void plugin.moduleManager.get('tasks')?.activateView();
    };

    const rows = (list: SubTask[], depth: number): React.ReactNode =>
        list.map((sub) => (
            <React.Fragment key={sub.lineNumber}>
                <li
                    className={`zenith-subdlg__row ${closed(sub.status) ? 'is-closed' : ''}`}
                    style={{ ['--subdlg-depth' as string]: depth }}
                >
                    <TaskStatusControl
                        status={sub.status}
                        size={16}
                        onChange={(status) => void setStatus(sub, status)}
                    />
                    {renaming?.line === sub.lineNumber ? (
                        <input
                            className="zenith-subdlg__input zenith-subdlg__rename"
                            value={renaming.text}
                            aria-label={t('tasks.subtasks.rename', { name: sub.title })}
                            enterKeyHint="done"
                            autoFocus
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => retitle(sub.lineNumber, e.target.value)}
                            onBlur={() => void rename(sub)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void rename(sub);
                                } else if (e.key === 'Escape') {
                                    // The field's own Escape: the dialog stays.
                                    e.stopPropagation();
                                    retitle(sub.lineNumber, null);
                                }
                            }}
                        />
                    ) : (
                        <>
                            <span className="zenith-subdlg__name">{sub.title}</span>
                            {sub.dueTime && (
                                <span className="zenith-subdlg__time">{sub.dueTime}</span>
                            )}
                            <button
                                type="button"
                                className="zenith-subdlg__edit"
                                aria-label={t('tasks.subtasks.rename', { name: sub.title })}
                                title={t('tasks.subtasks.rename', { name: sub.title })}
                                onClick={() => retitle(sub.lineNumber, sub.title)}
                            >
                                <Pencil size={13} />
                            </button>
                        </>
                    )}
                </li>
                {sub.subtasks.length > 0 && rows(sub.subtasks, depth + 1)}
            </React.Fragment>
        ));

    const header = (
        <div className="zenith-subdlg__head">
            <h2 className="zenith-subdlg__title">{task.title}</h2>
            <p className="zenith-subdlg__tally">
                {when.text && (
                    <>
                        <span className={`zenith-subdlg__when is-${when.tone}`}>{when.text}</span>
                        <span aria-hidden="true">·</span>
                    </>
                )}
                <span>{t('tasks.subtasks.progress', { done, total })}</span>
            </p>
        </div>
    );
    // Beside the close button, which the shell draws after the header.
    const head = (
        <>
            {header}
            <button
                type="button"
                className="zenith-dialog__close zenith-subdlg__open"
                aria-label={t('tasks.subtasks.openInList')}
                title={t('tasks.subtasks.openInList')}
                onClick={openInList}
            >
                <ArrowUpRight size={18} />
            </button>
        </>
    );

    return (
        <Modal title={task.title} header={head} onClose={onClose} size="sm" className="zenith-subdlg">
            {total > 0 && (
                <div
                    className="zenith-subdlg__progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={done}
                >
                    <span style={{ width: `${(done / total) * 100}%` }} />
                </div>
            )}
            {/* Takes the focus when the dialog opens, so that the field below
                does not: on a phone that would raise the keyboard over a list
                someone came to tick. */}
            <ul className="zenith-subdlg__list" tabIndex={-1} data-autofocus>
                {rows(task.subtasks, 0)}
            </ul>
            <div className="zenith-subdlg__add">
                <span className="zenith-subdlg__ring" aria-hidden="true" />
                <input
                    ref={addRef}
                    className="zenith-subdlg__input"
                    value={text}
                    placeholder={t('tasks.subtasks.write')}
                    aria-label={t('tasks.subtasks.write')}
                    enterKeyHint="done"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void add();
                        } else if (e.key === 'Escape' && text) {
                            // The first Escape empties the line; the next closes the dialog.
                            e.stopPropagation();
                            setText('');
                        }
                    }}
                />
            </div>
        </Modal>
    );
};
