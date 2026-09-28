import { describe, expect, it } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import {
    DEFAULT_CONTENT_TYPES,
    effectiveContentTypes,
    isTypeShown,
    visibleContentTypes,
} from '../src/core/contentTypes';
import { localizeType, STATUS_ORDER, statusLabel } from '../src/modules/content/contentLabels';
import { parseImport, planImport } from '../src/modules/content/services/contentImport';
import { findSameItem } from '../src/modules/content/services/contentDuplicates';
import { normalizeContentItem } from '../src/modules/content/services/contentFormat';
import { shortUnit } from '../src/modules/content/services/progress';
import type { ContentItem } from '../src/store/contentSlice';

const ru = translatorFor('ru');
const en = translatorFor('en');

function item(over: Partial<ContentItem>): ContentItem {
    return {
        id: over.filePath ?? 'a.md',
        title: 'A',
        status: 'backlog',
        rating: 0,
        tags: [],
        type: 'anime',
        filePath: over.filePath ?? 'a.md',
        ...over,
    };
}

describe('types', () => {
    it('starts with shows, games, music and other switched off', () => {
        const hidden = DEFAULT_CONTENT_TYPES.filter((t) => t.hidden).map((t) => t.id);
        expect(hidden).toEqual(['show', 'game', 'music', 'other']);
        expect(visibleContentTypes(effectiveContentTypes([])).map((t) => t.id)).toEqual([
            'book',
            'movie',
            'anime',
            'manga',
        ]);
    });

    it('hides only the items of a type that exists and is switched off', () => {
        const types = effectiveContentTypes([]);
        expect(isTypeShown(types, 'game')).toBe(false);
        expect(isTypeShown(types, 'anime')).toBe(true);
        // A type nobody configured still shows its items, as "other" looks.
        expect(isTypeShown(types, 'podcast')).toBe(true);
    });

    it('speaks the reader’s language for a built-in type nobody renamed', () => {
        const book = localizeType(ru, DEFAULT_CONTENT_TYPES[0]);
        expect(book).toMatchObject({
            label: 'Книга',
            creatorLabel: 'Автор',
            progressUnit: 'страниц',
        });
        expect(shortUnit(book.progressUnit)).toBe('стр.');
        expect(localizeType(en, DEFAULT_CONTENT_TYPES[0]).label).toBe('Book');
    });

    it('keeps what the user wrote', () => {
        const renamed = {
            ...DEFAULT_CONTENT_TYPES[0],
            label: 'Книжки',
            creatorLabel: 'Писатель',
            progressUnit: 'листов',
        };
        expect(localizeType(ru, renamed)).toMatchObject({
            label: 'Книжки',
            creatorLabel: 'Писатель',
            progressUnit: 'листов',
        });
    });
});

describe('statuses in words', () => {
    it('lists the library in the order it is lived in', () => {
        expect(STATUS_ORDER).toEqual(['in-progress', 'on-hold', 'backlog', 'completed', 'dropped']);
    });

    it('takes the type’s verb for the two statuses that are verbs', () => {
        expect(statusLabel(ru, 'in-progress', 'book')).toBe('Читаю');
        expect(statusLabel(ru, 'completed', 'anime')).toBe('Просмотрено');
        expect(statusLabel(ru, 'in-progress', 'game')).toBe('Играю');
        expect(statusLabel(ru, 'completed', 'music')).toBe('Прослушано');
        expect(statusLabel(ru, 'backlog', 'book')).toBe('В планах');
        expect(statusLabel(ru, 'on-hold', 'anime')).toBe('Отложено');
    });

    it('stays general without a type, or for one the user made', () => {
        expect(statusLabel(ru, 'in-progress')).toBe('В процессе');
        expect(statusLabel(ru, 'completed', 'podcast')).toBe('Завершено');
        expect(statusLabel(en, 'backlog')).toBe('Planned');
    });
});

const ANIXART = [
    '#,Русское название,Оригинальное название,Альтернативные названия,Добавлено в избранное,Статус просмотра',
    '1,"Адский рай","Jigokuraku","Hell\'s Paradise: Jigokuraku, Paradition, Heavenhell",Не добавлено,Просмотрено',
    '5,"Бездомный Бог","Noragami",Не указаны,Добавлено,В планах',
    '7,"Блич","Bleach",Не указаны,Добавлено,Смотрю',
    '50,"Летний призрак","Summer Ghost","Project Common",Добавлено,Отложено',
    '96,"Реинкарнация безработного. Часть 2","Mushoku Tensei Part 2","Mushoku Tensei: Jobless Reincarnation Part 2",Добавлено,Не смотрю',
    '120,"","","",Не добавлено,Смотрю',
].join('\n');

const TYPES = { anime: 'anime', manga: 'manga', book: 'book', movie: 'movie' };

describe('Anixart bookmarks', () => {
    const result = parseImport(ANIXART, TYPES);

    it('is recognised by its own columns', () => {
        expect(result?.format).toBe('anixart');
        expect(result?.items).toHaveLength(5);
        expect(result?.skipped).toBe(1);
    });

    it('takes the Russian title, and keeps the others as aliases', () => {
        expect(result?.items[0]).toMatchObject({
            title: 'Адский рай',
            type: 'anime',
            aliases: ['Jigokuraku', "Hell's Paradise: Jigokuraku", 'Paradition', 'Heavenhell'],
        });
        // "Не указаны" is Anixart for none.
        expect(result?.items[1].aliases).toEqual(['Noragami']);
    });

    it('maps each of its five statuses', () => {
        expect(result?.items.map((i) => i.status)).toEqual([
            'completed',
            'backlog',
            'in-progress',
            'on-hold',
            'dropped',
        ]);
    });

    it('brings favourites across, and no dates, score or progress', () => {
        expect(result?.items.map((i) => !!i.favorite)).toEqual([false, true, true, true, true]);
        expect(result?.items[0]).toMatchObject({ rating: 0 });
        expect(result?.items[0].finished).toBeUndefined();
        expect(result?.items[0].progress).toBeUndefined();
    });
});

describe('a second import', () => {
    const result = parseImport(ANIXART, TYPES)!;

    it('knows an item by any of its names', () => {
        const library = [item({ title: 'Bleach', filePath: 'Bleach.md' })];
        expect(findSameItem(library, ['Блич', 'Bleach'])?.filePath).toBe('Bleach.md');
        const aliased = [item({ title: 'Бездомный Бог', aliases: ['Noragami'], filePath: 'n.md' })];
        expect(findSameItem(aliased, ['Noragami'])?.filePath).toBe('n.md');
        expect(findSameItem(library, ['Naruto'])).toBeNull();
    });

    it('sorts the export into new, updated and already so', () => {
        const library = [
            // Moved on in the export: planned here, watching there.
            item({ title: 'Bleach', status: 'backlog', favorite: true, filePath: 'b.md' }),
            // Exactly as the export has it.
            item({ title: 'Бездомный Бог', status: 'backlog', favorite: true, filePath: 'n.md' }),
            // Finished here, but the export still says "watching" — backward.
            item({ title: 'Адский рай', status: 'completed', filePath: 'j.md' }),
        ];
        const edited = {
            ...result,
            items: result.items.map((i) =>
                i.title === 'Адский рай' ? { ...i, status: 'in-progress' as const } : i
            ),
        };
        const plan = planImport(edited, library);

        expect(plan.create.map((i) => i.title)).toEqual([
            'Летний призрак',
            'Реинкарнация безработного. Часть 2',
        ]);
        expect(plan.same).toBe(1);
        const byTitle = Object.fromEntries(plan.update.map((u) => [u.item.title, u]));
        expect(byTitle.Bleach).toMatchObject({ status: 'in-progress', backward: false });
        expect(byTitle['Адский рай']).toMatchObject({ status: 'in-progress', backward: true });
    });

    it('takes the favourite mark only from a source that has one', () => {
        const library = [
            item({ title: 'Блич', status: 'in-progress', favorite: false, filePath: 'b.md' }),
        ];
        const plan = planImport(result, library);
        expect(plan.update.find((u) => u.item.filePath === 'b.md')).toMatchObject({
            favorite: true,
        });
    });
});

describe('the note', () => {
    it('reads a favourite and other names', () => {
        const parsed = normalizeContentItem(
            { title: 'Блич', type: 'anime', favorite: true, aliases: ['Bleach'] },
            'Блич',
            'Блич.md',
            ''
        );
        expect(parsed).toMatchObject({ favorite: true, aliases: ['Bleach'] });
    });

    it('reads on hold as a status of its own', () => {
        const parsed = normalizeContentItem(
            { title: 'X', type: 'anime', status: 'on-hold' },
            'X',
            'X.md',
            ''
        );
        expect(parsed?.status).toBe('on-hold');
    });
});
