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

const flipped = () => useZenithStore.getState().settings.taskView.goalsFlipped;
const rowOf = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('.zenith-goal__row')].find(
        (r) => r.querySelector('.zenith-goal__name')?.textContent === name
    );
const goalOf = (name: string) => rowOf(name)?.closest<HTMLElement>('.zenith-goal');

describe('the goals tree', () => {
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        const view = useZenithStore.getState().settings.taskView;
        act(() =>
            useZenithStore.setState((s) => ({
                settings: { ...s.settings, taskView: { ...view, goalsFlipped: [] } },
            }))
        );
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('heads each goal, with its subtasks and the tasks it needs under it', () => {
        draw([MARATHON, RUN15, READ]);
        // The goal with no area first; the one tagged #Goal/Year under "Year".
        expect(heads()).toEqual(['Run a half marathon', 'Read twelve books']);
        expect(document.querySelector('.zenith-goals__area')?.textContent).toBe('Year');
        expect(names()).toEqual([
            'Run a half marathon',
            'Join the club',
            'Run 15 km',
            'Run 10 km',
            'Run 12 km',
            'Read twelve books',
            'The first',
        ]);
    });

    it('counts a goal’s steps under its name, and a stage’s after its own', () => {
        draw([MARATHON, RUN15, READ]);
        const goalCounts = [...document.querySelectorAll('.zenith-goal__meta .zenith-goal__count')];
        expect(goalCounts.map((b) => b.textContent)).toEqual(['1/2', '1/1']);
        expect(rowOf('Run 15 km')?.classList.contains('is-stage')).toBe(true);
        expect(rowOf('Run 15 km')?.querySelector('.zenith-goal__count')?.textContent).toBe('1/2');
        expect(rowOf('Run 12 km')?.querySelector('.zenith-goal__count')).toBeNull();
    });

    it('draws how far along a goal is with everything under it in shares', () => {
        draw([MARATHON, RUN15, READ]);
        const bars = [...document.querySelectorAll('.zenith-goal__progress')];
        // The club is done and the 15 km half: three quarters.
        expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['75', '100']);
    });

    it('marks a goal whose steps are all done as ready, and leaves it open', () => {
        draw([MARATHON, RUN15, READ]);
        const ready = (name: string) => !!rowOf(name)?.querySelector('.zenith-status.is-ready');
        expect(ready('Read twelve books')).toBe(true);
        expect(ready('Run a half marathon')).toBe(false);
        expect(document.querySelector('.zenith-goal.is-closed')).toBeNull();
    });

    it('marks the next thing to do', () => {
        draw([MARATHON, RUN15]);
        const marks = [...document.querySelectorAll('.zenith-goal__when.is-next')];
        expect(marks).toHaveLength(1);
        expect(marks[0].closest('.zenith-goal__row')).toBe(rowOf('Run 12 km'));
    });

    it('folds a goal by its count, says what is next, and remembers it', () => {
        draw([MARATHON, RUN15]);
        const count = goalOf('Run a half marathon')?.querySelector<HTMLButtonElement>(
            '.zenith-goal__meta .zenith-goal__count'
        );
        act(() => count?.click());
        expect(names()).toEqual(['Run a half marathon']);
        expect(document.querySelector('.zenith-goal__nextis')?.textContent).toBe('next: Run 12 km');
        expect(flipped()).toEqual(['Inbox.md::Run a half marathon']);
        act(() => count?.click());
        expect(names()).toHaveLength(5);
        expect(flipped()).toEqual([]);
    });

    it('folds a stage by its count', () => {
        draw([MARATHON, RUN15]);
        act(() =>
            rowOf('Run 15 km')?.querySelector<HTMLButtonElement>('.zenith-goal__count')?.click()
        );
        expect(names()).toEqual(['Run a half marathon', 'Join the club', 'Run 15 km']);
        expect(flipped()).toEqual(['Inbox.md::Run a half marathon > Run 15 km']);
    });

    it('keeps a closed stage folded until it is opened', () => {
        const goal = task(20, 'Learn English', {
            tags: ['goal'],
            subtasks: [
                sub(21, 'Stage 1', {
                    status: 'done',
                    completed: true,
                    subtasks: [sub(22, 'Old', { status: 'done', completed: true })],
                }),
                sub(23, 'Stage 2', { subtasks: [sub(24, 'Task 1')] }),
            ],
        });
        draw([goal]);
        expect(names()).toEqual(['Learn English', 'Stage 1', 'Stage 2', 'Task 1']);
        act(() =>
            rowOf('Stage 1')?.querySelector<HTMLButtonElement>('.zenith-goal__count')?.click()
        );
        expect(names()).toContain('Old');
    });

    it('opens the field for a step at the end of the steps, a level in', () => {
        draw([MARATHON, RUN15]);
        act(() =>
            rowOf('Run 15 km')
                ?.querySelector<HTMLButtonElement>('.zenith-goal__act.is-add')
                ?.click()
        );
        const field = document.querySelector('.zenith-goal__add');
        const list = field?.closest('ul');
        expect(list?.lastElementChild?.contains(field ?? null)).toBe(true);
        expect(list?.previousElementSibling).toBe(rowOf('Run 15 km'));
    });

    it('keeps the goals that are done at the bottom, behind one line', () => {
        const done = task(30, 'Learn to swim', { tags: ['goal'], status: 'done', completed: true });
        draw([MARATHON, RUN15, done]);
        expect(heads()).toEqual(['Run a half marathon']);
        const line = document.querySelector<HTMLButtonElement>('.zenith-goals__done');
        expect(line?.textContent).toBe('Done · 1');
        act(() => line?.click());
        expect(heads()).toEqual(['Run a half marathon', 'Learn to swim']);
    });

    it('says how to make a goal when there is none', () => {
        draw([RUN15]);
        expect(heads()).toEqual([]);
        expect(document.querySelector('.zenith-tempty__hint')?.textContent).toContain('#goal');
        expect(document.querySelector('.zenith-goal__new input')).not.toBeNull();
    });
});
