import { createElement } from 'react';
import { Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import type { Task } from '../../store/taskSlice';
import { featureEnabled } from '../../core/features';
import { getTodayString } from '../../core/dateUtils';
import { translateNow, translatorNow } from '../../core/i18n';
import { openDialog } from '../../core/openDialog';
import { openFileAtLine } from '../../core/openInVault';
import type { SearchCreateRow, SearchItem, SearchSource } from '../search/searchSources';
import { TaskWriter } from './services/taskWriter';
import { resolveTaskTarget } from './services/taskTarget';
import { quickParse } from './services/quickParse';
import { TaskEditorModal } from './components/TaskEditorModal';
import { chipLabel } from './components/QuickAddForm';
import { formatDueDate } from './components/TaskItem';
import type ZenithPlugin from '../../main';

/**
 * What Search finds of the tasks module: the tasks still to do, and the "+
 * Task" row that captures the typed line the way quick add does.
 *
 * Done and cancelled tasks are left out. Found among the open ones, "купить
 * хлеб" is one row; found among every week it was ever bought, it is twenty.
 */

async function complete(plugin: ZenithPlugin, task: Task): Promise<void> {
    const { setTaskStatus } = useZenithStore.getState();
    const prev = task.status;
    setTaskStatus(task.id, 'done'); // optimistic, so the row leaves at once
    try {
        const ok = await new TaskWriter(plugin.app).setStatusInFile(
            task.filePath,
            task.lineNumber,
            'done',
            task.title
        );
        if (!ok) {
            setTaskStatus(task.id, prev);
            new Notice(translateNow('notice.taskUpdateFailed'));
        } else if (task.recurrence) {
            // The next occurrence was written above: read it in.
            void plugin.dataService.reloadTasks();
        }
    } catch (err) {
        console.error('Zenith: failed to complete the task from Search:', err);
        setTaskStatus(task.id, prev);
        new Notice(translateNow('notice.taskUpdateFailed'));
    }
}

function edit(plugin: ZenithPlugin, task: Task): void {
    openDialog(plugin, (close) =>
        createElement(TaskEditorModal, {
            editTask: task,
            onClose: close,
            onSaved: () => plugin.dataService.reloadTasks(),
        })
    );
}

function itemOf(plugin: ZenithPlugin, task: Task): SearchItem {
    const t = translatorNow();
    return {
        // The line moves as the note is edited; the file and the title do not.
        id: `tasks:${task.filePath}#${task.title}`,
        title: task.title,
        tags: task.tags.map((tag) => tag.replace(/^#/, '')),
        detail: task.dueDate ? formatDueDate(task.dueDate, t) : undefined,
        icon: task.status === 'in-progress' ? 'circle-dot' : 'circle',
        run: () => edit(plugin, task),
        complete: () => complete(plugin, task),
        reveal: () => void openFileAtLine(plugin.app, task.filePath, task.lineNumber - 1),
    };
}

/** The "+ Task" row: the line read as quick add reads it. */
function createRow(plugin: ZenithPlugin, text: string): SearchCreateRow | null {
    const settings = useZenithStore.getState().settings;
    const today = getTodayString();
    const parsed = featureEnabled(settings, 'tasks.naturalInput') ? quickParse(text, today) : null;
    const title = (parsed?.title ?? text).trim();
    if (!title) return null;
    const t = translatorNow();
    return {
        title,
        label: t('search.create.task'),
        icon: 'plus',
        chips: parsed?.pieces.map((piece) => chipLabel(piece, parsed, parsed.dueDate ?? today, t)),
        run: async () => {
            try {
                const current = useZenithStore.getState().settings;
                const target = await resolveTaskTarget(plugin.app, current);
                await new TaskWriter(plugin.app).addTask(
                    current.tasksFolderPath,
                    {
                        title,
                        priority: parsed?.priority ?? 'medium',
                        tags: [],
                        dueDate: parsed?.dueDate,
                        dueTime: parsed?.dueTime,
                        dueEndTime: parsed?.dueEndTime,
                        recurrence: parsed?.recurrence,
                    },
                    target
                );
                new Notice(translateNow('notice.taskAdded'));
            } catch (err) {
                console.error('Zenith: failed to add a task from Search:', err);
                new Notice(translateNow('notice.taskAddFailed'));
            }
        },
    };
}

export function tasksSearchSource(plugin: ZenithPlugin): SearchSource {
    return {
        id: 'tasks',
        labelKey: 'module.tasks.name',
        icon: 'circle',
        order: 30,
        items: () =>
            useZenithStore
                .getState()
                .tasks.filter((task) => task.status === 'todo' || task.status === 'in-progress')
                .map((task) => itemOf(plugin, task)),
        creators: () => [{ row: (text) => createRow(plugin, text) }],
    };
}
