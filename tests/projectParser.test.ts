import { describe, it, expect } from 'vitest';
import {
    normalizeProjectStatus,
    normalizeProjectPriority,
    filterTasksForProject,
    ProjectParser,
} from '../src/modules/projects/services/projectParser';
import { computeProjectStats } from '../src/modules/projects/services/projectStats';
import type { Task } from '../src/store/taskSlice';
import type { Project } from '../src/modules/projects/projectsTypes';

function makeTask(partial: Partial<Task> & { id: string; title: string; filePath: string }): Task {
    return {
        status: 'todo',
        completed: partial.status === 'done',
        priority: 'none',
        tags: [],
        subtasks: [],
        lineNumber: 1,
        createdAt: '2026-09-09',
        ...partial,
    };
}

describe('normalizeProjectStatus', () => {
    it('normalizes status variants to canonical ProjectStatus', () => {
        expect(normalizeProjectStatus('active')).toBe('active');
        expect(normalizeProjectStatus('IN-PROGRESS')).toBe('in-progress');
        expect(normalizeProjectStatus('in_progress')).toBe('in-progress');
        expect(normalizeProjectStatus('progress')).toBe('in-progress');
        expect(normalizeProjectStatus('doing')).toBe('in-progress');
        expect(normalizeProjectStatus('completed')).toBe('completed');
        expect(normalizeProjectStatus('done')).toBe('completed');
        expect(normalizeProjectStatus('paused')).toBe('paused');
        expect(normalizeProjectStatus('on-hold')).toBe('paused');
        expect(normalizeProjectStatus('archived')).toBe('archived');
        expect(normalizeProjectStatus('archive')).toBe('archived');
    });

    it('defaults unknown or undefined to active', () => {
        expect(normalizeProjectStatus(undefined)).toBe('active');
        expect(normalizeProjectStatus('something-random')).toBe('active');
    });
});

describe('normalizeProjectPriority', () => {
    it('normalizes priority variants', () => {
        expect(normalizeProjectPriority('urgent')).toBe('urgent');
        expect(normalizeProjectPriority('high')).toBe('high');
        expect(normalizeProjectPriority('medium')).toBe('medium');
        expect(normalizeProjectPriority('normal')).toBe('medium');
        expect(normalizeProjectPriority('low')).toBe('low');
    });

    it('returns none for missing or unknown priority', () => {
        expect(normalizeProjectPriority(undefined)).toBe('none');
        expect(normalizeProjectPriority('xyz')).toBe('none');
    });
});

describe('computeProjectStats', () => {
    it('computes 0% when no tasks exist', () => {
        const stats = computeProjectStats([], undefined);
        expect(stats.totalTasks).toBe(0);
        expect(stats.completedTasks).toBe(0);
        expect(stats.progressPercent).toBe(0);
        expect(stats.isOverdue).toBe(false);
    });

    it('computes completion percentage correctly', () => {
        const tasks: Task[] = [
            makeTask({
                id: '1',
                title: 'Task 1',
                status: 'done',
                filePath: '20 Projects/P1.md',
            }),
            makeTask({
                id: '2',
                title: 'Task 2',
                status: 'todo',
                filePath: '20 Projects/P1.md',
            }),
        ];

        const stats = computeProjectStats(tasks, undefined);
        expect(stats.totalTasks).toBe(2);
        expect(stats.completedTasks).toBe(1);
        expect(stats.progressPercent).toBe(50);
    });

    it('computes countdown and overdue status', () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const statsYesterday = computeProjectStats([], yesterday);
        expect(statsYesterday.isOverdue).toBe(true);
        expect(statsYesterday.daysRemaining).toBeLessThan(0);

        const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
        const statsTomorrow = computeProjectStats([], tomorrow);
        expect(statsTomorrow.isOverdue).toBe(false);
        expect(statsTomorrow.daysRemaining).toBeGreaterThanOrEqual(1);
    });
});

describe('ProjectParser', () => {
    it('parses project file content and frontmatter', () => {
        const content = `---
title: Project Zenith Demo
status: in-progress
priority: high
due: 2026-12-31
tags:
  - zenith
  - dev
---
# Overview
This is a test project.
`;
        const project = ProjectParser.parse('20 Projects/Project Zenith Demo.md', content, 12345);
        expect(project.id).toBe('20 Projects/Project Zenith Demo.md');
        expect(project.title).toBe('Project Zenith Demo');
        expect(project.status).toBe('in-progress');
        expect(project.priority).toBe('high');
        // Read from `due`, which is one of four spellings older notes use, and
        // surfaced under the one name the object now carries.
        expect(project.targetDate).toBe('2026-12-31');
        expect(project.tags).toEqual(['zenith', 'dev']);
    });

    it('falls back to basename when title is absent in frontmatter', () => {
        const content = `---
status: active
---
Content here.
`;
        const project = ProjectParser.parse('20 Projects/Alpha.md', content, 12345);
        expect(project.title).toBe('Alpha');
    });
});

describe('filterTasksForProject', () => {
    const project: Project = {
        id: '20 Projects/Apollo.md',
        filePath: '20 Projects/Apollo.md',
        fileName: 'Apollo.md',
        title: 'Project Apollo',
        status: 'active',
        priority: 'none',
        tags: ['apollo'],
        taskTags: [],
        tasks: [],
        mtime: 100,
        stats: {
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            progressPercent: 0,
            isOverdue: false,
        },
    };

    it('includes tasks directly in the project note', () => {
        const tasks: Task[] = [
            makeTask({
                id: '1',
                title: 'Direct task',
                status: 'todo',
                filePath: '20 Projects/Apollo.md',
            }),
            makeTask({
                id: '2',
                title: 'Unrelated task',
                status: 'todo',
                filePath: '10 Inbox/Quick.md',
            }),
        ];

        const matched = filterTasksForProject(project, tasks);
        expect(matched.map((t) => t.id)).toEqual(['1']);
    });

    it('includes external tasks referencing project title via wikilink', () => {
        const tasks: Task[] = [
            makeTask({
                id: 'ext-1',
                title: 'Deploy server [[Project Apollo]] today',
                status: 'todo',
                filePath: '15 Journal/Daily.md',
            }),
        ];

        const matched = filterTasksForProject(project, tasks);
        expect(matched.length).toBe(1);
        expect(matched[0].id).toBe('ext-1');
    });

    /**
     * The rule this replaced counted any tag the project and the task had in
     * common, with `project`/`projects`/`todo`/`task` blacklisted in the
     * parser to stop `#project` from swallowing the vault. A blacklist of a
     * rule's own worst cases is the rule admitting it guesses — and it guessed
     * both ways, correctly filing a task tagged `#logistics` under a house
     * move and just as confidently filing one tagged `#sport` under a marathon
     * that had already finished.
     *
     * So what a project is filed under and what its tasks are tagged with are
     * two separate fields now, and only the second one claims anything.
     */
    it('ignores a tag the project is merely filed under', () => {
        const tasks: Task[] = [
            makeTask({
                id: 'tag-1',
                title: 'Fix critical bug',
                status: 'todo',
                tags: ['apollo'],
                filePath: '10 Inbox/Notes.md',
            }),
        ];

        expect(filterTasksForProject(project, tasks)).toEqual([]);
    });

    it('claims a task carrying a tag the project asked for', () => {
        const claiming: Project = { ...project, taskTags: ['apollo'] };
        const tasks: Task[] = [
            makeTask({
                id: 'tag-1',
                title: 'Fix critical bug',
                status: 'todo',
                tags: ['apollo'],
                filePath: '10 Inbox/Notes.md',
            }),
            makeTask({
                id: 'tag-2',
                title: 'Unrelated',
                status: 'todo',
                tags: ['garden'],
                filePath: '10 Inbox/Notes.md',
            }),
        ];

        expect(filterTasksForProject(claiming, tasks).map((t) => t.id)).toEqual(['tag-1']);
    });

    /** The hash is how a tag is written in a note and not part of its name. */
    it('matches claimed tags whether or not either side wrote the hash', () => {
        const claiming: Project = { ...project, taskTags: ['#Apollo'] };
        const tasks: Task[] = [
            makeTask({
                id: 'tag-1',
                title: 'Fix critical bug',
                status: 'todo',
                tags: ['#apollo'],
                filePath: '10 Inbox/Notes.md',
            }),
        ];

        expect(filterTasksForProject(claiming, tasks).map((t) => t.id)).toEqual(['tag-1']);
    });
});
