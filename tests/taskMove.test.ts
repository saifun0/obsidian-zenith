import { describe, it, expect } from 'vitest';
import {
    findBlock,
    indentWidth,
    indentOf,
    reindentBlock,
    moveBlock,
    extractBlock,
    insertBlock,
} from '../src/modules/tasks/services/taskMove';

/** Template literal → lines, without the newlines that frame the literal. */
const doc = (s: string) => s.replace(/^\n/, '').replace(/\n$/, '').split('\n');

describe('indentWidth / indentOf', () => {
    it('counts a tab as four columns', () => {
        expect(indentWidth('- [ ] a')).toBe(0);
        expect(indentWidth('\t- [ ] a')).toBe(4);
        expect(indentWidth('    - [ ] a')).toBe(4);
        expect(indentWidth('\t\t- [ ] a')).toBe(8);
    });

    it('returns the literal whitespace', () => {
        expect(indentOf('\t\t- [ ] a')).toBe('\t\t');
        expect(indentOf('  - [ ] a')).toBe('  ');
    });
});

describe('findBlock', () => {
    const lines = doc(`
- [ ] First
\t- [ ] First child
\t\t- [ ] Deep grandchild
- [ ] Second
- [ ] Third
`);

    it('covers the task line plus everything indented under it', () => {
        expect(findBlock(lines, 0)).toEqual({ start: 0, end: 2 });
    });

    it('stops at a sibling', () => {
        expect(findBlock(lines, 3)).toEqual({ start: 3, end: 3 });
    });

    it('handles a nested task as its own block', () => {
        expect(findBlock(lines, 1)).toEqual({ start: 1, end: 2 });
    });

    it('returns null for a non-checkbox line', () => {
        expect(findBlock(doc('Just a paragraph'), 0)).toBeNull();
        expect(findBlock(lines, 99)).toBeNull();
    });

    it('does not swallow the blank line before the next task', () => {
        const l = doc(`
- [ ] First
\t- [ ] Child

- [ ] Second
`);
        expect(findBlock(l, 0)).toEqual({ start: 0, end: 1 });
    });

    it('keeps a blank line that sits inside the block', () => {
        const l = doc(`
- [ ] First
\t- [ ] Child

\t- [ ] Another child
- [ ] Second
`);
        expect(findBlock(l, 0)).toEqual({ start: 0, end: 3 });
    });
});

describe('reindentBlock', () => {
    it('shifts the whole block, preserving relative depth', () => {
        const block = doc(`
\t- [ ] Parent
\t\t- [ ] Child
`);
        expect(reindentBlock(block, '')).toEqual(['- [ ] Parent', '\t- [ ] Child']);
    });

    it('is a no-op when the indent already matches', () => {
        const block = ['- [ ] A'];
        expect(reindentBlock(block, '')).toEqual(['- [ ] A']);
    });
});

describe('moveBlock', () => {
    const lines = doc(`
- [ ] A
- [ ] B
- [ ] C
`);

    it('moves a task down, after the target', () => {
        const r = moveBlock(lines, 1, 3, 'after');
        expect(r?.lines).toEqual(['- [ ] B', '- [ ] C', '- [ ] A']);
    });

    it('moves a task up, before the target', () => {
        const r = moveBlock(lines, 3, 1, 'before');
        expect(r?.lines).toEqual(['- [ ] C', '- [ ] A', '- [ ] B']);
    });

    it('carries the whole subtree along', () => {
        const l = doc(`
- [ ] A
\t- [ ] A1
\t- [ ] A2
- [ ] B
`);
        const r = moveBlock(l, 1, 4, 'after');
        expect(r?.lines).toEqual(['- [ ] B', '- [ ] A', '\t- [ ] A1', '\t- [ ] A2']);
    });

    it('re-indents to become a sibling of the target', () => {
        const l = doc(`
- [ ] A
\t- [ ] A1
- [ ] B
`);
        // Move the nested A1 to sit after the top-level B.
        const r = moveBlock(l, 2, 3, 'after');
        expect(r?.lines).toEqual(['- [ ] A', '- [ ] B', '- [ ] A1']);
    });

    it('nests a top-level task when dropped next to a subtask', () => {
        const l = doc(`
- [ ] A
\t- [ ] A1
- [ ] B
`);
        const r = moveBlock(l, 3, 2, 'after');
        expect(r?.lines).toEqual(['- [ ] A', '\t- [ ] A1', '\t- [ ] B']);
    });

    it('reports where the block landed', () => {
        expect(moveBlock(lines, 1, 3, 'after')?.newStart).toBe(2);
        expect(moveBlock(lines, 3, 1, 'before')?.newStart).toBe(0);
    });

    it('refuses to move a task into its own subtree', () => {
        const l = doc(`
- [ ] A
\t- [ ] A1
`);
        expect(moveBlock(l, 1, 2, 'after')).toBeNull();
    });

    it('refuses a no-op or a non-checkbox line', () => {
        expect(moveBlock(lines, 2, 2, 'before')).toBeNull();
        expect(moveBlock(doc('text\n- [ ] A'), 1, 2, 'after')).toBeNull();
    });

    it('leaves the rest of the document untouched', () => {
        const l = doc(`
# Heading

- [ ] A
- [ ] B

Some trailing prose.
`);
        const r = moveBlock(l, 4, 3, 'before');
        expect(r?.lines).toEqual(['# Heading', '', '- [ ] B', '- [ ] A', '', 'Some trailing prose.']);
    });
});

describe('a realistic tab-indented project file', () => {
    // Mirrors the shape of a real vault file: one top-level task with a
    // three-level subtree, tab indentation, and a leading blank line.
    const file = () =>
        doc(`

- [/] Zenith 0.1.0 🛫 2026-07-26 📅 2026-07-31
\t- [ ] Content module
\t- [ ] Improve dashboard
\t\t- [ ] Configurable grid
\t- [ ] Port the old plugin
\t\t- [ ] Sync
\t\t- [ ] Daily notes
\t\t- [ ] Prayer tracker
\t- [ ] Publish on GitHub
`);

    it('reorders deep siblings without touching anything else', () => {
        // "Daily notes" (line 8) above "Sync" (line 7).
        const r = moveBlock(file(), 8, 7, 'before');
        expect(r?.lines.slice(5, 9)).toEqual([
            '\t- [ ] Port the old plugin',
            '\t\t- [ ] Daily notes',
            '\t\t- [ ] Sync',
            '\t\t- [ ] Prayer tracker',
        ]);
        // The top-level task and its date markers are untouched.
        expect(r?.lines[1]).toBe('- [/] Zenith 0.1.0 🛫 2026-07-26 📅 2026-07-31');
    });

    it('moves a mid-level task with its children to the top of the group', () => {
        // "Publish on GitHub" (line 10) above "Content module" (line 3).
        const r = moveBlock(file(), 10, 3, 'before');
        expect(r?.lines.slice(2, 5)).toEqual([
            '\t- [ ] Publish on GitHub',
            '\t- [ ] Content module',
            '\t- [ ] Improve dashboard',
        ]);
        expect(r?.lines).toHaveLength(file().length);
    });

    it('carries a subtree when the parent moves', () => {
        // "Port the old plugin" (line 6) above "Improve dashboard" (line 4).
        const r = moveBlock(file(), 6, 4, 'before');
        expect(r?.lines.slice(3, 8)).toEqual([
            '\t- [ ] Port the old plugin',
            '\t\t- [ ] Sync',
            '\t\t- [ ] Daily notes',
            '\t\t- [ ] Prayer tracker',
            '\t- [ ] Improve dashboard',
        ]);
    });

    it('keeps tabs as tabs when a subtask changes depth', () => {
        // "Sync" (line 7, two tabs deep) dropped after "Content module"
        // (line 3, one tab deep) is promoted to one tab.
        const r = moveBlock(file(), 7, 3, 'after');
        expect(r?.lines[3]).toBe('\t- [ ] Sync');
    });

    it('refuses to drop a parent inside its own subtree', () => {
        expect(moveBlock(file(), 6, 7, 'after')).toBeNull();
    });
});

describe('extractBlock / insertBlock (cross-file move)', () => {
    it('lifts a block out of the source', () => {
        const l = doc(`
- [ ] A
\t- [ ] A1
- [ ] B
`);
        const r = extractBlock(l, 1);
        expect(r?.block).toEqual(['- [ ] A', '\t- [ ] A1']);
        expect(r?.rest).toEqual(['- [ ] B']);
    });

    it('inserts a block at the target indentation', () => {
        const dest = doc(`
- [ ] X
\t- [ ] X1
`);
        const out = insertBlock(dest, ['- [ ] A', '\t- [ ] A1'], 2, 'after');
        expect(out).toEqual(['- [ ] X', '\t- [ ] X1', '\t- [ ] A', '\t\t- [ ] A1']);
    });

    it('returns null when the target line is not a task', () => {
        expect(insertBlock(doc('prose'), ['- [ ] A'], 1, 'after')).toBeNull();
        expect(extractBlock(doc('prose'), 1)).toBeNull();
    });
});
