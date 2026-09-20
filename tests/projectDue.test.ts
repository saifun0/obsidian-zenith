import { describe, it, expect } from 'vitest';
import { computeProjectStats, dueLabel } from '../src/modules/projects/services/projectStats';
import {
    registerTranslations,
    translate,
    translatePlural,
    type Locale,
    type Translator,
} from '../src/core/i18n';
import { projectsTranslations } from '../src/modules/projects/i18n';
import type { Project, ProjectStatus } from '../src/modules/projects/projectsTypes';
import type { Task } from '../src/store/taskSlice';
import type { TaskStatus } from '../src/core/constants';

// The module's strings are registered at load time in the plugin; here they
// have to be put in by hand, which is also what makes these assertions a check
// that the keys exist in both dictionaries rather than only in one.
registerTranslations('projects', projectsTranslations);

/**
 * A real translator rather than a stub, so these cases double as a check that
 * the `projects.stats.*` keys exist in both dictionaries — a missing key
 * resolves to the key itself, which every assertion below catches.
 */
function makeT(locale: Locale): Translator {
    const t = ((key: string, params?: Record<string, string | number>) =>
        translate(locale, key, params)) as Translator;
    t.plural = (key, count, params) => translatePlural(locale, key, count, params);
    t.has = () => true;
    t.locale = locale;
    return t;
}

const ru = makeT('ru');
const en = makeT('en');

const TODAY = Date.parse('2026-09-19T12:00:00Z');

let seq = 0;
const task = (status: TaskStatus): Task =>
    ({
        id: `t${seq++}`,
        title: 'x',
        status,
        tags: [],
        subtasks: [],
        lineNumber: 1,
        filePath: 'a.md',
    }) as unknown as Task;

function project(status: ProjectStatus, due: string, tasks: Task[]): Project {
    return {
        id: due + status,
        filePath: 'p.md',
        fileName: 'p.md',
        title: 'P',
        status,
        priority: 'medium',
        targetDate: due,
        tags: [],
        taskTags: [],
        tasks,
        stats: computeProjectStats(tasks, due, TODAY),
    } as Project;
}

describe('a deadline in words', () => {
    it('counts the days left on something still running', () => {
        const p = project('active', '2026-10-02', [task('todo'), task('done')]);
        expect(dueLabel(p, ru)?.text).toBe('осталось 13 д');
        expect(dueLabel(p, en)?.text).toBe('13 d left');
    });

    it('says today rather than "0 days left"', () => {
        const p = project('active', '2026-09-19', [task('todo')]);
        expect(dueLabel(p, ru)?.text).toBe('сегодня');
        expect(dueLabel(p, ru)?.tone).toBe('is-today');
    });

    // "7 просрочено" was a number with the word "overdue" after it, which is a
    // sentence in neither language.
    it('says how far past the date it is, as a phrase', () => {
        const p = project('active', '2026-09-12', [task('todo')]);
        const out = dueLabel(p, ru);
        expect(out?.text).toBe('просрочено на 7 д');
        expect(out?.tone).toBe('is-overdue');
        expect(dueLabel(p, en)?.text).toBe('overdue by 7 d');
    });

    /**
     * The bug on the card: a finished project whose date has passed reported
     * "−13 days left" — a negative number of days remaining on something that
     * does not remain. Nothing remains, so nothing is said.
     */
    it('says nothing about a project that has already landed', () => {
        const done = project('completed', '2026-09-06', [task('done'), task('done')]);
        expect(done.stats.progressPercent).toBe(100);
        expect(done.stats.daysRemaining).toBeLessThan(0);
        expect(dueLabel(done, ru)).toBeNull();

        const shelved = project('archived', '2026-09-06', [task('todo')]);
        expect(dueLabel(shelved, ru)).toBeNull();
    });

    it('says nothing about a project with no date at all', () => {
        const p = project('active', '', []);
        expect(dueLabel(p, ru)).toBeNull();
    });
});
