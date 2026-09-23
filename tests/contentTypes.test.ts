import { describe, it, expect } from 'vitest';
import {
    effectiveContentTypes,
    resolveContentType,
    typeShowsField,
    slugifyTypeId,
    DEFAULT_CONTENT_TYPES,
    type ContentTypeConfig,
} from '../src/core/contentTypes';

describe('effectiveContentTypes', () => {
    it('falls back to the built-in defaults when nothing is saved', () => {
        expect(effectiveContentTypes([]).map((t) => t.id)).toEqual(DEFAULT_CONTENT_TYPES.map((t) => t.id));
        expect(effectiveContentTypes(undefined)).toHaveLength(DEFAULT_CONTENT_TYPES.length);
    });

    it('returns the saved list untouched when nothing needs topping up', () => {
        const saved: ContentTypeConfig[] = [
            { id: 'x', label: 'X', icon: 'star', color: '#fff', progressUnit: 'parts', fields: [] },
        ];
        expect(effectiveContentTypes(saved)).toBe(saved);
    });

    it('backfills progressUnit on types saved before the field existed', () => {
        const saved: ContentTypeConfig[] = [
            { id: 'book', label: 'Book', icon: 'book-open', color: '#8b5cf6', fields: ['progress'] },
            { id: 'custom', label: 'Custom', icon: 'package', color: '#fff', fields: [] },
        ];
        const out = effectiveContentTypes(saved);
        expect(out[0].progressUnit).toBe('pages');
        expect(out[1].progressUnit).toBe('units');
        // The user's own values survive untouched.
        expect(out[0].label).toBe('Book');
    });

    it('deep-copies default fields so callers cannot mutate the constant', () => {
        const first = effectiveContentTypes([]);
        const len = first[0].fields.length;
        first[0].fields.push('year');
        expect(effectiveContentTypes([])[0].fields).toHaveLength(len);
    });
});

describe('resolveContentType', () => {
    const types = effectiveContentTypes([]);

    it('finds a type by id', () => {
        expect(resolveContentType(types, 'movie').label).toBe('Movie');
    });

    it('falls back to "other" for an unknown id', () => {
        expect(resolveContentType(types, 'zzz').id).toBe('other');
    });

    it('synthesises a default when even "other" is missing', () => {
        const r = resolveContentType([], 'podcast');
        expect(r.label).toBe('Podcast');
        expect(r.icon).toBe('package');
    });
});

describe('typeShowsField', () => {
    const types = effectiveContentTypes([]);
    it('reflects each type’s fields array', () => {
        expect(typeShowsField(resolveContentType(types, 'book'), 'creator')).toBe(true);
        // Movies use the no-progress preset.
        expect(typeShowsField(resolveContentType(types, 'movie'), 'progress')).toBe(false);
    });
});

describe('slugifyTypeId', () => {
    it('makes a filesystem-safe slug from a label', () => {
        expect(slugifyTypeId('Board Games!')).toBe('board-games');
        expect(slugifyTypeId('  Comics  ')).toBe('comics');
        expect(slugifyTypeId('Sci-Fi / Fantasy')).toBe('sci-fi-fantasy');
    });
});
