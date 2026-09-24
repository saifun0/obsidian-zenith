import { useZenithStore } from '../../store';
import type { Task } from '../../store/taskSlice';
import type { JournalEntry } from '../../store/journalSlice';
import { emitZenithEvent } from '../moduleApiV2';
import { eventBus, journalEvents, taskEvents } from './events';
import { setDisableHandler } from './health';
import type ZenithPlugin from '../../main';

/**
 * The plugin's side of the extension points: turning store changes into
 * events for modules, and switching off a module that keeps failing.
 *
 * Events start after the first read of the vault: that first list is where
 * the tasks already were, not tasks being created — so it is kept as the
 * starting point and nothing is announced for it.
 */
export function startExtensionHost(plugin: ZenithPlugin): () => void {
    setDisableHandler((moduleId, lastError) => {
        void plugin.moduleManager.disableForFailures(moduleId, lastError);
    });

    let tasks: readonly Task[] | null = null;
    const offTasks = useZenithStore.subscribe(
        (state) => state.tasks,
        (next) => {
            const before = tasks;
            tasks = next;
            if (!before) return;
            if (!eventBus.listening('task:created') && !eventBus.listening('task:completed'))
                return;
            for (const event of taskEvents(before, next)) emitZenithEvent(event);
        }
    );

    let entries: readonly JournalEntry[] | null = null;
    const offJournal = useZenithStore.subscribe(
        (state) => state.journalEntries,
        (next) => {
            const before = entries;
            entries = next;
            if (!before || !eventBus.listening('journal:recorded')) return;
            for (const event of journalEvents(before, next)) emitZenithEvent(event);
        }
    );

    return () => {
        offTasks();
        offJournal();
        setDisableHandler(null);
    };
}
