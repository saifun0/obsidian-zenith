/**
 * A stable colour per multi-day task.
 *
 * Two bars stacked in the same week are two different projects, and painting
 * both in the one "in flight" colour makes them read as one striped block. The
 * kind palette can't help here — every span is the same kind — so spans get
 * their own categorical scale.
 *
 * The colour comes from the task's identity rather than its position in the
 * list: assigning by index would repaint every bar the moment an unrelated task
 * appeared above it, and a colour that changes week to week isn't a label.
 */

import type { Task } from '../../../store/taskSlice';

/**
 * Eight hues spread around the wheel at a matched saturation and lightness, so
 * they read as one family and stay distinguishable in both themes. They're used
 * as a tint (22% fill, 40% outline), never as text.
 */
export const SPAN_COLORS = [
    '#14b8a6', // teal
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#d946ef', // magenta
    '#f43f5e', // rose
    '#f59e0b', // amber
    '#84cc16', // lime
    '#22c55e', // green
] as const;

/** FNV-1a, 32-bit — small, stable across runs, and no dependency. */
function hash(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * The bar colour for a task.
 *
 * Keyed on the note and the title, not on the task id: an id carries the line
 * number, so adding a line above a task would change its colour for no reason
 * the user can see.
 */
export function spanColor(task: Task): string {
    return SPAN_COLORS[hash(`${task.filePath}\n${task.title}`) % SPAN_COLORS.length];
}
