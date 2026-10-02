import { Menu, type App } from 'obsidian';
import { TASK_STATUSES, type TaskStatus } from '../../../core/constants';
import type { Translator } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { TimerService } from '../services/timerService';
import { isRunningFor } from '../services/taskTimer';
import { STATUS_I18N } from './taskStatusUi';

const STATUS_ICON: Record<TaskStatus, string> = {
    todo: 'circle',
    'in-progress': 'play',
    done: 'check',
    cancelled: 'x',
};

/** One line of a note that holds a task or a subtask. */
export interface MenuLine {
    filePath: string;
    lineNumber: number;
    title: string;
    status: TaskStatus;
    timerMinutes?: number;
}

/** Where "move to" in the menu can put a task. */
export type ScheduleTarget = 'today' | 'tomorrow' | 'nodate';

export interface MenuActions {
    onStatus?: (status: TaskStatus) => void;
    /** Move the deadline; left out for a finished line. */
    onSchedule?: (to: ScheduleTarget) => void;
    onAddSubtask?: () => void;
    /** Offer the timer; left out for a finished line or with the feature off. */
    timer?: boolean;
    onEdit: () => void;
    onOpen: () => void;
    onDelete: () => void;
}

/**
 * The menu behind a task or a subtask: what used to be a row of six buttons
 * under every card, now behind one right-click, or one long press on a phone.
 * Everything that changes the line is here; the checkbox and a tap on the row
 * (the editor) stay in front.
 */
export function showLineMenu(
    app: App,
    t: Translator,
    line: MenuLine,
    actions: MenuActions,
    at: { x: number; y: number } | MouseEvent
): void {
    const menu = new Menu();

    if (actions.onStatus) {
        for (const status of TASK_STATUSES) {
            menu.addItem((item) =>
                item
                    .setTitle(t(STATUS_I18N[status]))
                    .setIcon(STATUS_ICON[status])
                    .setChecked(line.status === status)
                    .onClick(() => actions.onStatus?.(status))
            );
        }
        menu.addSeparator();
    }

    if (actions.onSchedule) {
        const schedule = actions.onSchedule;
        const targets: Array<[ScheduleTarget, string, string]> = [
            ['today', 'tasks.menu.today', 'calendar-check'],
            ['tomorrow', 'tasks.menu.tomorrow', 'sunrise'],
            ['nodate', 'tasks.menu.nodate', 'calendar-x'],
        ];
        for (const [to, key, icon] of targets) {
            menu.addItem((item) => item.setTitle(t(key)).setIcon(icon).onClick(() => schedule(to)));
        }
        menu.addSeparator();
    }

    if (actions.onAddSubtask) {
        menu.addItem((item) =>
            item.setTitle(t('tasks.subtask.add')).setIcon('list-plus').onClick(() => actions.onAddSubtask?.())
        );
    }

    if (actions.timer) {
        const running = isRunningFor(
            useZenithStore.getState().settings.activeTimer,
            line.filePath,
            line.lineNumber
        );
        menu.addItem((item) =>
            item
                .setTitle(t(running ? 'tasks.timer.stop' : 'tasks.timer.start'))
                .setIcon(running ? 'square' : 'timer')
                .onClick(() => {
                    const service = new TimerService(app);
                    void (running
                        ? service.stopRunning()
                        : service.startFor({
                              filePath: line.filePath,
                              lineNumber: line.lineNumber,
                              title: line.title,
                              countdownMinutes: line.timerMinutes,
                          }));
                })
        );
    }

    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t('common.edit')).setIcon('pencil').onClick(actions.onEdit));
    menu.addItem((item) =>
        item.setTitle(t('common.openInFile')).setIcon('file-text').onClick(actions.onOpen)
    );
    menu.addSeparator();
    menu.addItem((item) =>
        item.setTitle(t('common.delete')).setIcon('trash-2').setWarning(true).onClick(actions.onDelete)
    );

    if (at instanceof MouseEvent) menu.showAtMouseEvent(at);
    else menu.showAtPosition(at);
}
