import { describe, it, expect, beforeAll } from 'vitest';
import { projectFileName } from '../src/modules/projects/services/projectWriter';
import { startLabel } from '../src/modules/projects/services/projectStats';
import { sortProjects } from '../src/modules/projects/components/ProjectsApp';
import {
    registerTranslations,
    translate,
    translatePlural,
    type Locale,
    type Translator,
} from '../src/core/i18n';
import { projectsTranslations } from '../src/modules/projects/i18n';
import type { Project } from '../src/modules/projects/projectsTypes';

/**
 * The three pure pieces the project form and card rest on.
 *
 * Each one exists because the old behaviour was wrong in a way nobody could
 * see: a title became a file name by not being checked at all, a start date
 * was parsed and never drawn, and the grid sorted alphabetically beside a
 * widget that sorted by deadline.
 */

beforeAll(() => registerTranslations('projects', projectsTranslations));

/** A real translator, so these cases also check the keys exist in both dictionaries. */
function makeT(locale: Locale): Translator {
    const t = ((key: string, params?: Record<string, string | number>) =>
        translate(locale, key, params)) as Translator;
    t.plural = (key, count, params) => translatePlural(locale, key, count, params);
    t.has = () => true;
    t.locale = locale;
    return t;
}

const TODAY = Date.parse('2026-09-20T09:00:00');

function project(over: Partial<Project> = {}): Project {
    return {
        id: 'p.md',
        filePath: '20 Projects/p.md',
        fileName: 'p.md',
        title: 'P',
        status: 'active',
        priority: 'medium',
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
    };
}

describe('a title becomes a file name', () => {
    /**
     * Replaced, not rejected. "Q3: launch" is a reasonable thing to call a
     * project, and refusing to create it over a colon would be the plugin
     * defending the file system.
     */
    it('swaps what a file name cannot hold for a dash', () => {
        expect(projectFileName('Q3: launch', 'Project')).toBe('Q3- launch');
        expect(projectFileName(String.raw`a/b\c`, 'Project')).toBe('a-b-c');
        expect(projectFileName('why?*"<>|', 'Project')).toBe('why------');
    });

    /** Obsidian reads these two as link and tag syntax inside a file name. */
    it('swaps the characters Obsidian reads as markup', () => {
        expect(projectFileName('[[wiki]] #tag ^ref', 'Project')).toBe('--wiki-- -tag -ref');
    });

    /** A name starting with a dot is hidden on Unix and invisible in the tree. */
    it('refuses to make a hidden file', () => {
        expect(projectFileName('.secret', 'Project')).toBe('secret');
        expect(projectFileName('  spaced  ', 'Project')).toBe('spaced');
    });

    /**
     * Nothing left to name it after is still a file that has to be called
     * something. The fallback is handed in rather than translated inside,
     * because reaching for the dictionary means reaching for the browser to
     * ask which language it is — which is not a thing a sanitiser should need.
     */
    it('falls back rather than creating ".md"', () => {
        expect(projectFileName('   ', 'Project')).toBe('Project');
        expect(projectFileName('///', 'Project')).toBe('---');
    });
});

describe('a start date, on the days it means something', () => {
    const en = makeT('en');

    /** Most projects are already running, and "started in March" answers nothing. */
    it('says nothing about a project already under way', () => {
        expect(startLabel(project({ startDate: '2026-09-01' }), en, TODAY)).toBeNull();
        expect(startLabel(project({ startDate: '2026-09-20' }), en, TODAY)).toBe('starts today');
    });

    it('counts down to one that has not begun', () => {
        expect(startLabel(project({ startDate: '2026-09-27' }), en, TODAY)).toBe('starts in 7 d');
    });

    /** A countdown on something nobody is doing is a countdown to nothing. */
    it('says nothing for a finished or shelved project', () => {
        const ahead = { startDate: '2026-09-27' } as const;
        expect(startLabel(project({ ...ahead, status: 'completed' }), en, TODAY)).toBeNull();
        expect(startLabel(project({ ...ahead, status: 'archived' }), en, TODAY)).toBeNull();
    });

    it('says nothing when the note gave no start date', () => {
        expect(startLabel(project(), en, TODAY)).toBeNull();
    });
});

describe('the grid sorts the way the widget already did', () => {
    const withDays = (title: string, daysRemaining?: number): Project =>
        project({
            id: title,
            title,
            stats: { ...project().stats, daysRemaining },
        });

    /**
     * Two orders for one set of data in one plugin is not a preference. The
     * view rendered projects in the folder's alphabetical order while the
     * dashboard widget six inches away put the nearest deadline first.
     */
    it('puts the nearest deadline first', () => {
        const out = sortProjects([withDays('late', 30), withDays('soon', 2), withDays('now', 0)]);
        expect(out.map((p) => p.title)).toEqual(['now', 'soon', 'late']);
    });

    /** A project with no date is not urgent — it is undated. */
    it('sends the undated to the end, in alphabetical order', () => {
        const out = sortProjects([withDays('zebra'), withDays('dated', 5), withDays('apple')]);
        expect(out.map((p) => p.title)).toEqual(['dated', 'apple', 'zebra']);
    });

    /** An overdue project is further along the same line, not a separate case. */
    it('keeps overdue projects above the merely due', () => {
        const out = sortProjects([withDays('due', 3), withDays('overdue', -9)]);
        expect(out.map((p) => p.title)).toEqual(['overdue', 'due']);
    });

    it('leaves the array it was handed alone', () => {
        const input = [withDays('b', 9), withDays('a', 1)];
        sortProjects(input);
        expect(input.map((p) => p.title)).toEqual(['b', 'a']);
    });
});
