import { useZenithStore } from '../../../store';
import type { TaskViewState } from '../../../store/settingsSlice';

/**
 * What the tasks list remembers of how it was left, on this device: which
 * tasks have their subtasks open, and which groups are folded away.
 */

/** Groups that start folded: what is finished is there to be counted, not read. */
export const DEFAULT_CLOSED_GROUPS: readonly string[] = ['done', 'cancelled'];

/** Open tasks remembered at most — the oldest are forgotten first. */
const OPEN_CAP = 300;

/**
 * How a task is known across edits: its note and its title. The line number
 * moves whenever a line above it is added, and the store's id with it.
 */
export function detailKey(task: { filePath: string; title: string }): string {
    return `${task.filePath}::${task.title}`;
}

function patch(fields: Partial<TaskViewState>): void {
    const s = useZenithStore.getState();
    s.updateSettings({ taskView: { ...s.settings.taskView, ...fields } });
}

export function setDetailsOpen(key: string, open: boolean): void {
    const list = useZenithStore.getState().settings.taskView.open ?? [];
    const rest = list.filter((k) => k !== key);
    patch({ open: open ? [key, ...rest].slice(0, OPEN_CAP) : rest });
}

export function closedGroups(view: TaskViewState): readonly string[] {
    return view.closed ?? DEFAULT_CLOSED_GROUPS;
}

export function toggleGroup(id: string): void {
    const closed = closedGroups(useZenithStore.getState().settings.taskView);
    patch({ closed: closed.includes(id) ? closed.filter((g) => g !== id) : [...closed, id] });
}
