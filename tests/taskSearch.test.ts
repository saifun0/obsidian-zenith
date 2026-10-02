import { describe, it, expect } from 'vitest';
import { parseSearch, searchWords, isFiltering } from '../src/modules/tasks/services/taskSearch';
import { queryTasks } from '../src/modules/tasks/services/taskFilter';
import type { Task } from '../src/store/taskSlice';

describe('the search field, read as a query', () => {
    it('keeps plain words as text', () => {
        expect(parseSearch('release notes')).toEqual({ text: 'release notes', tags: [] });
    });

    it('takes #tags out of the text, every one of them required', () => {
        const q = parseSearch('#Work draft #daily');
        expect(q.tags).toEqual(['work', 'daily']);
        expect(q.text).toBe('draft');
    });

    it('reads a named priority in any of the languages, and bangs as a floor', () => {
        expect(parseSearch('!high').priority).toBe('high');
        expect(parseSearch('!Высокий').priority).toBe('high');
        expect(parseSearch('!紧急').priority).toBe('urgent');
        expect(parseSearch('!!').minPriority).toBe('high');
        expect(parseSearch('!').minPriority).toBe('medium');
        expect(parseSearch('!nonsense').text).toBe('!nonsense');
    });

    it('reads a deadline word or phrase, whatever language the interface is in', () => {
        expect(parseSearch('просрочено #work')).toMatchObject({
            due: 'overdue',
            tags: ['work'],
            text: '',
        });
        expect(parseSearch('без даты книга')).toMatchObject({ due: 'none', text: 'книга' });
        expect(parseSearch('no date').due).toBe('none');
        expect(parseSearch('today').due).toBe('today');
    });

    it('does not take a keyword out of the middle of a word', () => {
        expect(parseSearch('todays').due).toBeUndefined();
        expect(parseSearch('weekly review').text).toBe('weekly review');
    });

    it('knows every keyword in every language', () => {
        const words = searchWords();
        expect(words.due.map((d) => d.phrase)).toEqual(
            expect.arrayContaining(['без даты', 'no date', '无日期'])
        );
    });

    it('says whether it narrows anything', () => {
        expect(isFiltering(parseSearch('  '))).toBe(false);
        expect(isFiltering(parseSearch('#a'))).toBe(true);
    });
});

describe('a parsed query applied', () => {
    const t = (id: string, over: Partial<Task>): Task =>
        ({
            id,
            title: id,
            status: 'todo',
            completed: false,
            priority: 'none',
            tags: [],
            subtasks: [],
            filePath: 'f.md',
            lineNumber: Number(id),
            createdAt: '2026-01-01T00:00:00.000Z',
            ...over,
        }) as Task;
    const tasks = [
        t('1', { tags: ['work/zenith', 'daily'], priority: 'high' }),
        t('2', { tags: ['work'], priority: 'medium' }),
        t('3', { tags: ['home'], priority: 'urgent' }),
    ];
    const run = (text: string) => {
        const q = parseSearch(text);
        return queryTasks(tasks, {
            tab: 'all',
            priority: q.priority ?? 'all',
            minPriority: q.minPriority,
            tag: '',
            tags: q.tags,
            search: q.text,
            sort: 'manual',
            due: q.due,
            today: '2026-01-10',
        }).map((x) => x.id);
    };

    it('matches nested tags and needs all of them', () => {
        expect(run('#work')).toEqual(['1', '2']);
        expect(run('#work #daily')).toEqual(['1']);
    });

    it('applies a priority floor', () => {
        expect(run('!!')).toEqual(['1', '3']);
        expect(run('!high')).toEqual(['1']);
    });
});
