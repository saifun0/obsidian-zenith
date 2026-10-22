import { describe, expect, it } from 'vitest';
import { projectFromFrontmatter } from '../src/modules/projects/services/projectParser';
import { projectSteps } from '../src/modules/projects/services/projectGoals';
import { buildGoals } from '../src/modules/tasks/services/goalTree';
import type { SubTask, Task } from '../src/store/taskSlice';

/**
 * A project as a step of a goal: a step whose title links to the project's
 * note is as far along as the project's own tasks, and ready when they are
 * all done — closed by hand, as every step is.
 */

const project = (name: string, title = name) =>
    projectFromFrontmatter(
        { title, status: 'in-progress' },
        { path: `20 Projects/${name}.md`, name: `${name}.md`, basename: name, mtime: 0 },
        []
    );

function task(title: string, extra: Partial<Task> = {}): Task {
    return {
        id: `${extra.filePath ?? 'x.md'}:${title}`,
        title,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        filePath: '20 Projects/Arabic.md',
        lineNumber: 1,
        subtasks: [],
        createdAt: 0,
        ...extra,
    } as Task;
}

const sub = (title: string, extra: Partial<SubTask> = {}): SubTask =>
    ({ title, status: 'todo', lineNumber: 2, subtasks: [], ...extra }) as SubTask;

const goal = (subtasks: SubTask[]) =>
    task('Speak Arabic', { tags: ['goal'], filePath: 'Goals.md', subtasks });

const PROJECT_TASKS = [
    task('Alphabet', { status: 'done' }),
    task('Vowels', { status: 'done' }),
    task('Unit 3'),
    task('Unit 4'),
];

describe('a project as a step', () => {
    it('is as far along as the project’s tasks', () => {
        const tasks = [goal([sub('[[Arabic]]'), sub('Find a partner')]), ...PROJECT_TASKS];
        const [tree] = buildGoals(tasks, 'goal', projectSteps([project('Arabic')], tasks));
        const step = tree.children[0];
        expect(step.project).toMatchObject({ title: 'Arabic', done: 2, total: 4 });
        expect(step.progress).toBe(0.5);
        expect(step.ready).toBe(false);
        // Its share of the goal: half of one of two steps.
        expect(tree.progress).toBe(0.25);
    });

    it('is named by the file or the title, with an alias or without', () => {
        const tasks = [goal([sub('Study [[Arabic|the course]]')]), ...PROJECT_TASKS];
        const linked = projectSteps([project('Arabic', 'Learn Arabic')], tasks);
        expect(linked('Study [[Arabic|the course]]')?.title).toBe('Learn Arabic');
        expect(linked('[[Learn Arabic]]')?.title).toBe('Learn Arabic');
        expect(linked('[[Something else]]')).toBeUndefined();
        expect(linked('No link at all')).toBeUndefined();
    });

    it('is ready, not closed, once every task of the project is done', () => {
        const done = PROJECT_TASKS.map((t) => ({ ...t, status: 'done' as const }));
        const tasks = [goal([sub('[[Arabic]]')]), ...done];
        const [tree] = buildGoals(tasks, 'goal', projectSteps([project('Arabic')], tasks));
        expect(tree.children[0].ready).toBe(true);
        expect(tree.children[0].status).toBe('todo');
    });

    it('is a plain step when steps are written under it', () => {
        const tasks = [goal([sub('[[Arabic]]', { subtasks: [sub('Unit 5')] })]), ...PROJECT_TASKS];
        const [tree] = buildGoals(tasks, 'goal', projectSteps([project('Arabic')], tasks));
        expect(tree.children[0].project).toBeUndefined();
    });
});
