// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext } from '../src/context/AppContext';
import { useZenithStore } from '../src/store';
import type { SubTask, Task } from '../src/store/taskSlice';
import { SubtasksDialog } from '../src/modules/tasks/components/SubtasksDialog';
import { askForTask, detailKey } from '../src/modules/tasks/services/taskViewState';

/**
 * A task's subtasks open in a dialog of their own from the dashboard's card.
 * They used to unfold on the card, which has a budget of rows: it showed the
 * first few still open and pushed the tasks under them off the card.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { activeDocument?: Document }).activeDocument = document;
(HTMLElement.prototype as { setCssStyles?: (styles: Record<string, string>) => void }).setCssStyles =
    function (this: HTMLElement, styles: Record<string, string>) {
        Object.assign(this.style, styles);
    };

const sub = (lineNumber: number, title: string, over: Partial<SubTask> = {}): SubTask => ({
    title,
    status: 'todo',
    completed: false,
    lineNumber,
    subtasks: [],
    ...over,
});

const TASK = {
    id: 'Inbox.md:10',
    title: 'Quarterly report',
    status: 'todo',
    completed: false,
    priority: 'none',
    tags: [],
    filePath: 'Inbox.md',
    lineNumber: 10,
    subtasks: [
        sub(11, 'Collect the numbers', { status: 'done', completed: true }),
        sub(12, 'Draft the introduction', {
            status: 'in-progress',
            subtasks: [sub(13, 'Outline')],
        }),
        sub(14, 'Send to review'),
    ],
} as unknown as Task;

let host: HTMLElement;
let root: Root;
const onClose = vi.fn();
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

function open(): void {
    // No vault behind it: this is about what the dialog draws, not what it writes.
    const value = { app: { keymap: undefined }, plugin: { dataService: { reloadTasks: vi.fn() } } };
    act(() =>
        root.render(
            React.createElement(
                AppContext.Provider,
                { value: value as never },
                React.createElement(SubtasksDialog, { taskId: TASK.id, onClose })
            )
        )
    );
}

const panel = () => document.querySelector<HTMLElement>('.zenith-subdlg');
const rows = () => [...document.querySelectorAll<HTMLElement>('.zenith-subdlg__row')];

describe('the subtasks dialog', () => {
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        onClose.mockClear();
        act(() => useZenithStore.setState({ tasks: [TASK] }));
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        act(() => useZenithStore.setState({ tasks: [] }));
    });

    it('is headed by the task, and says how far along it is', () => {
        open();
        expect(panel()?.querySelector('.zenith-subdlg__title')?.textContent).toBe('Quarterly report');
        // Nested ones count: one of four is done.
        expect(panel()?.querySelector('.zenith-subdlg__tally')?.textContent).toContain('1 of 4 subtasks');
        expect(panel()?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    });

    it('lists every subtask in the note’s order, done ones too', () => {
        open();
        expect(rows().map((row) => row.querySelector('.zenith-subdlg__name')?.textContent)).toEqual([
            'Collect the numbers',
            'Draft the introduction',
            'Outline',
            'Send to review',
        ]);
        expect(rows().map((row) => row.classList.contains('is-closed'))).toEqual([
            true,
            false,
            false,
            false,
        ]);
        // A subtask of a subtask stands a step in.
        expect(rows().map((row) => row.style.getPropertyValue('--subdlg-depth'))).toEqual([
            '0',
            '0',
            '1',
            '0',
        ]);
    });

    it('does not open with the cursor in its field', async () => {
        open();
        await settle();
        // On a phone that would raise the keyboard over a list someone came to tick.
        expect(document.activeElement?.tagName).not.toBe('INPUT');
        expect(document.activeElement?.classList.contains('zenith-subdlg__list')).toBe(true);
    });

    it('follows the task as it changes', () => {
        open();
        const next = {
            ...TASK,
            subtasks: [...TASK.subtasks, sub(15, 'Proofread')],
        } as Task;
        act(() => useZenithStore.setState({ tasks: [next] }));
        expect(rows()).toHaveLength(5);
        expect(panel()?.querySelector('.zenith-subdlg__tally')?.textContent).toContain('1 of 5 subtasks');
    });

    it('closes when its task is gone', () => {
        open();
        act(() => useZenithStore.setState({ tasks: [] }));
        expect(onClose).toHaveBeenCalled();
        expect(panel()).toBeNull();
    });

    it('turns a name into a field at its pencil, and Escape there keeps the dialog', () => {
        open();
        const pencils = () => [...document.querySelectorAll<HTMLElement>('.zenith-subdlg__edit')];
        expect(pencils()).toHaveLength(4);
        act(() => pencils()[1].click());

        const field = rows()[1].querySelector<HTMLInputElement>('input.zenith-subdlg__rename');
        expect(field?.value).toBe('Draft the introduction');
        // One row is being renamed; the others still have their pencils.
        expect(pencils()).toHaveLength(3);

        act(() => {
            field?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
            );
        });
        expect(rows()[1].querySelector('input')).toBeNull();
        expect(rows()[1].querySelector('.zenith-subdlg__name')?.textContent).toBe(
            'Draft the introduction'
        );
        // The Escape was the field's: the dialog is still there.
        expect(onClose).not.toHaveBeenCalled();
        expect(panel()).not.toBeNull();
    });

    it('has a way to the Tasks view, beside the close button', () => {
        open();
        const activateView = vi.fn();
        // The same dialog, with a plugin that has a tasks view to open.
        const value = {
            app: { keymap: undefined },
            plugin: {
                dataService: { reloadTasks: vi.fn() },
                moduleManager: { get: () => ({ activateView }) },
            },
        };
        act(() =>
            root.render(
                React.createElement(
                    AppContext.Provider,
                    { value: value as never },
                    React.createElement(SubtasksDialog, { taskId: TASK.id, onClose })
                )
            )
        );
        act(() => document.querySelector<HTMLElement>('.zenith-subdlg__open')?.click());
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(activateView).toHaveBeenCalledTimes(1);
        // The list has been asked for this task, and to have it unfolded.
        expect(useZenithStore.getState().taskFocus).toBe(detailKey(TASK));
        expect(useZenithStore.getState().settings.taskView.open).toContain(detailKey(TASK));
        act(() => useZenithStore.getState().setTaskFocus(null));
    });
});

describe('asking the list for a task', () => {
    it('unfolds the task and leaves the request for the list to answer', () => {
        act(() => askForTask({ filePath: 'Inbox.md', title: 'Pack the books' }));
        const state = useZenithStore.getState();
        expect(state.taskFocus).toBe('Inbox.md::Pack the books');
        expect(state.settings.taskView.open?.[0]).toBe('Inbox.md::Pack the books');
        act(() => state.setTaskFocus(null));
    });
});
