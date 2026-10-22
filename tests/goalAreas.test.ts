import { describe, expect, it } from 'vitest';
import { buildGoals, goalArea } from '../src/modules/tasks/services/goalTree';
import type { Task } from '../src/store/taskSlice';

/**
 * Goals filed under areas by their tag — `#goal/здоровье` — and grouped
 * under the areas' names in the tree; a goal tagged `#goal` alone has none.
 */

describe('a goal’s area', () => {
    it('is the first part of its tag after the goal tag, named with a capital', () => {
        expect(goalArea(['goal/здоровье'], 'goal')).toBe('Здоровье');
        expect(goalArea(['#goal/здоровье/сон'], '#goal')).toBe('Здоровье');
        expect(goalArea(['work', 'goal/side-projects'], 'goal')).toBe('Side projects');
    });

    it('is none for the goal tag alone, or another tag', () => {
        expect(goalArea(['goal'], 'goal')).toBeUndefined();
        expect(goalArea(['goals/x', 'health'], 'goal')).toBeUndefined();
        expect(goalArea(['goal/'], 'goal')).toBeUndefined();
    });

    it('is carried on the goal in the tree', () => {
        const task = (title: string, tags: string[]) =>
            ({
                id: title,
                title,
                status: 'todo',
                completed: false,
                priority: 'none',
                tags,
                filePath: 'Goals.md',
                lineNumber: 1,
                subtasks: [],
                createdAt: '',
            }) as Task;
        const goals = buildGoals([task('Run', ['goal/health']), task('Read', ['goal'])], 'goal');
        expect(goals.map((g) => [g.title, g.area])).toEqual([
            ['Read', undefined],
            ['Run', 'Health'],
        ]);
    });
});
