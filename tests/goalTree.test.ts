import { describe, expect, it } from 'vitest';
import { buildGoals, isGoal, newRef, openGoals } from '../src/modules/tasks/services/goalTree';
import { applyTaskPatch, parseTaskText } from '../src/modules/tasks/services/taskFormat';
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
    nodes.map((n) =>
        n.children.length ? [n.title, titles(n.children as typeof nodes)] : n.title
    );

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
            ['Run a marathon', ['Pick a race', ['Run 10 km', ['Run 5 km', 'Run 8 km']], 'Buy running shoes']],
        ]);
        expect(goals[0].children.map((c) => c.via)).toEqual(['subtask', 'link', 'link']);
    });

    it('counts the steps at the bottom, and none that was given up', () => {
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
        // Books, Kitchen, the movers — the van is not going to happen.
        expect([tree.done, tree.total]).toEqual([2, 3]);
        expect([tree.children[0].done, tree.children[0].total]).toEqual([1, 2]);
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
        expect(tree.children[0]).toMatchObject({ title: 'Write the copy', via: 'link', filePath: 'Inbox.md' });
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
        expect(parsed).toMatchObject({ title: 'Run a marathon', ref: 'marathon', needs: ['km10', 'shoes'] });
    });

    it('are written the way the Tasks plugin writes them, and taken off when emptied', () => {
        expect(applyTaskPatch('Run 10 km', { id: 'km10' })).toBe('Run 10 km 🆔 km10');
        expect(applyTaskPatch('Run a marathon 🆔 m ⛔ km10', { dependsOn: ['km10', 'shoes'] })).toBe(
            'Run a marathon 🆔 m ⛔ km10,shoes'
        );
        expect(applyTaskPatch('Run a marathon ⛔ km10,shoes', { dependsOn: ['shoes'] })).toBe(
            'Run a marathon ⛔ shoes'
        );
        expect(applyTaskPatch('Run a marathon ⛔ km10', { dependsOn: [] })).toBe('Run a marathon');
        // The same list, written another way, is left as it was written.
        expect(applyTaskPatch('Run ⛔ a, b', { dependsOn: ['a', 'b'] })).toBe('Run ⛔ a, b');
    });
});
