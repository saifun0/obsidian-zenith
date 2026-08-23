import { describe, it, expect } from 'vitest';
import {
    buildTaskLine,
    buildTaskBody,
    parseTaskText,
    parseInlineTags,
    nextRecurrenceDate,
    shiftIsoDate,
    daysBetweenIso,
    type TaskInput,
} from '../src/modules/tasks/services/taskFormat';

const NO_DEFAULTS = { priority: 'none' as const, dueDate: undefined, tags: [] };

describe('parseInlineTags', () => {
    it('extracts hashtags without the leading #', () => {
        expect(parseInlineTags('do thing #work #urgent-1')).toEqual(['work', 'urgent-1']);
    });
    it('returns [] when there are none', () => {
        expect(parseInlineTags('plain text')).toEqual([]);
    });
});

describe('buildTaskBody', () => {
    it('omits the priority emoji for medium', () => {
        expect(buildTaskBody({ title: 'Task', priority: 'medium', tags: [] })).toBe('Task');
    });
    it('includes priority emoji, due date and tags', () => {
        const body = buildTaskBody({
            title: 'Ship it',
            priority: 'urgent',
            dueDate: '2025-01-15',
            tags: ['work', 'q1'],
        });
        expect(body).toBe('Ship it ⏫ 📅 2025-01-15 #work #q1');
    });
    it('strips a leading # from tags', () => {
        const body = buildTaskBody({ title: 'X', priority: 'low', tags: ['#a', 'b'] });
        expect(body).toBe('X 🔽 #a #b');
    });
});

describe('parseTaskText', () => {
    it('reads inline priority, date and tags', () => {
        const parsed = parseTaskText('Ship it ⏫ 📅 2025-01-15 #work', NO_DEFAULTS);
        expect(parsed).toEqual({
            title: 'Ship it',
            priority: 'urgent',
            dueDate: '2025-01-15',
            tags: ['work'],
        });
    });

    it('falls back to file defaults when no inline markers', () => {
        const parsed = parseTaskText('Just a task', {
            priority: 'high',
            dueDate: '2025-02-01',
            tags: ['inherited'],
        });
        expect(parsed.priority).toBe('high');
        expect(parsed.dueDate).toBe('2025-02-01');
        expect(parsed.tags).toEqual(['inherited']);
    });

    it('merges default and inline tags without duplicates', () => {
        const parsed = parseTaskText('Task #work #new', {
            priority: 'medium',
            tags: ['work', 'base'],
        });
        expect(parsed.tags).toEqual(['work', 'base', 'new']);
    });

    it('inline priority overrides the default', () => {
        const parsed = parseTaskText('Task 🔽', { priority: 'urgent', tags: [] });
        expect(parsed.priority).toBe('low');
    });
});

describe('round-trip: buildTaskLine → parseTaskText', () => {
    const cases: TaskInput[] = [
        { title: 'Simple task', priority: 'medium', tags: [] },
        { title: 'Urgent thing', priority: 'urgent', dueDate: '2025-01-15', tags: ['work'] },
        { title: 'Low prio', priority: 'low', tags: ['a', 'b', 'c'] },
        { title: 'High no tags', priority: 'high', dueDate: '2026-12-31', tags: [] },
    ];

    for (const input of cases) {
        it(`round-trips "${input.title}"`, () => {
            const line = buildTaskLine(input);
            // Strip the "- [ ] " prefix to get the body the parser consumes.
            const body = line.replace(/^- \[ \] /, '');
            const parsed = parseTaskText(body, { priority: 'medium', tags: [] });

            expect(parsed.title).toBe(input.title);
            expect(parsed.priority).toBe(input.priority);
            expect(parsed.dueDate).toBe(input.dueDate);
            expect(parsed.tags).toEqual(input.tags);
        });
    }
});

describe('statuses & extended markers', () => {
    it('buildTaskLine writes the status char', () => {
        expect(buildTaskLine({ title: 'A', priority: 'none', tags: [] })).toBe('- [ ] A');
        expect(buildTaskLine({ title: 'A', priority: 'none', tags: [], status: 'in-progress' })).toBe('- [/] A');
        expect(buildTaskLine({ title: 'A', priority: 'none', tags: [], status: 'done' })).toBe('- [x] A');
        expect(buildTaskLine({ title: 'A', priority: 'none', tags: [], status: 'cancelled' })).toBe('- [-] A');
    });

    it('builds and parses all date markers + recurrence', () => {
        const input: TaskInput = {
            title: 'Ship',
            priority: 'high',
            tags: ['work'],
            recurrence: 'every week',
            startDate: '2025-01-01',
            scheduledDate: '2025-01-05',
            dueDate: '2025-01-10',
        };
        const body = buildTaskBody(input);
        const parsed = parseTaskText(body, NO_DEFAULTS);
        expect(parsed.title).toBe('Ship');
        expect(parsed.priority).toBe('high');
        expect(parsed.recurrence).toBe('every week');
        expect(parsed.startDate).toBe('2025-01-01');
        expect(parsed.scheduledDate).toBe('2025-01-05');
        expect(parsed.dueDate).toBe('2025-01-10');
        expect(parsed.tags).toEqual(['work']);
    });

    it('parses a done date', () => {
        const parsed = parseTaskText('Done thing ✅ 2025-03-01', NO_DEFAULTS);
        expect(parsed.title).toBe('Done thing');
        expect(parsed.doneDate).toBe('2025-03-01');
    });

    it('parses a cancelled date, and keeps it out of the title', () => {
        // `❌` is to giving up what `✅` is to finishing — the same convention
        // other Tasks-format readers use, so the line still means one thing.
        const parsed = parseTaskText('Dropped thing ❌ 2025-03-02 #work', NO_DEFAULTS);
        expect(parsed.title).toBe('Dropped thing');
        expect(parsed.cancelledDate).toBe('2025-03-02');
        expect(parsed.doneDate).toBeUndefined();
        expect(parsed.tags).toEqual(['work']);
    });

    it('round-trips a cancelled date through the body builder', () => {
        const body = buildTaskBody({
            title: 'Dropped thing',
            priority: 'high',
            tags: ['work'],
            dueDate: '2025-03-01',
            cancelledDate: '2025-03-02',
        });
        const parsed = parseTaskText(body, NO_DEFAULTS);
        expect(parsed.title).toBe('Dropped thing');
        expect(parsed.cancelledDate).toBe('2025-03-02');
        expect(parsed.dueDate).toBe('2025-03-01');
        expect(parsed.priority).toBe('high');
    });

    it('reads a recurrence rule that is followed by a cancelled date', () => {
        // The rule runs to the next marker, so ❌ has to end it as ✅ does —
        // otherwise the date is swallowed into the recurrence text.
        const parsed = parseTaskText('Weekly thing 🔁 every week ❌ 2025-03-02', NO_DEFAULTS);
        expect(parsed.recurrence?.trim()).toBe('every week');
        expect(parsed.cancelledDate).toBe('2025-03-02');
        expect(parsed.title).toBe('Weekly thing');
    });

    it('supports nested tags', () => {
        expect(parseInlineTags('do it #tasks/obsidian')).toEqual(['tasks/obsidian']);
    });
});

describe('⏰ time of day', () => {
    it('parses a bare start time', () => {
        const parsed = parseTaskText('Call the dentist 📅 2026-08-12 ⏰ 15:45', NO_DEFAULTS);
        expect(parsed.title).toBe('Call the dentist');
        expect(parsed.dueTime).toBe('15:45');
        expect(parsed.dueEndTime).toBeUndefined();
    });

    it('parses a range and keeps it out of the title', () => {
        const parsed = parseTaskText('Databases class 📅 2026-08-11 ⏰ 09:00-10:30 #uni', NO_DEFAULTS);
        expect(parsed.title).toBe('Databases class');
        expect(parsed.dueTime).toBe('09:00');
        expect(parsed.dueEndTime).toBe('10:30');
        expect(parsed.tags).toEqual(['uni']);
    });

    it('accepts an en dash and spaces around it', () => {
        // An editor's autocorrect turns `-` into `–` behind your back.
        const parsed = parseTaskText('Gym ⏰ 19:00 – 20:30', NO_DEFAULTS);
        expect(parsed.dueTime).toBe('19:00');
        expect(parsed.dueEndTime).toBe('20:30');
    });

    it('pads a single-digit hour on both ends', () => {
        const parsed = parseTaskText('Standup ⏰ 9:05-9:20', NO_DEFAULTS);
        expect(parsed.dueTime).toBe('09:05');
        expect(parsed.dueEndTime).toBe('09:20');
    });

    it('drops an end that is not after the start', () => {
        expect(parseTaskText('Thing ⏰ 15:45-15:45', NO_DEFAULTS).dueEndTime).toBeUndefined();
        expect(parseTaskText('Thing ⏰ 15:45-09:00', NO_DEFAULTS).dueEndTime).toBeUndefined();
        // …and the start survives it, so the task still lands on the grid.
        expect(parseTaskText('Thing ⏰ 15:45-09:00', NO_DEFAULTS).dueTime).toBe('15:45');
    });

    it('round-trips a range through the body builder', () => {
        const body = buildTaskBody({
            title: 'Databases class',
            priority: 'none',
            tags: [],
            dueDate: '2026-08-11',
            dueTime: '09:00',
            dueEndTime: '10:30',
        });
        expect(body).toBe('Databases class 📅 2026-08-11 ⏰ 09:00-10:30');
        expect(parseTaskText(body, NO_DEFAULTS).dueEndTime).toBe('10:30');
    });

    it('refuses to write a backwards range even when handed one', () => {
        // The last line of defence: every write goes through here, so a form
        // that moved the start past the end can't produce `⏰ 11:00-10:30`.
        const body = buildTaskBody({
            title: 'Thing',
            priority: 'none',
            tags: [],
            dueTime: '11:00',
            dueEndTime: '10:30',
        });
        expect(body).toBe('Thing ⏰ 11:00');
    });

    it('normalizes what it writes', () => {
        const body = buildTaskBody({
            title: 'Thing',
            priority: 'none',
            tags: [],
            dueTime: '9:00',
            dueEndTime: '10:30',
        });
        expect(body).toBe('Thing ⏰ 09:00-10:30');
    });

    it('keeps the time alongside the other markers', () => {
        const body = buildTaskBody({
            title: 'Ship',
            priority: 'high',
            tags: ['work'],
            startDate: '2026-08-11',
            dueDate: '2026-08-12',
            dueTime: '15:45',
            timerMinutes: 45,
        });
        const parsed = parseTaskText(body, NO_DEFAULTS);
        expect(parsed.title).toBe('Ship');
        expect(parsed.dueTime).toBe('15:45');
        expect(parsed.startDate).toBe('2026-08-11');
        expect(parsed.dueDate).toBe('2026-08-12');
        expect(parsed.timerMinutes).toBe(45);
    });
});

describe('nextRecurrenceDate', () => {
    it('advances by common rules', () => {
        expect(nextRecurrenceDate('daily', '2025-01-01')).toBe('2025-01-02');
        expect(nextRecurrenceDate('every week', '2025-01-01')).toBe('2025-01-08');
        expect(nextRecurrenceDate('every 3 days', '2025-01-01')).toBe('2025-01-04');
        expect(nextRecurrenceDate('monthly', '2025-01-15')).toBe('2025-02-15');
    });
    it('returns null for unknown rules', () => {
        expect(nextRecurrenceDate('whenever', '2025-01-01')).toBeNull();
    });
});

describe('date shifting', () => {
    it('shiftIsoDate adds days across month boundaries', () => {
        expect(shiftIsoDate('2025-01-30', 3)).toBe('2025-02-02');
        expect(shiftIsoDate('2025-03-01', -1)).toBe('2025-02-28');
    });
    it('daysBetweenIso', () => {
        expect(daysBetweenIso('2025-01-01', '2025-01-08')).toBe(7);
        expect(daysBetweenIso('2025-01-10', '2025-01-01')).toBe(-9);
    });
});
