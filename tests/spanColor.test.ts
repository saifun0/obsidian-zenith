import { describe, it, expect } from 'vitest';
import { spanColor, SPAN_COLORS } from '../src/modules/tasks-calendar/services/spanColor';
import type { Task } from '../src/store/taskSlice';

function task(partial: Partial<Task>): Task {
    return {
        id: 'tasks/inbox.md:1',
        title: 'Ship it',
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

describe('spanColor', () => {
    it('always returns a colour from the palette', () => {
        for (let i = 0; i < 200; i++) {
            expect(SPAN_COLORS).toContain(spanColor(task({ title: `Task ${i}` })));
        }
    });

    it('gives the same task the same colour every time', () => {
        const t = task({ title: 'Zenith 0.1.0' });
        expect(spanColor(t)).toBe(spanColor(task({ title: 'Zenith 0.1.0' })));
    });

    it('survives the task moving to another line — the id would not', () => {
        const before = task({ title: 'Zenith 0.1.0', lineNumber: 4, id: 'tasks/inbox.md:4' });
        const after = task({ title: 'Zenith 0.1.0', lineNumber: 19, id: 'tasks/inbox.md:19' });
        expect(spanColor(before)).toBe(spanColor(after));
    });

    it('separates same-named tasks living in different notes', () => {
        const a = task({ title: 'Release', filePath: 'tasks/work.md' });
        const b = task({ title: 'Release', filePath: 'tasks/home.md' });
        expect(spanColor(a)).not.toBe(spanColor(b));
    });

    it('spreads a handful of tasks across the palette rather than clumping', () => {
        const titles = [
            'Zenith 0.1.0',
            'Улучшение ПК 3.0',
            'Ремонт кухни',
            'Q3 planning',
            'Learn Rust',
            'Move flat',
        ];
        const used = new Set(titles.map((title) => spanColor(task({ title }))));
        // Not a guarantee of the hash, but a regression alarm: if a change makes
        // six ordinary titles collapse onto two colours, the bars stop being
        // distinguishable and that is the whole point of this module.
        expect(used.size).toBeGreaterThanOrEqual(4);
    });
});
