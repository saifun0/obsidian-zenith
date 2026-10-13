// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBox } from '../src/modules/tasks/components/taskStatusUi';
import { SubtaskTally } from '../src/modules/tasks/components/TaskItem';

/**
 * A task under way is a ring with a quarter of it going round — it was a
 * half-filled disc that stood still — and the subtasks' tally is its count
 * over a line, where it was a second small ring beside the count.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;

beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
});

const draw = (node: React.ReactNode) => act(() => root.render(node));
const arcs = () => [...host.querySelectorAll<SVGPathElement>('.zenith-status__orbit')];

describe('the circle of a task under way', () => {
    it('is the ring and an arc on it, and no other status has the arc', () => {
        draw(React.createElement(StatusBox, { status: 'in-progress' }));
        expect(host.querySelector('.zenith-status__ring')).not.toBeNull();
        expect(arcs()).toHaveLength(1);
        for (const status of ['todo', 'done', 'cancelled'] as const) {
            draw(React.createElement(StatusBox, { status }));
            expect(arcs(), status).toHaveLength(0);
        }
    });

    it('starts as far into its turn as the clock is, so every arc is in step', () => {
        // One turn is 4.8 seconds. Drawn 1.3 seconds into a turn, and another
        // 2 seconds later: each begins where the turn already is.
        vi.setSystemTime(4800 * 1000 + 1300);
        draw(
            React.createElement(
                'div',
                null,
                React.createElement(StatusBox, { key: 'a', status: 'in-progress' })
            )
        );
        expect(arcs()[0].style.animationDelay).toBe('-1300ms');

        vi.setSystemTime(4800 * 1000 + 3300);
        draw(
            React.createElement(
                'div',
                null,
                React.createElement(StatusBox, { key: 'a', status: 'in-progress' }),
                React.createElement(StatusBox, { key: 'b', status: 'in-progress' })
            )
        );
        // The first keeps the place it was given: drawing the row again must
        // not move its arc.
        expect(arcs().map((arc) => arc.style.animationDelay)).toEqual(['-1300ms', '-3300ms']);
    });

    it('takes its place when the task is started, not when its row was drawn', () => {
        vi.setSystemTime(4800 * 1000 + 100);
        draw(React.createElement(StatusBox, { status: 'todo' }));
        vi.setSystemTime(4800 * 1000 + 2500);
        draw(React.createElement(StatusBox, { status: 'in-progress' }));
        expect(arcs()[0].style.animationDelay).toBe('-2500ms');
    });
});

describe('the subtasks’ tally', () => {
    const line = () => host.querySelector<HTMLElement>('.zenith-tally__line > i');

    it('is the count over a line inked as far as they have got', () => {
        draw(React.createElement(SubtaskTally, { done: 1, total: 4 }));
        expect(host.querySelector('.zenith-tally')?.textContent).toBe('1/4');
        expect(line()?.style.width).toBe('25%');
        // No ring beside it any more.
        expect(host.querySelector('svg')).toBeNull();
    });

    it('is inked whole when all are done, and not at all when none is', () => {
        draw(React.createElement(SubtaskTally, { done: 3, total: 3 }));
        expect(line()?.style.width).toBe('100%');
        draw(React.createElement(SubtaskTally, { done: 0, total: 3 }));
        expect(line()?.style.width).toBe('0%');
    });
});
