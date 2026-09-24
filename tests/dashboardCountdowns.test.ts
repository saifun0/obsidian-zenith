import { describe, it, expect } from 'vitest';
import {
    daysUntil,
    hijriCountdowns,
    nextYearly,
    ownCountdowns,
    projectCountdowns,
    taskCountdowns,
    upcoming,
} from '../src/modules/dashboard/services/countdowns';
import { hijriMonthBounds, periodRows } from '../src/modules/dashboard/services/periods';
import { lifeWeeks } from '../src/modules/dashboard/services/lifeWeeks';
import type { Task } from '../src/store/taskSlice';
import type { Project } from '../src/modules/projects/projectsTypes';

const TODAY = '2026-09-24'; // a Thursday

describe('periodRows', () => {
    it('measures the day in hours and the rest in days', () => {
        const rows = periodRows(TODAY, 10 * 60, 'mon');
        expect(rows.map((r) => r.id)).toEqual(['day', 'week', 'month', 'year']);
        const [day, week, month, year] = rows;
        expect(day.left).toBe(14);
        expect(day.fraction).toBeCloseTo(10 / 24);
        // Thursday of a week from Monday: four days begun, three to come.
        expect(week).toMatchObject({ fraction: 4 / 7, left: 3 });
        expect(month).toMatchObject({ fraction: 24 / 30, left: 6 });
        expect(year.left).toBe(98);
    });

    it('follows the week’s first day', () => {
        const week = periodRows(TODAY, 0, 'sun')[1];
        expect(week).toMatchObject({ fraction: 5 / 7, left: 2 });
    });

    it('adds the Hijri month when asked', () => {
        const rows = periodRows(TODAY, 0, 'mon', { offset: 0 });
        expect(rows[4]).toMatchObject({ id: 'hijriMonth', hijriMonth: 4 });
    });

    it('finds Ramadan’s edges as the calendar has them', () => {
        expect(hijriMonthBounds('2026-02-20')).toEqual({
            start: '2026-02-18',
            end: '2026-03-19',
            month: 9,
        });
    });
});

describe('hijriCountdowns', () => {
    it('finds the next Ramadan and both Eids', () => {
        const dates = Object.fromEntries(hijriCountdowns(TODAY).map((c) => [c.hijri, c.date]));
        expect(dates).toEqual({
            ramadan: '2027-02-08',
            eidFitr: '2027-03-09',
            arafah: '2027-05-15',
            eidAdha: '2027-05-16',
        });
    });

    it('in Ramadan, counts to Eid first and to next Ramadan last', () => {
        const events = hijriCountdowns('2026-03-01').map((c) => c.hijri);
        expect(events).toEqual(['eidFitr', 'arafah', 'eidAdha', 'ramadan']);
    });

    it('includes the day itself', () => {
        expect(hijriCountdowns('2026-03-20')[0]).toMatchObject({
            hijri: 'eidFitr',
            date: '2026-03-20',
        });
    });
});

describe('own events', () => {
    it('brings a yearly date round to its next occurrence', () => {
        expect(nextYearly('1990-10-02', TODAY)).toBe('2026-10-02');
        expect(nextYearly('1990-03-02', TODAY)).toBe('2027-03-02');
        expect(nextYearly('2000-09-24', TODAY)).toBe('2026-09-24');
        // A leap-day birthday, in a year without one.
        expect(nextYearly('2004-02-29', TODAY)).toBe('2027-02-28');
    });

    it('drops what has passed, is blank or is not a date', () => {
        const events = ownCountdowns(
            [
                { title: 'Trip', date: '2026-10-10' },
                { title: 'Past', date: '2026-01-01' },
                { title: '  ', date: '2026-11-01' },
                { title: 'Typo', date: '2026-13-45x' },
                { title: 'Birthday', date: '1990-12-01', yearly: true },
            ],
            TODAY
        );
        expect(events.map((e) => [e.title, e.date])).toEqual([
            ['Trip', '2026-10-10'],
            ['Birthday', '2026-12-01'],
        ]);
    });
});

describe('tasks and projects', () => {
    const task = (over: Partial<Task>): Task =>
        ({
            id: over.title,
            status: 'todo',
            completed: false,
            priority: 'none',
            tags: ['countdown'],
            subtasks: [],
            filePath: 'Tasks.md',
            lineNumber: 1,
            createdAt: '',
            ...over,
        }) as Task;

    it('counts only open, tagged tasks still ahead', () => {
        const tasks = [
            task({ title: 'Exam', dueDate: '2026-10-05' }),
            task({ title: 'Untagged', dueDate: '2026-10-05', tags: [] }),
            task({ title: 'Done', dueDate: '2026-10-05', status: 'done' }),
            task({ title: 'Late', dueDate: '2026-09-01' }),
            task({ title: 'Undated' }),
            task({ title: 'Other case', dueDate: '2026-10-06', tags: ['#Countdown'] }),
        ];
        expect(taskCountdowns(tasks, '#countdown', TODAY).map((c) => c.title)).toEqual([
            'Exam',
            'Other case',
        ]);
        expect(taskCountdowns(tasks, '', TODAY)).toEqual([]);
    });

    it('counts projects under way with a target ahead', () => {
        const project = (over: Partial<Project>) =>
            ({
                id: over.title,
                filePath: `${over.title}.md`,
                status: 'active',
                ...over,
            }) as Project;
        const projects = [
            project({ title: 'Launch', targetDate: '2026-12-01' }),
            project({ title: 'Shipped', targetDate: '2026-12-01', status: 'completed' }),
            project({ title: 'Someday' }),
        ];
        expect(projectCountdowns(projects, TODAY).map((c) => c.title)).toEqual(['Launch']);
    });
});

describe('upcoming', () => {
    it('puts the soonest first, and the user’s own first on a shared day', () => {
        const list = upcoming(
            [
                [{ key: 'a', title: 'task', date: '2026-10-01', source: 'task' }],
                [{ key: 'b', title: 'mine', date: '2026-10-01', source: 'own' }],
                [{ key: 'c', title: 'soon', date: '2026-09-25', source: 'project' }],
            ],
            2
        );
        expect(list.map((c) => c.title)).toEqual(['soon', 'mine']);
    });

    it('counts days from today', () => {
        expect(daysUntil('2026-09-24', TODAY)).toBe(0);
        expect(daysUntil('2027-02-08', TODAY)).toBe(137);
    });
});

describe('lifeWeeks', () => {
    it('counts from the last birthday', () => {
        // Six days before the 36th birthday: the last week of year 35.
        expect(lifeWeeks('1990-09-30', 80, TODAY)).toMatchObject({
            age: 35,
            week: 51,
            lived: 35 * 52 + 52,
            total: 4160,
        });
        // On the birthday itself: the first week of a new year.
        expect(lifeWeeks('1990-09-24', 80, TODAY)).toMatchObject({ age: 36, week: 0 });
    });

    it('has nothing to say without a usable birth date', () => {
        expect(lifeWeeks('', 80, TODAY)).toBeNull();
        expect(lifeWeeks('30.09.1990', 80, TODAY)).toBeNull();
        expect(lifeWeeks('2030-01-01', 80, TODAY)).toBeNull();
    });

    it('never counts past the end of the grid', () => {
        expect(lifeWeeks('1900-01-01', 80, TODAY)?.lived).toBe(4160);
    });
});
