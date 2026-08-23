import { describe, it, expect } from 'vitest';
import {
    formatMinutes,
    hourWindow,
    layoutDay,
    minutesOfDay,
    slotDate,
    splitTimed,
    taskSlot,
} from '../src/modules/tasks-calendar/services/calendarTime';
import type { Task } from '../src/store/taskSlice';

function task(partial: Partial<Task> & { id: string }): Task {
    return {
        title: partial.id,
        status: 'todo',
        completed: false,
        priority: 'none',
        tags: [],
        subtasks: [],
        filePath: 'tasks/inbox.md',
        lineNumber: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ...partial,
    };
}

/** `[start, end?]` in minutes → an item the grid can lay out. */
const item = (startMinutes?: number, endMinutes?: number) => ({ startMinutes, endMinutes });

describe('minutesOfDay / formatMinutes', () => {
    it('round-trips a time of day', () => {
        expect(minutesOfDay('09:30')).toBe(570);
        expect(formatMinutes(570)).toBe('09:30');
    });

    it('accepts a single-digit hour and pads it back', () => {
        expect(minutesOfDay('9:05')).toBe(545);
        expect(formatMinutes(545)).toBe('09:05');
    });

    it('rejects anything that is not a time', () => {
        expect(minutesOfDay(undefined)).toBeUndefined();
        expect(minutesOfDay('')).toBeUndefined();
        expect(minutesOfDay('24:00')).toBeUndefined();
        expect(minutesOfDay('10:60')).toBeUndefined();
        expect(minutesOfDay('half past nine')).toBeUndefined();
    });

    it('clamps a formatted value to the day', () => {
        expect(formatMinutes(-30)).toBe('00:00');
        expect(formatMinutes(2000)).toBe('24:00');
    });
});

describe('taskSlot', () => {
    it('reads a stated range', () => {
        const slot = taskSlot(task({ id: 'a', dueTime: '09:00', dueEndTime: '10:30' }));
        expect(slot).toEqual({ start: 540, end: 630 });
    });

    it('falls back to the timer when no end is stated', () => {
        const slot = taskSlot(task({ id: 'a', dueTime: '11:00', timerMinutes: 45 }));
        expect(slot).toEqual({ start: 660, end: 705 });
    });

    it('prefers the stated range over the timer', () => {
        const slot = taskSlot(
            task({ id: 'a', dueTime: '09:00', dueEndTime: '10:00', timerMinutes: 15 })
        );
        expect(slot?.end).toBe(600);
    });

    it('leaves the end open when the task only says when it starts', () => {
        expect(taskSlot(task({ id: 'a', dueTime: '15:45' }))).toEqual({ start: 945 });
    });

    it('ignores an end that is not after the start', () => {
        // The parser drops these, but a slot built from a hand-edited store
        // must not produce a block of negative height either.
        expect(taskSlot(task({ id: 'a', dueTime: '15:45', dueEndTime: '15:45' }))?.end).toBeUndefined();
        expect(taskSlot(task({ id: 'a', dueTime: '15:45', dueEndTime: '09:00' }))?.end).toBeUndefined();
    });

    it('has no slot at all without a start, even with a timer', () => {
        expect(taskSlot(task({ id: 'a', timerMinutes: 30 }))).toBeUndefined();
    });

    it('keeps a timer that would run past midnight inside the day', () => {
        const slot = taskSlot(task({ id: 'a', dueTime: '23:30', timerMinutes: 120 }));
        expect(slot?.end).toBe(24 * 60);
    });
});

describe('slotDate', () => {
    it('uses the due date when there is one', () => {
        const t = task({ id: 'a', dueDate: '2026-08-12', startDate: '2026-08-11' });
        expect(slotDate(t)).toBe('2026-08-12');
    });

    it('falls back to scheduled, then to start', () => {
        expect(slotDate(task({ id: 'a', scheduledDate: '2026-08-12' }))).toBe('2026-08-12');
        expect(slotDate(task({ id: 'a', startDate: '2026-08-11' }))).toBe('2026-08-11');
        expect(slotDate(task({ id: 'a' }))).toBeUndefined();
    });
});

describe('splitTimed', () => {
    it('sends items with an hour to the grid and the rest to the band', () => {
        const { timed, allDay } = splitTimed([item(540), item(), item(900)]);
        expect(timed.map((i) => i.startMinutes)).toEqual([540, 900]);
        expect(allDay).toHaveLength(1);
    });

    it('treats midnight as a time, not as absent', () => {
        const { timed, allDay } = splitTimed([item(0)]);
        expect(timed).toHaveLength(1);
        expect(allDay).toHaveLength(0);
    });
});

describe('layoutDay', () => {
    const columnsOf = (blocks: Array<{ column: number; columns: number }>) =>
        blocks.map((b) => [b.column, b.columns]);

    it('gives a lone block the whole width', () => {
        const [block] = layoutDay([item(540, 630)], 60);
        expect([block.start, block.end, block.column, block.columns]).toEqual([540, 630, 0, 1]);
        expect(block.stated).toBe(true);
    });

    it('substitutes the default slot when no end was stated', () => {
        const [block] = layoutDay([item(945)], 60);
        expect(block.end).toBe(1005);
        expect(block.stated).toBe(false);
    });

    it('splits the width between overlapping blocks', () => {
        const blocks = layoutDay([item(930, 975), item(945, 1005)], 60);
        expect(columnsOf(blocks)).toEqual([
            [0, 2],
            [1, 2],
        ]);
    });

    it('keeps blocks that only touch at an edge in one column', () => {
        // 09:00–10:00 and 10:00–11:00 are consecutive, not concurrent.
        const blocks = layoutDay([item(540, 600), item(600, 660)], 60);
        expect(columnsOf(blocks)).toEqual([
            [0, 1],
            [0, 1],
        ]);
    });

    it('does not let a busy morning narrow an untouched afternoon', () => {
        const blocks = layoutDay([item(540, 660), item(560, 620), item(900, 960)], 60);
        expect(columnsOf(blocks)).toEqual([
            [0, 2],
            [1, 2],
            [0, 1],
        ]);
    });

    it('reuses a column once its previous block has finished', () => {
        // A runs all morning; B and C are back to back beside it, so the
        // cluster needs two columns rather than three.
        const blocks = layoutDay([item(540, 720), item(560, 600), item(600, 640)], 60);
        expect(blocks.map((b) => b.columns)).toEqual([2, 2, 2]);
        expect(blocks.map((b) => b.column)).toEqual([0, 1, 1]);
    });

    it('sorts by start, longest first', () => {
        const blocks = layoutDay([item(900, 930), item(540, 600), item(540, 720)], 60);
        expect(blocks.map((b) => [b.start, b.end])).toEqual([
            [540, 720],
            [540, 600],
            [900, 930],
        ]);
    });

    it('clamps a default slot that would run past midnight', () => {
        const [block] = layoutDay([item(23 * 60 + 30)], 90);
        expect(block.end).toBe(24 * 60);
    });
});

describe('hourWindow', () => {
    it('shows the waking hours by default', () => {
        expect(hourWindow([{ start: 540, end: 630 }], false)).toEqual({ from: 7, to: 23 });
    });

    it('opens wide enough for anything outside them', () => {
        // 05:30 and a block ending at 23:40 both have to be reachable.
        expect(hourWindow([{ start: 330, end: 400 }], false).from).toBe(5);
        expect(hourWindow([{ start: 1380, end: 1420 }], false).to).toBe(24);
    });

    it('does not add a row for a block ending exactly on the hour', () => {
        expect(hourWindow([{ start: 1320, end: 1380 }], false).to).toBe(23);
    });

    it('shows the whole day when asked', () => {
        expect(hourWindow([{ start: 540, end: 630 }], true)).toEqual({ from: 0, to: 24 });
    });

    it('still has a window with nothing on the day', () => {
        expect(hourWindow([], false)).toEqual({ from: 7, to: 23 });
    });
});
