import { useCallback } from 'react';
import { Notice } from 'obsidian';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { getTodayString } from '../../../core/dateUtils';
import { useTranslation } from '../../../core/i18n';
import { TaskWriter } from '../services/taskWriter';
import { addDays, bucketOf } from '../services/taskBuckets';
import { attachUndo, closesTask, dropClosing, holdClosing } from '../services/closingTasks';
import type { ScheduleTarget } from './taskMenu';

/**
 * What can be done to one task from wherever it is drawn — the list's row,
 * the dashboard card — written once.
 *
 * Closing a task starts its moment (`closingTasks`): it stays where it was,
 * struck through, with "undo" beside it, while the note is written.
 */
export function useTaskActions(task: Task) {
    const { app, plugin } = useApp();
    const t = useTranslation();
    const setTaskStatus = useZenithStore((s) => s.setTaskStatus);
    const removeTask = useZenithStore((s) => s.removeTask);

    const reload = useCallback(() => plugin.dataService.reloadTasks(), [plugin]);

    const changeStatus = async (status: TaskStatus) => {
        const prev = task.status;
        if (prev === status) return;
        const today = getTodayString();
        const closing = closesTask(prev, status);
        if (closing) {
            holdClosing(task.id, {
                snapshot: {
                    ...task,
                    status,
                    completed: status === 'done',
                    doneDate: status === 'done' ? today : task.doneDate,
                    cancelledDate: status === 'cancelled' ? today : task.cancelledDate,
                },
                bucket: bucketOf(task, today),
                prev,
            });
        }
        setTaskStatus(task.id, status); // optimistic
        if (!task.filePath) return;
        try {
            const { ok, undo } = await new TaskWriter(app).setStatusUndoable(
                task.filePath,
                task.lineNumber,
                status,
                task.title
            );
            if (!ok) {
                dropClosing(task.id);
                setTaskStatus(task.id, prev);
                new Notice(t('tasks.error.update'));
                return;
            }
            if (closing && undo) attachUndo(task.id, undo);
            // A recurring task inserted its next occurrence — read it in.
            if (status === 'done' && task.recurrence) void reload();
        } catch (err) {
            console.error('Zenith: failed to set status:', err);
            dropClosing(task.id);
            setTaskStatus(task.id, prev);
            new Notice(t('tasks.error.save'));
        }
    };

    /** Move the deadline; a finished task dropped somewhere active is opened again. */
    const schedule = async (to: ScheduleTarget) => {
        const today = getTodayString();
        const dueDate = to === 'today' ? today : to === 'tomorrow' ? addDays(today, 1) : null;
        try {
            const ok = await new TaskWriter(app).updateTaskInFile(
                task.filePath,
                task.lineNumber,
                { dueDate },
                task.title
            );
            if (!ok) new Notice(t('tasks.error.update'));
        } catch (err) {
            console.error('Zenith: failed to move task:', err);
            new Notice(t('tasks.error.save'));
        }
        await reload();
    };

    const remove = async () => {
        if (!task.filePath) return;
        removeTask(task.id); // optimistic
        try {
            const ok = await new TaskWriter(app).deleteTaskInFile(
                task.filePath,
                task.lineNumber,
                task.title
            );
            if (!ok) new Notice(t('tasks.error.delete'));
        } catch (err) {
            console.error('Zenith: failed to delete task:', err);
            new Notice(t('tasks.error.delete'));
        }
        await reload();
    };

    return { changeStatus, schedule, remove, reload };
}

/**
 * Take back a task that was just closed: the note put back as it was. The row
 * offers this only once the write has finished and left its snapshot, and it
 * fails — saying so — when anything has written to the note since.
 */
export async function undoClosing(
    key: string,
    reload: () => Promise<void> | void,
    failed: () => void
): Promise<void> {
    const closing = dropClosing(key);
    if (!closing?.undo) return;
    useZenithStore.getState().setTaskStatus(key, closing.prev); // optimistic
    let restored = false;
    try {
        restored = await closing.undo();
    } catch (err) {
        console.error('Zenith: failed to undo:', err);
    }
    if (!restored) failed();
    await reload();
}
