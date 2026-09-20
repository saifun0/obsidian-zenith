import { DEFAULT_TASKS_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';

export const tasksSettingsSchema = coreSchema({
    moduleId: 'tasks',
    groups: [
        {
            id: 'storage',
            fields: [
                /**
                 * Where a new task is written. Capturing into the day's note is
                 * the default and the common case — a task is usually thought
                 * of while writing that day — and the folder only matters to
                 * someone who keeps a separate inbox, so it stays hidden until
                 * they say so.
                 *
                 * Note this governs *writing* only. Both places are always
                 * read, so turning capture on doesn't hide the tasks already
                 * sitting in the folder.
                 */
                {
                    type: 'toggle',
                    key: 'journalCaptureTasks',
                    labelKey: 'settings.taskCapture',
                    descKey: 'settings.taskCapture.desc',
                    default: true,
                },
                {
                    type: 'text',
                    key: 'journalTaskHeading',
                    labelKey: 'settings.journalTaskHeading',
                    descKey: 'settings.journalTaskHeading.desc',
                    default: '',
                    placeholder: 'Задачи',
                    showIf: (v) => v.journalCaptureTasks === true,
                },
                {
                    type: 'folder',
                    key: 'tasksFolderPath',
                    labelKey: 'settings.tasksFolder',
                    default: DEFAULT_TASKS_FOLDER,
                    placeholder: DEFAULT_TASKS_FOLDER,
                    showIf: (v) => !v.journalCaptureTasks,
                },
            ],
        },
        {
            // How attached pictures sit in a task row. A setting rather than a
            // per-image choice: the alternative is inventing a syntax for it in
            // the note, and a task list looks better when its pictures agree.
            id: 'images',
            titleKey: 'settings.taskImages',
            fields: [
                {
                    type: 'select',
                    key: 'taskImageAlign',
                    labelKey: 'settings.taskImageAlign',
                    default: 'left',
                    options: [
                        { value: 'left', labelKey: 'settings.align.left' },
                        { value: 'center', labelKey: 'settings.align.center' },
                        { value: 'right', labelKey: 'settings.align.right' },
                    ],
                },
                {
                    type: 'number',
                    key: 'taskImageSize',
                    labelKey: 'settings.taskImageSize',
                    default: 56,
                    min: 32,
                    max: 240,
                    step: 8,
                },
            ],
        },
    ],
});
