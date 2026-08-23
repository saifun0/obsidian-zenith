import { describe, it, expect } from 'vitest';
import { findDuplicates, normalizeTitle } from '../src/modules/content/services/contentDuplicates';
import type { ContentItem } from '../src/store/contentSlice';

function item(title: string, over: Partial<ContentItem> = {}): ContentItem {
    return {
        id: title,
        title,
        status: 'backlog',
        rating: 0,
        tags: [],
        type: 'anime',
        filePath: `${title}.md`,
        ...over,
    };
}

describe('normalizeTitle', () => {
    it('folds case, punctuation and spacing', () => {
        expect(normalizeTitle('WALL·E')).toBe(normalizeTitle('Wall-E'));
        expect(normalizeTitle('  The   Matrix!  ')).toBe('matrix');
    });

    it('folds ё to е so both spellings match', () => {
        expect(normalizeTitle('Ёжик в тумане')).toBe(normalizeTitle('Ежик в тумане'));
    });

    it('drops a leading article', () => {
        expect(normalizeTitle('The Great Gatsby')).toBe('great gatsby');
        expect(normalizeTitle('A Clockwork Orange')).toBe('clockwork orange');
    });

    it('keeps an article that is part of the word', () => {
        expect(normalizeTitle('Theatre')).toBe('theatre');
    });

    it('keeps Cyrillic titles intact', () => {
        expect(normalizeTitle('Мастер и Маргарита')).toBe('мастер и маргарита');
    });
});

describe('findDuplicates', () => {
    const library = [
        item('Bleach'),
        item('Bleach: Thousand-Year Blood War'),
        item('Мастер и Маргарита', { type: 'book' }),
    ];

    it('finds an exact match regardless of punctuation', () => {
        const hits = findDuplicates(library, 'bleach!', 'anime');
        expect(hits[0]).toMatchObject({ kind: 'exact' });
        expect(hits[0].item.title).toBe('Bleach');
    });

    it('flags a longer title starting with the same words as similar', () => {
        const hits = findDuplicates(library, 'Bleach', 'anime');
        expect(hits.map((h) => h.kind)).toEqual(['exact', 'similar']);
    });

    it('sorts exact matches first', () => {
        const hits = findDuplicates([item('Bleach: Thousand-Year Blood War'), item('Bleach')], 'Bleach', 'anime');
        expect(hits[0].kind).toBe('exact');
    });

    it('does not fuzzy-match across types — a book and its film share a title on purpose', () => {
        // The exact "Bleach" still surfaces: an identical title is worth seeing
        // whatever the type. Only the prefix match is type-scoped.
        const hits = findDuplicates(library, 'Bleach', 'book');
        expect(hits.map((h) => h.kind)).toEqual(['exact']);
    });

    it('still reports an exact match across types', () => {
        const hits = findDuplicates(library, 'Мастер и Маргарита', 'movie');
        expect(hits).toHaveLength(1);
        expect(hits[0].kind).toBe('exact');
    });

    it('ignores prefixes too short to mean anything', () => {
        const hits = findDuplicates([item('It Follows'), item('It: Chapter Two')], 'It', 'anime');
        expect(hits).toEqual([]);
    });

    it('requires a word boundary, not a bare prefix', () => {
        // "Ring" must not drag in "Ringworld".
        expect(findDuplicates([item('Ringworld')], 'Ring', 'anime')).toEqual([]);
    });

    it('returns nothing for an empty title', () => {
        expect(findDuplicates(library, '   ', 'anime')).toEqual([]);
    });
});
