import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TFile } from 'obsidian';
import { DataService, taskSourceFolders } from '../src/core/DataService';
import { dashboardWidgets, type DashboardWidgetDefinition } from '../src/modules/dashboard/widgets';
import { navActions, type NavActionDefinition } from '../src/modules/navigator/navigation';
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

describe('inactive modules and blank folder paths in DataService', () => {
    beforeEach(() => resetZenithStore());

    it('skips parsing content and journal when their modules are off or folders are blank', async () => {
        const service = new DataService({ app: {} } as unknown as ZenithPlugin);
        const parseContent = vi.fn().mockResolvedValue([]);
        const parseJournal = vi.fn().mockResolvedValue([]);
        (service as unknown as { contentParser: unknown }).contentParser = { parseContent };
        (service as unknown as { journalParser: unknown }).journalParser = { parseJournal };

        useZenithStore.getState().updateSettings({
            activeModuleIds: ['tasks'],
            contentFolderPath: '30 Content',
            journalFolderPath: '15 Journal',
        });

        await service.reloadContent();
        await service.reloadJournal();
        expect(parseContent).not.toHaveBeenCalled();
        expect(parseJournal).not.toHaveBeenCalled();
    });

    it('never treats an empty content or journal folder as the whole vault on file edits', () => {
        const service = new DataService({ app: {} } as unknown as ZenithPlugin);
        useZenithStore.getState().updateSettings({
            activeModuleIds: ['tasks', 'content', 'journal'],
            tasksFolderPath: '',
            contentFolderPath: '   ',
            journalFolderPath: '',
            projectsFolderPath: '',
        });

        const file = new TFile();
        file.path = 'Anywhere/RandomNote.md';
        file.extension = 'md';
        (service as unknown as { onChange: (f: TFile) => void }).onChange(file);

        expect((service as unknown as { dirtyContent: Set<string> }).dirtyContent.size).toBe(0);
        expect((service as unknown as { dirtyJournal: Set<string> }).dirtyJournal.size).toBe(0);
    });
});

describe('registry disposers do not clobber a newer registration under the same id', () => {
    it('keeps the replacement widget and nav action when an older disposer runs late', () => {
        const firstWidget = { id: 'test.race', component: (() => null) as never } as DashboardWidgetDefinition;
        const secondWidget = { id: 'test.race', component: (() => null) as never } as DashboardWidgetDefinition;
        const disposeFirstW = dashboardWidgets.register(firstWidget);
        const disposeSecondW = dashboardWidgets.register(secondWidget);
        disposeFirstW();
        expect(dashboardWidgets.getSnapshot().find((w) => w.id === 'test.race')).toBe(secondWidget);
        disposeSecondW();

        const firstNav: NavActionDefinition = { id: 'test.nav', onClick: () => undefined };
        const secondNav: NavActionDefinition = { id: 'test.nav', onClick: () => undefined };
        const disposeFirstN = navActions.register(firstNav);
        const disposeSecondN = navActions.register(secondNav);
        disposeFirstN();
        expect(navActions.getSnapshot().find((a) => a.id === 'test.nav')).toBe(secondNav);
        disposeSecondN();
    });
});
