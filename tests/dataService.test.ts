import { describe, it, expect, beforeEach } from 'vitest';
import { DataService, taskSourceFolders } from '../src/core/DataService';
import { resetZenithStore, useZenithStore } from '../src/store';
import type ZenithPlugin from '../src/main';
import type { Task } from '../src/store/taskSlice';

const base = {
    tasksFolderPath: '10 Tasks',
    journalFolderPath: '15 Journal',
    projectsFolderPath: '20 Projects',
    activeModuleIds: ['tasks', 'journal', 'projects'],
};

describe('where tasks are read from', () => {
    it('is the tasks folder, plus the journal and projects folders while those run', () => {
        expect(taskSourceFolders(base)).toEqual(['10 Tasks', '15 Journal', '20 Projects']);
        expect(taskSourceFolders({ ...base, activeModuleIds: ['tasks'] })).toEqual(['10 Tasks']);
    });

    it('takes an empty path as no folder, not as the whole vault', () => {
        // The full parse skipped it while the watcher took it for everything,
        // so tasks came and went with whichever notes were edited.
        expect(taskSourceFolders({ ...base, tasksFolderPath: '  ', activeModuleIds: ['tasks'] })).toEqual([]);
    });
});

/** A parse that finishes only when the test says so. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const task = (title: string) => ({ id: title, title }) as unknown as Task;

describe('two full reloads at once', () => {
    beforeEach(() => resetZenithStore());

    it('ends on the one asked for last, not the one that finished last', async () => {
        const service = new DataService({ app: {} } as unknown as ZenithPlugin);
        const slow = deferred<Task[]>();
        const fast = deferred<Task[]>();
        const runs = [slow, fast];
        (service as unknown as { taskParser: unknown }).taskParser = {
            parseFolders: () => (runs.shift() as typeof slow).promise,
        };

        const first = service.reloadTasks();
        const second = service.reloadTasks();
        fast.resolve([task('current')]);
        await second;
        expect(useZenithStore.getState().tasksLoading).toBe(false);

        slow.resolve([task('stale')]);
        await first;
        expect(useZenithStore.getState().tasks.map((t) => t.title)).toEqual(['current']);
    });
});
