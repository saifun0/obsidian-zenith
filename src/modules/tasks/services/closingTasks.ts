import { create } from 'zustand';
import type { Task } from '../../../store/taskSlice';
import type { TaskStatus } from '../../../core/constants';
import type { BucketId } from './taskBuckets';

/**
 * Tasks in the moment of being closed.
 *
 * A finished task used to jump into "Done" the instant its box was ticked —
 * out from under the pointer, with no way to see what had been ticked, let
 * alone take it back. Now it stays where it was for a moment, struck through,
 * with "undo" in the margin; then it folds away into its group.
 *
 * Kept by what the task *was*, not by its id: an id is a file and a line, and
 * completing a recurring task inserts its next occurrence above it, so the
 * finished one is a line further down by the time the file is read again —
 * and the id it had now belongs to the next occurrence.
 */
export interface Closing {
    /** What the moment is kept under: the id the task had when it was closed. */
    key: string;
    /** The task as it was when it was closed, already showing its new status. */
    snapshot: Task;
    /** The group it was in, which it stays in until it leaves. */
    bucket: BucketId;
    /** What it was before, for an undo that has to set it back by hand. */
    prev: TaskStatus;
    /** `held`: struck through, undoable. `leaving`: folding away. */
    phase: 'held' | 'leaving';
    /** Puts the note back as it was; resolves false if it has changed since. */
    undo?: () => Promise<boolean>;
}

/** How long a closed task waits where it was, in ms. */
export const HOLD_MS = 2200;
/** How long it takes to fold away. Matches tasks.css. */
export const LEAVE_MS = 260;

interface ClosingState {
    items: Record<string, Closing>;
}

export const useClosingTasks = create<ClosingState>()(() => ({ items: {} }));

const timers = new Map<string, number[]>();

function clearTimers(id: string): void {
    for (const handle of timers.get(id) ?? []) window.clearTimeout(handle);
    timers.delete(id);
}

function setItem(id: string, item: Closing | null): void {
    useClosingTasks.setState((s) => {
        const items = { ...s.items };
        if (item) items[id] = item;
        else delete items[id];
        return { items };
    });
}

/** Start the moment for a task that has just been closed. */
export function holdClosing(id: string, closing: Omit<Closing, 'phase' | 'key'>): void {
    clearTimers(id);
    setItem(id, { ...closing, key: id, phase: 'held' });
    timers.set(id, [
        window.setTimeout(() => {
            const current = useClosingTasks.getState().items[id];
            if (current) setItem(id, { ...current, phase: 'leaving' });
        }, HOLD_MS),
        window.setTimeout(() => {
            timers.delete(id);
            setItem(id, null);
        }, HOLD_MS + LEAVE_MS),
    ]);
}

/** Hand the undo over once the write has finished and there is one. */
export function attachUndo(id: string, undo: () => Promise<boolean>): void {
    const current = useClosingTasks.getState().items[id];
    if (current) setItem(id, { ...current, undo });
}

/** End the moment now — the task was taken back, or the write failed. */
export function dropClosing(id: string): Closing | undefined {
    const current = useClosingTasks.getState().items[id];
    clearTimers(id);
    setItem(id, null);
    return current;
}

/** Whether `task`, as the store has it now, is the one this moment is about. */
export function isClosingOf(closing: Closing, task: Task): boolean {
    const was = closing.snapshot;
    if (task.filePath !== was.filePath || task.title !== was.title) return false;
    if (task.status !== was.status) return false;
    // The same line, or one further down when a next occurrence went in above.
    return task.lineNumber === was.lineNumber || task.lineNumber === was.lineNumber + 1;
}

/** Statuses that close a task, and so start the moment. */
export const closesTask = (from: TaskStatus, to: TaskStatus): boolean =>
    (to === 'done' || to === 'cancelled') && from !== 'done' && from !== 'cancelled';
