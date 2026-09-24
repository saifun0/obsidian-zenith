import { useSyncExternalStore } from 'react';
import { addDays, isoToDate } from '../../core/calendarDates';
import type { StudySchedule } from './studyModel';
import { lessonsOn, slotsOf, type StudyOptions } from './studyTime';

/**
 * A second clock for the Study card and view, set from the debug tools.
 *
 * A timetable is only worth checking at the times it changes: before the first
 * class, in one, in a break, after the last, on a day off. Waiting for those,
 * or moving the system clock, is not a way to look at a layout. The preview
 * moves only what the Study card and view call "now"; reminders, the scheduler
 * and the rest of Obsidian keep the real time. It is an offset, so the preview
 * keeps running — a countdown still counts — and it lives in memory: a restart
 * is back to the real time.
 */

let offset: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit(): void {
    listeners.forEach((l) => l());
}

/**
 * The offset that makes the real clock read `date` at `minute`. Whole minutes,
 * counted from the start of the real minute, so the preview's minute turns
 * when the real one does.
 */
export function previewOffset(date: string, minute: number, real: Date): number {
    const target = isoToDate(date);
    target.setHours(0, minute, 0, 0);
    const base = new Date(real);
    base.setSeconds(0, 0);
    return target.getTime() - base.getTime();
}

/** Study's "now" reads `date` at `minute` from here on, and keeps running. */
export function setStudyPreview(date: string, minute: number): void {
    offset = previewOffset(date, minute, new Date());
    emit();
}

/** Back to the real time. */
export function clearStudyPreview(): void {
    if (offset === null) return;
    offset = null;
    emit();
}

/** Milliseconds added to the real time, or `null` when Study keeps the real time. */
export function studyPreviewOffset(): number | null {
    return offset;
}

export function useStudyPreviewOffset(): number | null {
    return useSyncExternalStore(subscribe, studyPreviewOffset);
}

export type PreviewPresetId = 'before' | 'during' | 'break' | 'after' | 'free';

export interface PreviewPreset {
    id: PreviewPresetId;
    date: string;
    /** Minutes from midnight. */
    minute: number;
}

/**
 * The moments on `date` where the card says something different: half an hour
 * before the first class, twenty minutes into the second (the first when there
 * is one), a few minutes into the first break, half an hour after the last —
 * and noon on the next day without classes. A moment the day does not have
 * (no break, no classes) is left out.
 */
export function previewPresets(
    schedule: StudySchedule,
    date: string,
    opts: StudyOptions
): PreviewPreset[] {
    const out: PreviewPreset[] = [];
    const slots = slotsOf(lessonsOn(schedule, date, opts)).map((slot) => ({
        start: slot[0].start,
        end: Math.max(...slot.map((l) => l.end)),
    }));
    if (slots.length) {
        const first = slots[0];
        const last = slots[slots.length - 1];
        const busy = slots[Math.min(1, slots.length - 1)];
        out.push({ id: 'before', date, minute: Math.max(0, first.start - 30) });
        out.push({
            id: 'during',
            date,
            minute: Math.min(busy.start + 20, Math.max(busy.start, busy.end - 1)),
        });
        for (let i = 1; i < slots.length; i++) {
            const gap = slots[i].start - slots[i - 1].end;
            if (gap < 2) continue;
            out.push({
                id: 'break',
                date,
                minute: slots[i - 1].end + Math.min(5, Math.floor(gap / 2)),
            });
            break;
        }
        out.push({ id: 'after', date, minute: Math.min(24 * 60 - 1, last.end + 30) });
    }
    for (let i = slots.length ? 1 : 0; i <= 14; i++) {
        const day = addDays(date, i);
        if (lessonsOn(schedule, day, opts).length) continue;
        out.push({ id: 'free', date: day, minute: 12 * 60 });
        break;
    }
    return out;
}
