import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FuzzySuggestModal, Notice, type App } from 'obsidian';
import { useApp } from '../../../context/AppContext';
import type { Translator } from '../../../core/i18n';
import { addDays, isoToDate } from '../../../core/calendarDates';
import { ConfirmModal } from '../../../core/ConfirmModal';
import type { Task } from '../../../store/taskSlice';
import { TaskWriter } from '../../tasks/services/taskWriter';
import type { CalendarEntry } from '../services/calendarTasks';
import { formatMinutes, type TimedBlock } from '../services/calendarTime';
import {
    SNAP_MINUTES,
    canPlace,
    movedSlot,
    resizedSlot,
    slotChange,
    type DragMode,
    type GridSlot,
} from '../services/calendarDrag';

/** Where a point on the grid is: which day's column, and how far down it. */
export type SlotAt = (clientX: number, clientY: number) => { date: string; minutes: number } | null;

/** Pixels a pointer has to travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** How long the arrow keys wait for the next press before writing. */
const KEY_SETTLE_MS = 900;

/** A click this soon after a drop is the end of the drag, not a request to open. */
const SWALLOW_MS = 300;

export interface ScheduleDrag {
    /** Where the task being moved would land, drawn as a ghost. */
    ghost: { taskId: string; slot: GridSlot } | null;
    // Properties rather than methods: they are handed around as callbacks.
    startBlock: (
        e: React.PointerEvent,
        block: TimedBlock<CalendarEntry>,
        mode: 'move' | 'resize'
    ) => void;
    startChip: (e: React.PointerEvent, entry: CalendarEntry, date: string) => void;
    keyBlock: (e: React.KeyboardEvent, block: TimedBlock<CalendarEntry>, date: string) => void;
    tapSlot: (date: string, minutes: number) => void;
    /** True when a click is the tail of a drag and should do nothing. */
    swallowClick: () => boolean;
}

interface Session {
    task: Task;
    mode: DragMode;
    from: GridSlot;
    /** Minutes between the pointer and the block's top when it was grabbed. */
    grab: number;
    x0: number;
    y0: number;
    moved: boolean;
    slot: GridSlot | null;
}

/** Pick one of a day's tasks to give an hour to — the phone's way onto the grid. */
class PlaceTaskModal extends FuzzySuggestModal<Task> {
    constructor(
        app: App,
        placeholder: string,
        private readonly tasks: Task[],
        private readonly onPick: (task: Task) => void
    ) {
        super(app);
        this.setPlaceholder(placeholder);
    }
    getItems(): Task[] {
        return this.tasks;
    }
    getItemText(task: Task): string {
        return task.title;
    }
    onChooseItem(task: Task): void {
        this.onPick(task);
    }
}

/**
 * Moving tasks on the hour grid: drag a block, stretch it by its foot, drop an
 * hour-less task from the all-day band, tap an empty slot, or nudge a focused
 * block with the arrow keys. Every gesture ends in the same place — a change to
 * the task's line through the writer, with the title checked so a note that
 * moved underneath is refused rather than rewritten.
 *
 * A touch on a block is not a drag — on a phone that would steal every scroll
 * of the grid — so touch gets the tap on an empty slot instead, and the
 * keyboard gets the arrows.
 */
export function useScheduleDrag(opts: {
    enabled: boolean;
    t: Translator;
    defaultSlot: number;
    slotAt: React.MutableRefObject<SlotAt | null>;
    allDayByDate: Map<string, CalendarEntry[]>;
}): ScheduleDrag | null {
    const { enabled, t, defaultSlot, slotAt, allDayByDate } = opts;
    const { app } = useApp();
    const [ghost, setGhost] = useState<ScheduleDrag['ghost']>(null);
    const session = useRef<Session | null>(null);
    const swallowUntil = useRef(0);
    const keys = useRef<{
        task: Task;
        mode: 'move' | 'resize';
        slot: GridSlot;
        timer: number;
    } | null>(null);

    const commit = useCallback(
        async (task: Task, mode: DragMode, to: GridSlot) => {
            const change = slotChange(task, mode, to);
            if (change.confirm) {
                const day = isoToDate(to.date).toLocaleDateString(t.locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                });
                const ok = await new ConfirmModal(app, {
                    title: t('calendar.drag.moveDue', { date: day }),
                    body: t('calendar.drag.moveDueBody', { title: task.title }),
                    confirmText: t('calendar.drag.moveDueConfirm'),
                    cancelText: t('common.cancel'),
                }).ask();
                if (!ok) {
                    setGhost(null);
                    return;
                }
            }
            const ok = await new TaskWriter(app).updateTaskInFile(
                task.filePath,
                task.lineNumber,
                change.patch,
                task.title
            );
            if (!ok) new Notice(t('calendar.drag.failed'));
            setGhost(null);
        },
        [app, t]
    );

    const begin = useCallback(
        (e: React.PointerEvent, s: Omit<Session, 'x0' | 'y0' | 'moved' | 'slot'>) => {
            // Mouse and pen drag; a finger scrolls. Only the primary button.
            if (!enabled || e.pointerType === 'touch' || e.button !== 0) return;
            session.current = { ...s, x0: e.clientX, y0: e.clientY, moved: false, slot: null };
            const win = (e.currentTarget as HTMLElement).ownerDocument.defaultView ?? window;

            const move = (ev: PointerEvent) => {
                const cur = session.current;
                if (!cur) return;
                if (
                    !cur.moved &&
                    Math.hypot(ev.clientX - cur.x0, ev.clientY - cur.y0) < DRAG_THRESHOLD
                ) {
                    return;
                }
                cur.moved = true;
                const at = slotAt.current?.(ev.clientX, ev.clientY);
                if (!at) return;
                const length = cur.from.end - cur.from.start;
                cur.slot =
                    cur.mode === 'resize'
                        ? resizedSlot(cur.from.date, cur.from.start, at.minutes)
                        : movedSlot(at.date, at.minutes - cur.grab, length);
                setGhost({ taskId: cur.task.id, slot: cur.slot });
            };
            const stop = (commitIt: boolean) => {
                win.removeEventListener('pointermove', move);
                win.removeEventListener('pointerup', up);
                win.removeEventListener('pointercancel', cancel);
                win.removeEventListener('keydown', escape, true);
                const cur = session.current;
                session.current = null;
                if (!cur?.moved) return;
                swallowUntil.current = Date.now() + SWALLOW_MS;
                if (commitIt && cur.slot) void commit(cur.task, cur.mode, cur.slot);
                else setGhost(null);
            };
            const up = () => stop(true);
            const cancel = () => stop(false);
            const escape = (ev: KeyboardEvent) => {
                if (ev.key !== 'Escape') return;
                ev.stopPropagation();
                stop(false);
            };
            win.addEventListener('pointermove', move);
            win.addEventListener('pointerup', up);
            win.addEventListener('pointercancel', cancel);
            win.addEventListener('keydown', escape, true);
        },
        [enabled, slotAt, commit]
    );

    const startBlock = useCallback<ScheduleDrag['startBlock']>(
        (e, block, mode) => {
            const at = slotAt.current?.(e.clientX, e.clientY);
            const date = at?.date;
            if (!date) return;
            e.stopPropagation();
            begin(e, {
                task: block.item.task,
                mode,
                from: { date, start: block.start, end: block.end },
                grab: mode === 'move' && at ? at.minutes - block.start : 0,
            });
        },
        [begin, slotAt]
    );

    const startChip = useCallback<ScheduleDrag['startChip']>(
        (e, entry, date) => {
            if (!canPlace(entry.task, date)) return;
            begin(e, {
                task: entry.task,
                mode: 'place',
                from: { date, start: 9 * 60, end: 9 * 60 + defaultSlot },
                // Held by its top: the ghost hangs from the pointer.
                grab: 0,
            });
        },
        [begin, defaultSlot]
    );

    const keyBlock = useCallback<ScheduleDrag['keyBlock']>(
        (e, block, date) => {
            if (!enabled) return;
            const task = block.item.task;
            let cur = keys.current?.task.id === task.id ? keys.current : null;
            if (e.key === 'Escape' && cur) {
                window.clearTimeout(cur.timer);
                keys.current = null;
                setGhost(null);
                e.preventDefault();
                return;
            }
            if (e.key === 'Enter' && cur) {
                window.clearTimeout(cur.timer);
                keys.current = null;
                void commit(cur.task, cur.mode, cur.slot);
                e.preventDefault();
                return;
            }
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();

            const slot = cur?.slot ?? { date, start: block.start, end: block.end };
            const resize = e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
            const step =
                e.key === 'ArrowUp' ? -SNAP_MINUTES : e.key === 'ArrowDown' ? SNAP_MINUTES : 0;
            const days = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
            const next = resize
                ? resizedSlot(slot.date, slot.start, slot.end + step)
                : movedSlot(addDays(slot.date, days), slot.start + step, slot.end - slot.start);

            if (cur) window.clearTimeout(cur.timer);
            const mode: 'move' | 'resize' = resize || cur?.mode === 'resize' ? 'resize' : 'move';
            cur = {
                task,
                mode,
                slot: next,
                timer: window.setTimeout(() => {
                    const pending = keys.current;
                    keys.current = null;
                    if (pending) void commit(pending.task, pending.mode, pending.slot);
                }, KEY_SETTLE_MS),
            };
            keys.current = cur;
            setGhost({ taskId: task.id, slot: next });
        },
        [enabled, commit]
    );

    const tapSlot = useCallback<ScheduleDrag['tapSlot']>(
        (date, minutes) => {
            if (!enabled) return;
            const seen = new Set<string>();
            const tasks = (allDayByDate.get(date) ?? [])
                .map((entry) => entry.task)
                .filter((task) => canPlace(task, date) && !seen.has(task.id) && seen.add(task.id));
            if (!tasks.length) {
                new Notice(t('calendar.drag.nothingToPlace'));
                return;
            }
            const slot = movedSlot(date, minutes, defaultSlot);
            new PlaceTaskModal(
                app,
                t('calendar.drag.pick', { time: formatMinutes(slot.start) }),
                tasks,
                (task) => {
                    void commit(task, 'place', slot);
                }
            ).open();
        },
        [enabled, allDayByDate, app, t, defaultSlot, commit]
    );

    // A pending keyboard move is written, not lost, when the view goes away.
    useEffect(
        () => () => {
            const pending = keys.current;
            if (!pending) return;
            window.clearTimeout(pending.timer);
            keys.current = null;
            void commit(pending.task, pending.mode, pending.slot);
        },
        [commit]
    );

    if (!enabled) return null;
    return {
        ghost,
        startBlock,
        startChip,
        keyBlock,
        tapSlot,
        swallowClick: () => Date.now() < swallowUntil.current,
    };
}
