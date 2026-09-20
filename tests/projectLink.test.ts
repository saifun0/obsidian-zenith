import { describe, it, expect } from 'vitest';
import {
    linkNamesProject,
    splitProjectLink,
    withProjectLink,
} from '../src/modules/projects/services/projectLink';
import type { Project } from '../src/modules/projects/projectsTypes';
import type { TaskAttachment } from '../src/modules/tasks/services/taskDetails';

/**
 * Choosing a project for a task.
 *
 * The link itself is not new — a note attachment pointing at a project note is
 * one of the three ways a task has always been able to name its project. What
 * was missing was any way to choose one: the attachment field asks for a path
 * and you type it, which is the slowest way to say "Flat Move" and the only
 * one that can be misspelt.
 */

const project = (over: Partial<Project> = {}): Project => ({
    id: '20 Projects/Flat Move.md',
    filePath: '20 Projects/Flat Move.md',
    fileName: 'Flat Move.md',
    title: 'Flat Move',
    status: 'active',
    priority: 'none',
    tags: [],
    taskTags: [],
    tasks: [],
    stats: {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        progressPercent: 0,
        isOverdue: false,
    },
    ...over,
});

const note = (target: string): TaskAttachment => ({ kind: 'note', target });

describe('a link that names a project', () => {
    const p = project();

    /** All three are how somebody writes a link to a note by hand. */
    it('accepts the path, the title and the base name', () => {
        expect(linkNamesProject('20 Projects/Flat Move.md', p)).toBe(true);
        expect(linkNamesProject('20 Projects/Flat Move', p)).toBe(true);
        expect(linkNamesProject('Flat Move', p)).toBe(true);
    });

    /** Obsidian ignores case in a link, so this cannot be stricter than it is. */
    it('ignores case and surrounding space', () => {
        expect(linkNamesProject('  flat move  ', p)).toBe(true);
        expect(linkNamesProject('20 PROJECTS/FLAT MOVE.MD', p)).toBe(true);
    });

    it('refuses anything else', () => {
        expect(linkNamesProject('Flat', p)).toBe(false);
        expect(linkNamesProject('20 Projects/Flat Move Out.md', p)).toBe(false);
        expect(linkNamesProject('', p)).toBe(false);
        expect(linkNamesProject('   ', p)).toBe(false);
    });

    /** A project whose note lives at the vault root still has a base name. */
    it('handles a project outside a folder', () => {
        const root = project({ filePath: 'Flat Move.md', title: 'Flat Move' });
        expect(linkNamesProject('Flat Move', root)).toBe(true);
        expect(linkNamesProject('Flat Move.md', root)).toBe(true);
    });
});

describe('splitting the project out of the attachments', () => {
    const flat = project();
    const arabic = project({
        id: '20 Projects/Learn Arabic.md',
        filePath: '20 Projects/Learn Arabic.md',
        fileName: 'Learn Arabic.md',
        title: 'Learn Arabic',
    });

    it('finds the project and keeps everything else', () => {
        const atts = [
            { kind: 'image', target: 'photo.png' } as TaskAttachment,
            note('Flat Move'),
            note('40 Resources/Checklist.md'),
        ];

        const out = splitProjectLink(atts, [flat, arabic]);
        expect(out.project?.filePath).toBe('20 Projects/Flat Move.md');
        expect(out.rest.map((a) => a.target)).toEqual(['photo.png', '40 Resources/Checklist.md']);
    });

    it('says so when no attachment names a project', () => {
        const out = splitProjectLink([note('40 Resources/Checklist.md')], [flat]);
        expect(out.project).toBeUndefined();
        expect(out.rest).toHaveLength(1);
    });

    /**
     * A link to another TASK is written `→ [[…]]` and parsed as its own kind.
     * Pointing one at a project note means "see that", not "I belong there".
     */
    it('only counts a note link, not a task or an image', () => {
        const atts = [{ kind: 'task', target: 'Flat Move' } as TaskAttachment];
        expect(splitProjectLink(atts, [flat]).project).toBeUndefined();
        expect(splitProjectLink(atts, [flat]).rest).toHaveLength(1);
    });

    /**
     * A task can match several projects — that follows from the matching rules
     * and is not a bug. The picker asks a question with one answer, so the
     * extras stay where they are rather than being dropped by a control that
     * cannot show them.
     */
    it('takes the first project and leaves any others alone', () => {
        const atts = [note('Flat Move'), note('Learn Arabic')];
        const out = splitProjectLink(atts, [flat, arabic]);
        expect(out.project?.title).toBe('Flat Move');
        expect(out.rest.map((a) => a.target)).toEqual(['Learn Arabic']);
    });
});

describe('putting the chosen project back', () => {
    const flat = project();

    it('writes the path rather than the title', () => {
        // A title can be two words another note also uses; the path is what
        // the note actually is.
        expect(withProjectLink([], flat)).toEqual([
            { kind: 'note', target: '20 Projects/Flat Move.md' },
        ]);
    });

    it('drops the link when nothing is chosen', () => {
        expect(withProjectLink([note('Checklist.md')], undefined)).toEqual([note('Checklist.md')]);
    });

    it('leaves the attachments it was handed alone', () => {
        const rest = [note('Checklist.md')];
        withProjectLink(rest, flat);
        expect(rest).toHaveLength(1);
    });

    /** Changing the project rewrites one line and nothing else. */
    it('survives a round trip with an unrelated note attached', () => {
        const before = [note('Flat Move'), note('40 Resources/Checklist.md')];
        const { rest } = splitProjectLink(before, [flat]);
        const after = withProjectLink(rest, flat);

        expect(after.map((a) => a.target)).toEqual([
            '40 Resources/Checklist.md',
            '20 Projects/Flat Move.md',
        ]);
    });
});
