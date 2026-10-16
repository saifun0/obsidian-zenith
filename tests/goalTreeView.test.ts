// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppContext } from '../src/context/AppContext';
import { useZenithStore } from '../src/store';
import type { SubTask, Task } from '../src/store/taskSlice';
import { GoalTree } from '../src/modules/tasks/components/GoalTree';

/**
 * The goals' tree on the Tasks page: each goal a heading with how far along
 * it is, its steps under it — subtasks and the tasks its `⛔` names — and a
 * fold that is remembered.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { activeDocument?: Document }).activeDocument = document;

const sub = (lineNumber: number, title: string, over: Partial<SubTask> = {}): SubTask => ({
    title,
    status: 'todo',
    completed: false,
    lineNumber,
    subtasks: [],
    ...over,
});

const task = (lineNumber: number, title: string, over: Partial<Task> = {}): Task =>
    ({
        id: `Inbox.md:${lineNumber}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        filePath: 'Inbox.md',
        lineNumber,
        subtasks: [],
        ...over,
    }) as unknown as Task;

const MARATHON = task(1, 'Run a half marathon', {
    tags: ['goal'],
    needs: ['run15'],
    subtasks: [sub(2, 'Join the club', { status: 'done', completed: true })],
});
const RUN15 = task(4, 'Run 15 km', {
    ref: 'run15',
    subtasks: [sub(5, 'Run 10 km', { status: 'done', completed: true }), sub(6, 'Run 12 km')],
});
const READ = task(8, 'Read twelve books', {
    tags: ['Goal/Year'],
    subtasks: [sub(9, 'The first', { status: 'done', completed: true })],
});

let host: HTMLElement;
let root: Root;

function draw(tasks: Task[]): void {
    const value = { app: { keymap: undefined }, plugin: { dataService: { reloadTasks: vi.fn() } } };
    act(() =>
        root.render(
            React.createElement(
                AppContext.Provider,
                { value: value as never },
                React.createElement(GoalTree, { tasks, goalTag: 'goal' })
            )
        )
    );
}

const names = () => [...document.querySelectorAll('.zenith-goal__name')].map((n) => n.textContent);
const heads = () =>
    [...document.querySelectorAll('.zenith-goal__row.is-head .zenith-goal__name')].map(
        (n) => n.textContent
    );

describe('the goals tree', () => {
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        const view = useZenithStore.getState().settings.taskView;
        act(() =>
            useZenithStore.setState((s) => ({
                settings: { ...s.settings, taskView: { ...view, goalsClosed: [] } },
            }))
        );
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('heads each goal, with its subtasks and the tasks it needs under it', () => {
        draw([MARATHON, RUN15, READ]);
        expect(heads()).toEqual(['Read twelve books', 'Run a half marathon']);
        expect(names()).toEqual([
            'Read twelve books',
            'The first',
            'Run a half marathon',
            'Join the club',
            'Run 15 km',
            'Run 10 km',
            'Run 12 km',
        ]);
    });

    it('counts the leaves, and says quietly when every step is done', () => {
        draw([MARATHON, RUN15, READ]);
        const folds = [...document.querySelectorAll('.zenith-goal__fold')].map(
            (b) => b.textContent
        );
        expect(folds).toEqual(['1/1', '2/3']);
        const ready = [...document.querySelectorAll('.zenith-goal')].map(
            (g) => !!g.querySelector('.zenith-goal__ready')
        );
        expect(ready).toEqual([true, false]);
        // The goal itself stays open: closing it is the reader's call.
        expect(document.querySelector('.zenith-goal.is-closed')).toBeNull();
    });

    it('folds a goal, and remembers it in the settings', () => {
        draw([MARATHON, RUN15]);
        const fold = document.querySelector<HTMLButtonElement>('.zenith-goal__fold');
        act(() => fold?.click());
        expect(names()).toEqual(['Run a half marathon']);
        expect(useZenithStore.getState().settings.taskView.goalsClosed).toEqual([
            'Inbox.md::Run a half marathon',
        ]);
        act(() => fold?.click());
        expect(names()).toHaveLength(5);
        expect(useZenithStore.getState().settings.taskView.goalsClosed).toEqual([]);
    });

    it('says how to make a goal when there is none', () => {
        draw([RUN15]);
        expect(heads()).toEqual([]);
        expect(document.querySelector('.zenith-tempty__hint')?.textContent).toContain('#goal');
        expect(document.querySelector('.zenith-goal__new input')).not.toBeNull();
    });
});
