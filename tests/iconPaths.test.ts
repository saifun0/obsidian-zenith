import { describe, it, expect } from 'vitest';
import { remapIconPaths, pruneIconPaths } from '../src/core/iconPaths';

describe('remapIconPaths', () => {
    it('renames an exact path', () => {
        const { icons, changed } = remapIconPaths({ 'a/b.md': 'star' }, 'a/b.md', 'a/c.md');
        expect(changed).toBe(true);
        expect(icons).toEqual({ 'a/c.md': 'star' });
    });

    it('remaps descendants when a folder is renamed', () => {
        const src = { Proj: 'folder', 'Proj/note.md': 'file', 'Proj/sub/x.md': 'star' };
        const { icons } = remapIconPaths(src, 'Proj', 'Projects');
        expect(icons).toEqual({
            Projects: 'folder',
            'Projects/note.md': 'file',
            'Projects/sub/x.md': 'star',
        });
    });

    it('does NOT touch sibling paths that share a prefix', () => {
        // "foo" rename must not affect "foobar".
        const src = { foo: 'a', foobar: 'b', 'foo/x.md': 'c' };
        const { icons } = remapIconPaths(src, 'foo', 'baz');
        expect(icons).toEqual({ baz: 'a', foobar: 'b', 'baz/x.md': 'c' });
    });

    it('reports no change when nothing matches', () => {
        const src = { 'a.md': 'x' };
        const { icons, changed } = remapIconPaths(src, 'b.md', 'c.md');
        expect(changed).toBe(false);
        expect(icons).toBe(src); // same reference
    });
});

describe('pruneIconPaths', () => {
    it('drops the deleted path and its descendants', () => {
        const src = { Proj: 'f', 'Proj/a.md': 'x', 'Other/b.md': 'y' };
        const { icons, changed } = pruneIconPaths(src, 'Proj');
        expect(changed).toBe(true);
        expect(icons).toEqual({ 'Other/b.md': 'y' });
    });

    it('keeps prefix-sharing siblings', () => {
        const src = { foo: 'a', foobar: 'b' };
        const { icons } = pruneIconPaths(src, 'foo');
        expect(icons).toEqual({ foobar: 'b' });
    });

    it('reports no change when nothing matches', () => {
        const src = { 'a.md': 'x' };
        const { icons, changed } = pruneIconPaths(src, 'z.md');
        expect(changed).toBe(false);
        expect(icons).toBe(src);
    });
});
