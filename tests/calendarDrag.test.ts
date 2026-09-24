import { describe, it, expect } from 'vitest';
import {
    canPlace,
    movedSlot,
    resizedSlot,
    slotChange,
    snap,
} from '../src/modules/tasks-calendar/services/calendarDrag';
import type { Task } from '../src/store/taskSlice';

function task(over: Partial<Task>): Task {
    return {
        id: 'Day.md:3',
        title: 'Standup',
        status: 'todo',
        completed: false,
        priority: 'medium',
        tags: [],
        subtasks: [],
        filePath: 'Day.md',
        lineNumber: 3,
        createdAt: '2026-09-01',
        ...over,
    } as Task;
}

describe('snapping and bounds', () => {
    it('lands on a quarter hour', () => {
        expect(snap(9 * 60 + 7)).toBe(9 * 60);
        expect(snap(9 * 60 + 8)).toBe(9 * 60 + 15);
    });

    it('moves a block whole, and keeps it inside the day', () => {
        expect(movedSlot('2026-09-24', 600 + 4, 60)).toEqual({
            date: '2026-09-24',
            start: 600,
            end: 660,
        });
        expect(movedSlot('2026-09-24', -30, 60).start).toBe(0);
        const late = movedSlot('2026-09-24', 23 * 60 + 50, 60);
        expect(late.end).toBeLessThan(24 * 60);
    });

    it('stretches the end, never below a quarter hour and never past the day', () => {
        expect(resizedSlot('2026-09-24', 600, 700)).toEqual({
            date: '2026-09-24',
            start: 600,
            end: 705,
        });
        expect(resizedSlot('2026-09-24', 600, 590).end).toBe(615);
        expect(resizedSlot('2026-09-24', 600, 24 * 60 + 30).end).toBeLessThan(24 * 60);
    });
});

describe('slotChange', () => {
    const due = task({ dueDate: '2026-09-24', dueTime: '09:00' });

    it('moves the hour, and writes no end the line never had', () => {
        const change = slotChange(due, 'move', { date: '2026-09-24', start: 600, end: 630 });
        expect(change).toEqual({ patch: { dueTime: '10:00' }, confirm: false });
    });

    it('shifts an end the line states', () => {
        const ranged = task({ dueDate: '2026-09-24', dueTime: '09:00', dueEndTime: '09:30' });
        expect(
            slotChange(ranged, 'move', { date: '2026-09-24', start: 600, end: 630 }).patch
        ).toEqual({
            dueTime: '10:00',
            dueEndTime: '10:30',
        });
    });

    it('stretching writes the end of the ⏰ range, not ⏲', () => {
        const timed = task({ dueDate: '2026-09-24', dueTime: '09:00', timerMinutes: 25 });
        const change = slotChange(timed, 'resize', { date: '2026-09-24', start: 540, end: 600 });
        expect(change.patch).toEqual({ dueTime: '09:00', dueEndTime: '10:00' });
        expect(change.patch).not.toHaveProperty('timerMinutes');
    });

    it('placing gives an hour and no end', () => {
        const allDay = task({ dueDate: '2026-09-24' });
        expect(
            slotChange(allDay, 'place', { date: '2026-09-24', start: 840, end: 900 }).patch
        ).toEqual({
            dueTime: '14:00',
            dueEndTime: null,
        });
    });

    it('asks before a deadline moves to another day', () => {
        const change = slotChange(due, 'move', { date: '2026-09-25', start: 540, end: 570 });
        expect(change).toEqual({
            patch: { dueTime: '09:00', dueDate: '2026-09-25' },
            dateField: 'dueDate',
            confirm: true,
        });
    });

    it('moves a scheduled day without asking', () => {
        const planned = task({ scheduledDate: '2026-09-24', dueTime: '09:00' });
        expect(slotChange(planned, 'move', { date: '2026-09-26', start: 540, end: 570 })).toEqual({
            patch: { dueTime: '09:00', scheduledDate: '2026-09-26' },
            dateField: 'scheduledDate',
            confirm: false,
        });
    });
});

describe('canPlace', () => {
    it('only an open task, from the day its hour belongs to', () => {
        const t = task({ startDate: '2026-09-21', dueDate: '2026-09-24' });
        expect(canPlace(t, '2026-09-24')).toBe(true);
        // Its "starts Monday" chip: an hour there would land on Friday.
        expect(canPlace(t, '2026-09-21')).toBe(false);
        expect(canPlace({ ...t, status: 'done', completed: true }, '2026-09-24')).toBe(false);
    });
});
