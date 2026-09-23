import { DEFAULT_TASKS_FOLDER } from '../../core/constants';
import { coreSchema } from '../../settings/schema/types';
import { whenFeature } from '../../settings/schema/featureGroup';

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
                { type: 'feature', key: 'tasks.captureDaily' },
                {
                    type: 'text',
                    key: 'journalTaskHeading',
                    labelKey: 'settings.journalTaskHeading',
                    descKey: 'settings.journalTaskHeading.desc',
                    default: '',
                    placeholder: 'Задачи',
                    showIf: whenFeature('tasks.captureDaily'),
                },
                {
                    type: 'folder',
                    key: 'tasksFolderPath',
                    labelKey: 'settings.tasksFolder',
                    default: DEFAULT_TASKS_FOLDER,
                    placeholder: DEFAULT_TASKS_FOLDER,
                    // Where new tasks go when they do not go into the day's
                    // note — which is also the case while the journal is off.
                    showIf: (v) => !whenFeature('tasks.captureDaily')(v),
                },
            ],
        },
        {
            // How attached pictures sit in a task row. A setting rather than a
            // per-image choice: the alternative is inventing a syntax for it in
            // the note, and a task list looks better when its pictures agree.
            id: 'images',
            titleKey: 'settings.taskImages',
            showIf: whenFeature('tasks.attachments'),
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
