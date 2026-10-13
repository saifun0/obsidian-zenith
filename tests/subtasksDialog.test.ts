// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext } from '../src/context/AppContext';
import { useZenithStore } from '../src/store';
import type { SubTask, Task } from '../src/store/taskSlice';
import { SubtasksDialog } from '../src/modules/tasks/components/SubtasksDialog';

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
});
