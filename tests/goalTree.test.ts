import { describe, expect, it } from 'vitest';
import {
    buildGoals,
    goalSteps,
    isGoal,
    listedTasks,
    newRef,
    openGoals,
    withoutGoals,
} from '../src/modules/tasks/services/goalTree';
import { applyTaskPatch, parseTaskText } from '../src/modules/tasks/services/taskFormat';
import { goalsNotePath } from '../src/modules/tasks/services/goalActions';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * Goals as a tree: a goal is a task with the goal tag, and under it are its
 * subtasks and the tasks its ⛔ names by their 🆔 — to any depth.
 */

let line = 0;
const task = (title: string, over: Partial<Task> = {}): Task =>
    ({
        id: `Inbox.md:${++line}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'Inbox.md',
        lineNumber: line,
        ...over,
    }) as Task;
const sub = (title: string, over: Partial<SubTask> = {}): SubTask => ({
    title,
    status: 'todo',
    completed: false,
    lineNumber: ++line,
    subtasks: [],
    ...over,
});
const titles = (nodes: { title: string; children: unknown[] }[]): unknown =>
    nodes.map((n) => (n.children.length ? [n.title, titles(n.children as typeof nodes)] : n.title));

describe('what a goal is', () => {
    it('is a task with the goal tag, nested ones too, without regard to case', () => {
        expect(isGoal({ tags: ['goal'] }, 'goal')).toBe(true);
        expect(isGoal({ tags: ['Goal/health'] }, '#goal')).toBe(true);
        expect(isGoal({ tags: ['goals'] }, 'goal')).toBe(false);
        expect(isGoal({ tags: ['goal'] }, '')).toBe(false);
    });
});

describe('the tree under a goal', () => {
    it('has the goal’s subtasks and the tasks its ⛔ names, and theirs in turn', () => {
        const shoes = task('Buy running shoes', { ref: 'shoes' });
        const km10 = task('Run 10 km', {
            ref: 'km10',
            subtasks: [sub('Run 5 km'), sub('Run 8 km')],
        });
        const marathon = task('Run a marathon', {
            tags: ['goal'],
            needs: ['km10', 'shoes'],
            subtasks: [sub('Pick a race')],
        });
        const goals = buildGoals([shoes, km10, marathon], 'goal');
        expect(titles(goals)).toEqual([
            [
                'Run a marathon',
                ['Pick a race', ['Run 10 km', ['Run 5 km', 'Run 8 km']], 'Buy running shoes'],
            ],
        ]);
        expect(goals[0].children.map((c) => c.via)).toEqual(['subtask', 'link', 'link']);
    });

    it('counts the steps right under it, closed by hand, and none that was given up', () => {
        const goal = task('Move', {
            tags: ['goal'],
            subtasks: [
                sub('Pack', {
                    subtasks: [sub('Books', { status: 'done' }), sub('Kitchen')],
                }),
                sub('Book the movers', { status: 'done' }),
                sub('Rent a van', { status: 'cancelled' }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        // Packing and the movers — the van is not going to happen.
        expect([tree.done, tree.total]).toEqual([1, 2]);
        expect([tree.children[0].done, tree.children[0].total]).toEqual([1, 2]);
        // A task to do has no steps to count.
        expect([tree.children[1].done, tree.children[1].total]).toEqual([0, 0]);
    });

    it('is as far along as its steps are, each an equal share, all the way down', () => {
        const goal = task('Move', {
            tags: ['goal'],
            subtasks: [
                sub('Pack', {
                    subtasks: [sub('Books', { status: 'done' }), sub('Kitchen')],
                }),
                sub('Book the movers', { status: 'done' }),
                sub('Rent a van', { status: 'cancelled' }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        // Packing is half done, the movers all: three quarters, before any stage is closed.
        expect(tree.children[0].progress).toBe(0.5);
        expect(tree.progress).toBe(0.75);
        // A stage closed by hand is all done, whatever is left under it.
        const closed = task('Move', {
            tags: ['goal'],
            subtasks: [sub('Pack', { status: 'done', subtasks: [sub('Kitchen')] }), sub('Clean')],
        });
        expect(buildGoals([closed], 'goal')[0].progress).toBe(0.5);
    });

    it('is ready to close when every step under it is done, and does not close itself', () => {
        const goal = task('Read more', {
            tags: ['goal'],
            subtasks: [
                sub('Autumn', {
                    subtasks: [sub('One', { status: 'done' }), sub('Two', { status: 'cancelled' })],
                }),
                sub('Winter', { subtasks: [sub('Three')] }),
                sub('Spring', { status: 'done', subtasks: [sub('Four', { status: 'done' })] }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        expect(tree.children.map((c) => c.ready)).toEqual([true, false, false]);
        expect(tree.children[0].status).toBe('todo');
        expect(tree.ready).toBe(false);
    });

    it('knows what is next: the first task still to do, past closed stages and stages with nothing left', () => {
        const goal = task('Learn English', {
            tags: ['goal'],
            subtasks: [
                sub('Stage 1', { status: 'done', subtasks: [sub('Old')] }),
                sub('Stage 2', { subtasks: [sub('Done', { status: 'done' })] }),
                sub('Stage 3', {
                    subtasks: [
                        sub('Gone', { status: 'cancelled' }),
                        sub('Task 1', { subtasks: [sub('Subtask')] }),
                        sub('Task 2'),
                    ],
                }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        expect(tree.next?.title).toBe('Subtask');
        expect(tree.children[2].next?.title).toBe('Subtask');
        expect(tree.children[1].next).toBeUndefined();
        expect(buildGoals([task('Bare', { tags: ['goal'] })], 'goal')[0].next).toBeUndefined();
    });

    it('remembers a fold by the note and the names down to it, not by the line', () => {
        const goal = task('Learn English', {
            tags: ['goal'],
            filePath: 'Goals.md',
            subtasks: [
                sub('Stage 1', { subtasks: [sub('Task 1')] }),
                sub('Stage 2', { subtasks: [sub('Task 1')] }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        expect(tree.foldKey).toBe('Goals.md::Learn English');
        expect(tree.children.map((c) => c.children[0].foldKey)).toEqual([
            'Goals.md::Learn English > Stage 1 > Task 1',
            'Goals.md::Learn English > Stage 2 > Task 1',
        ]);
    });

    it('puts a task two goals need under both', () => {
        const visa = task('Get the visa', { ref: 'visa' });
        const goals = buildGoals(
            [
                visa,
                task('Trip to Japan', { tags: ['goal'], needs: ['visa'] }),
                task('Conference in Tokyo', { tags: ['goal'], needs: ['visa'] }),
            ],
            'goal'
        );
        expect(goals.map((g) => g.children.map((c) => c.title))).toEqual([
            ['Get the visa'],
            ['Get the visa'],
        ]);
    });

    it('cuts a loop where it would come round again, and passes over an id nobody has', () => {
        const a = task('A', { ref: 'a', needs: ['b'] });
        const b = task('B', { ref: 'b', needs: ['a', 'nobody'] });
        const goal = task('Goal', { tags: ['goal'], needs: ['a'] });
        expect(titles(buildGoals([a, b, goal], 'goal'))).toEqual([['Goal', [['A', ['B']]]]]);
    });

    it('reaches a subtask by its 🆔 too', () => {
        const parent = task('Website', { subtasks: [sub('Write the copy', { ref: 'copy' })] });
        const goal = task('Launch', { tags: ['goal'], needs: ['copy'] });
        const [tree] = buildGoals([parent, goal], 'goal');
        expect(tree.children[0]).toMatchObject({
            title: 'Write the copy',
            via: 'link',
            filePath: 'Inbox.md',
        });
    });

    it('lists open goals first, by when they are due, and counts only those', () => {
        const tasks = [
            task('Done one', { tags: ['goal'], status: 'done' }),
            task('Later', { tags: ['goal'], dueDate: '2026-12-01' }),
            task('Sooner', { tags: ['goal'], dueDate: '2026-10-20' }),
            task('No date', { tags: ['goal'] }),
            task('Not a goal'),
        ];
        expect(buildGoals(tasks, 'goal').map((g) => g.title)).toEqual([
            'Sooner',
            'Later',
            'No date',
            'Done one',
        ]);
        expect(openGoals(tasks, 'goal')).toBe(3);
        expect(withoutGoals(tasks, 'goal').map((t) => t.title)).toEqual(['Not a goal']);
    });
});

describe('a new 🆔', () => {
    it('is six letters and digits, and none already in use', () => {
        const taken = task('Taken', { ref: 'aaaaaa' });
        // The first draw gives the taken one; the next does not.
        const draws = [...Array(6).fill(0), ...Array(6).fill(0.99)];
        expect(newRef([taken], () => draws.shift() ?? 0)).toBe('999999');
        expect(newRef([])).toMatch(/^[a-z0-9]{6}$/);
    });
});

describe('🆔 and ⛔ on the line', () => {
    it('are read', () => {
        const parsed = parseTaskText('Run a marathon #goal 🆔 marathon ⛔ km10, shoes', {
            priority: 'none',
            tags: [],
        });
        expect(parsed).toMatchObject({
            title: 'Run a marathon',
            ref: 'marathon',
            needs: ['km10', 'shoes'],
        });
    });

    it('are written the way the Tasks plugin writes them, and taken off when emptied', () => {
        expect(applyTaskPatch('Run 10 km', { id: 'km10' })).toBe('Run 10 km 🆔 km10');
        expect(
            applyTaskPatch('Run a marathon 🆔 m ⛔ km10', { dependsOn: ['km10', 'shoes'] })
        ).toBe('Run a marathon 🆔 m ⛔ km10,shoes');
        expect(applyTaskPatch('Run a marathon ⛔ km10,shoes', { dependsOn: ['shoes'] })).toBe(
            'Run a marathon ⛔ shoes'
        );
        expect(applyTaskPatch('Run a marathon ⛔ km10', { dependsOn: [] })).toBe('Run a marathon');
        // The same list, written another way, is left as it was written.
        expect(applyTaskPatch('Run ⛔ a, b', { dependsOn: ['a', 'b'] })).toBe('Run ⛔ a, b');
    });
});

describe('the goals’ note', () => {
    it('is named in the settings, Goals by default, in the tasks folder', () => {
        expect(goalsNotePath({ tasksGoalsNote: '', tasksFolderPath: '10 Inbox/Tasks' })).toBe(
            '10 Inbox/Tasks/Goals.md'
        );
        expect(goalsNotePath({ tasksGoalsNote: ' Цели.md ', tasksFolderPath: 'Tasks/' })).toBe(
            'Tasks/Цели.md'
        );
        expect(goalsNotePath({ tasksGoalsNote: 'Year/2027', tasksFolderPath: '' })).toBe(
            'Year/2027.md'
        );
    });
});

describe('hours in the tree', () => {
    it('makes a step that asks for hours in all as far along as they are', () => {
        const goal = task('Speak Arabic', {
            tags: ['goal'],
            subtasks: [
                sub('Course', { target: { amount: 6000, weekly: false }, spentMinutes: 3000 }),
                sub('Trip', { status: 'done' }),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        expect(tree.children[0].progress).toBe(0.5);
        expect(tree.progress).toBe(0.75);
        expect(tree.children[0].ready).toBe(false);
        const done = task('Speak Arabic', {
            tags: ['goal'],
            subtasks: [
                sub('Course', { target: { amount: 600, weekly: false }, spentMinutes: 600 }),
            ],
        });
        expect(buildGoals([done], 'goal')[0].children[0].ready).toBe(true);
    });

    it('leaves a weekly habit out of every count above it', () => {
        const goal = task('Learn English', {
            tags: ['goal'],
            subtasks: [
                sub('Study', { target: { amount: 1200, weekly: true }, spentMinutes: 99999 }),
                sub('Pass B2'),
            ],
        });
        const [tree] = buildGoals([goal], 'goal');
        expect([tree.done, tree.total]).toEqual([0, 1]);
        expect(tree.progress).toBe(0);
        expect(tree.next?.title).toBe('Pass B2');
        expect(tree.children[0].target).toEqual({ amount: 1200, weekly: true });
    });
});

describe('a goal’s steps in the list', () => {
    it('are the open ones with a day, under nothing closed, each once', () => {
        const goal = task('Learn English', {
            tags: ['goal'],
            subtasks: [
                sub('Stage 1', {
                    dueDate: '2026-10-20',
                    subtasks: [sub('Inside a dated stage', { dueDate: '2026-10-19' })],
                }),
                sub('Stage 2', {
                    subtasks: [
                        sub('Dated step', { dueDate: '2026-10-21' }),
                        sub('Done step', { status: 'done', dueDate: '2026-10-18' }),
                        sub('No day'),
                    ],
                }),
                sub('Closed stage', {
                    status: 'done',
                    subtasks: [sub('Left over', { dueDate: '2026-10-22' })],
                }),
            ],
        });
        const plain = task('Buy milk', { dueDate: '2026-10-19' });
        const rows = goalSteps([goal, plain], 'goal');
        expect(rows.map((r) => r.title)).toEqual(['Stage 1', 'Dated step']);
        expect(rows[0]).toMatchObject({
            goal: 'Learn English',
            filePath: 'Inbox.md',
            dueDate: '2026-10-20',
        });
        expect(rows[0].subtasks.map((s) => s.title)).toEqual(['Inside a dated stage']);
        expect(listedTasks([goal, plain], 'goal').map((r) => r.title)).toEqual([
            'Buy milk',
            'Stage 1',
            'Dated step',
        ]);
    });

    it('are not listed from a goal that is closed', () => {
        const goal = task('Old goal', {
            tags: ['goal'],
            status: 'done',
            subtasks: [sub('Step', { dueDate: '2026-10-20' })],
        });
        expect(goalSteps([goal], 'goal')).toEqual([]);
    });
});
