import { describe, it, expect } from 'vitest';
import { toStringArray, toIsoDate, VaultService } from '../src/services/vaultService';

describe('toStringArray', () => {
    it('passes through arrays, trimming and dropping empties', () => {
        expect(toStringArray(['work', ' urgent ', ''])).toEqual(['work', 'urgent']);
    });
    it('splits a bare/comma string', () => {
        expect(toStringArray('work urgent')).toEqual(['work', 'urgent']);
        expect(toStringArray('work, urgent')).toEqual(['work', 'urgent']);
    });
    it('coerces numbers', () => {
        expect(toStringArray([1, 2])).toEqual(['1', '2']);
        expect(toStringArray(3)).toEqual(['3']);
    });
    it('returns [] for null/undefined', () => {
        expect(toStringArray(null)).toEqual([]);
        expect(toStringArray(undefined)).toEqual([]);
    });
});

describe('toIsoDate', () => {
    it('keeps ISO strings (date part only)', () => {
        expect(toIsoDate('2025-01-15')).toBe('2025-01-15');
        expect(toIsoDate('2025-01-15T10:00:00')).toBe('2025-01-15');
    });
    it('recovers the calendar day from a UTC Date (YAML dates)', () => {
        // js-yaml parses `2025-01-15` as UTC midnight.
        expect(toIsoDate(new Date(Date.UTC(2025, 0, 15)))).toBe('2025-01-15');
    });
    it('returns undefined for empty / non-date values', () => {
        expect(toIsoDate('')).toBeUndefined();
        expect(toIsoDate(null)).toBeUndefined();
        expect(toIsoDate('not a date')).toBeUndefined();
    });
});

describe('VaultService.parseCheckboxes', () => {
    const svc = new VaultService({} as never);

    it('parses -/* checkboxes with the status char and indentation', () => {
        const md = ['- [ ] first', '* [x] second', '  - [/] in prog', 'not a task'].join('\n');
        const boxes = svc.parseCheckboxes(md);
        expect(boxes).toEqual([
            { text: 'first', statusChar: ' ', indent: 0, lineNumber: 1 },
            { text: 'second', statusChar: 'x', indent: 0, lineNumber: 2 },
            { text: 'in prog', statusChar: '/', indent: 2, lineNumber: 3 },
        ]);
    });
});

describe('VaultService.parseTags', () => {
    const svc = new VaultService({} as never);
    it('extracts inline tags', () => {
        expect(svc.parseTags('a #x and #y-2')).toEqual(['x', 'y-2']);
    });
});
