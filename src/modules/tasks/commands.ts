import { useZenithStore } from '../../store';
import { QuickAddTaskModal } from './QuickAddTaskModal';
import type ZenithPlugin from '../../main';

/**
 * Register the global "Quick add task" command in the command palette.
 *
 * Available regardless of which view is active, so a task can be captured from
 * anywhere. The modal writes to today's daily note or the configured tasks
 * folder (see `resolveTaskTarget`); the DataService reacts to the file change
 * and refreshes the store.
 */
export function registerQuickAddTaskCommand(plugin: ZenithPlugin): void {
    plugin.addCommand({
        id: 'quick-add-task',
        name: 'Quick add task',
        callback: () => {
            new QuickAddTaskModal(plugin.app, useZenithStore.getState().settings).open();
        },
    });
}
