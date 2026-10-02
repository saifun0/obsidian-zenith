// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { TaskWriter } from '../src/modules/tasks/services/taskWriter';
import { marginText, shortDate } from '../src/modules/tasks/services/taskMargin';
import {
    HOLD_MS,
    LEAVE_MS,
    closesTask,
    dropClosing,
    holdClosing,
    isClosingOf,
    useClosingTasks,
} from '../src/modules/tasks/services/closingTasks';
import { claimSwipes, EDGE_PX } from '../src/core/useSwipeActions';
import { translatorFor } from '../src/core/i18n';
import type { Task } from '../src/store/taskSlice';

const TODAY = '2026-10-02'; // a Friday

const task = (over: Partial<Task> = {}): Task =>
    ({
        id: 'Inbox.md:3',
        title: 'Call the bank',
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'Inbox.md',
        lineNumber: 3,
        createdAt: '2026-09-01T00:00:00.000Z',
        ...over,
    }) as Task;

describe('what a row writes in its margin', () => {
    const t = translatorFor('en');
    const at = (over: Partial<Task>, grouped = true) => marginText(task(over), TODAY, t, grouped);

    it('says the hour under "Today", and nothing when there is none', () => {
        expect(at({ dueDate: TODAY, dueTime: '15:00' })).toEqual({ text: '15:00', tone: 'today' });
        expect(at({ dueDate: TODAY })).toEqual({ text: '', tone: 'today' });
    });

    it('says the day in full when no group says it', () => {
        expect(at({ dueDate: TODAY }, false).text).toBe('today');
        expect(at({ dueDate: '2026-10-03', dueTime: '09:30' }, false).text).toBe('tomorrow 09:30');
    });

    it('names the weekday within the week, and the date beyond it', () => {
        expect(at({ dueDate: '2026-10-05' }).text).toBe('Mon');
        // Seven days on is the same weekday as today — a date says which one.
        expect(at({ dueDate: '2026-10-09' }).text).toBe(shortDate('2026-10-09', TODAY, t));
    });

    it('marks what has slipped, yesterday in words', () => {
        expect(at({ dueDate: '2026-10-01' })).toEqual({ text: 'yesterday', tone: 'overdue' });
        expect(at({ dueDate: '2026-09-27' }).tone).toBe('overdue');
    });

    it('gives a finished task the day it was closed', () => {
        expect(at({ status: 'done', doneDate: TODAY })).toEqual({ text: 'today', tone: 'closed' });
        expect(at({ status: 'cancelled', cancelledDate: '2026-10-01' }).text).toBe('yesterday');
    });

    it('adds the year only when it is not this one', () => {
        expect(shortDate('2027-01-12', TODAY, t)).toMatch(/’27$/);
        expect(shortDate('2026-11-12', TODAY, t)).not.toMatch(/’/);
    });

    it('leaves a task without a date with an empty margin', () => {
        expect(at({}).text).toBe('');
    });
});

describe('the moment of closing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        dropClosing('Inbox.md:3');
        vi.useRealTimers();
    });

    const closed = () => ({
        snapshot: task({ status: 'done', completed: true, doneDate: TODAY }),
        bucket: 'today' as const,
        prev: 'todo' as const,
    });

    it('holds, then leaves, then is gone', () => {
        holdClosing('Inbox.md:3', closed());
        expect(useClosingTasks.getState().items['Inbox.md:3'].phase).toBe('held');
        vi.advanceTimersByTime(HOLD_MS);
        expect(useClosingTasks.getState().items['Inbox.md:3'].phase).toBe('leaving');
        vi.advanceTimersByTime(LEAVE_MS);
        expect(useClosingTasks.getState().items['Inbox.md:3']).toBeUndefined();
    });

    it('can be ended early, and says what it was', () => {
        holdClosing('Inbox.md:3', closed());
        const was = dropClosing('Inbox.md:3');
        expect(was?.prev).toBe('todo');
        expect(was?.key).toBe('Inbox.md:3');
        vi.advanceTimersByTime(HOLD_MS + LEAVE_MS);
        expect(useClosingTasks.getState().items).toEqual({});
    });

    it('finds the closed task again a line further down, where a next occurrence pushed it', () => {
        holdClosing('Inbox.md:3', closed());
        const item = useClosingTasks.getState().items['Inbox.md:3'];
        expect(isClosingOf(item, task({ status: 'done', lineNumber: 4 }))).toBe(true);
        // …and not the next occurrence that took its old line.
        expect(isClosingOf(item, task({ status: 'todo', lineNumber: 3 }))).toBe(false);
        expect(isClosingOf(item, task({ status: 'done', title: 'Other' }))).toBe(false);
    });

    it('starts only for a task that was open', () => {
        expect(closesTask('todo', 'done')).toBe(true);
        expect(closesTask('in-progress', 'cancelled')).toBe(true);
        expect(closesTask('done', 'cancelled')).toBe(false);
        expect(closesTask('todo', 'in-progress')).toBe(false);
    });
});

describe('closing a task, and taking it back', () => {
    function fakeApp(content: string) {
        const file = new TFile();
        file.path = 'Inbox.md';
        const store = { text: content };
        const app = {
            vault: {
                getAbstractFileByPath: (p: string) => (p === 'Inbox.md' ? file : null),
                read: () => Promise.resolve(store.text),
                process: (_f: unknown, fn: (data: string) => string) => {
                    store.text = fn(store.text);
                    return Promise.resolve(store.text);
                },
            },
        } as unknown as App;
        return { app, store };
    }

    const NOTE = ['# Inbox', '', '- [ ] Water the plants 🔁 every week 📅 2026-10-02', ''].join(
        '\n'
    );

    it('puts the note back exactly, next occurrence and all', async () => {
        const { app, store } = fakeApp(NOTE);
        const { ok, undo } = await new TaskWriter(app).setStatusUndoable(
            'Inbox.md',
            3,
            'done',
            'Water the plants'
        );
        expect(ok).toBe(true);
        expect(store.text).not.toBe(NOTE);
        expect(store.text.match(/Water the plants/g)?.length).toBe(2);

        expect(await undo?.()).toBe(true);
        expect(store.text).toBe(NOTE);
    });

    it('refuses to undo over anything written since', async () => {
        const { app, store } = fakeApp(NOTE);
        const { undo } = await new TaskWriter(app).setStatusUndoable(
            'Inbox.md',
            3,
            'done',
            'Water the plants'
        );
        store.text += '- [ ] Something typed by hand\n';
        const edited = store.text;

        expect(await undo?.()).toBe(false);
        expect(store.text).toBe(edited);
    });

    it('offers no undo when nothing was written', async () => {
        const { app } = fakeApp(NOTE);
        const result = await new TaskWriter(app).setStatusUndoable(
            'Inbox.md',
            3,
            'done',
            'A different task'
        );
        expect(result).toEqual({ ok: false });
    });
});

describe('a row claiming its swipe from Obsidian', () => {
    const touch = (el: HTMLElement, x: number) => {
        const e = new Event('touchstart') as Event & { touches: Array<{ clientX: number }> };
        Object.defineProperty(e, 'touches', { value: [{ clientX: x }] });
        el.dispatchEvent(e);
    };

    it('marks itself for a touch in the middle, and not at the edge where the sidebars live', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const release = claimSwipes(el);

        touch(el, 200);
        expect(el.dataset.ignoreSwipe).toBe('true');
        touch(el, EDGE_PX - 4);
        expect(el.dataset.ignoreSwipe).toBeUndefined();
        touch(el, window.innerWidth - 4);
        expect(el.dataset.ignoreSwipe).toBeUndefined();

        touch(el, 200);
        release();
        expect(el.dataset.ignoreSwipe).toBeUndefined();
        el.remove();
    });
});
