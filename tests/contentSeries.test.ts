import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../src/store/contentSlice';
import {
    compareParts,
    findSeries,
    groupSeries,
    partsOf,
    partTitle,
    seriesKey,
    seriesProgress,
    suggestSeriesName,
} from '../src/modules/content/services/series';
import {
    parseImport,
    planImport,
    planImportSeries,
    splitGoodreadsTitle,
} from '../src/modules/content/services/contentImport';
import { normalizeContentItem } from '../src/modules/content/services/contentFormat';

let n = 0;
function item(title: string, over: Partial<ContentItem> = {}): ContentItem {
    const filePath = `${title}-${n++}.md`;
    return { id: filePath, filePath, title, status: 'backlog', rating: 0, tags: [], type: 'anime', ...over };
}

/** Titles as an Anixart export has them, with an original name each. */
const ANIXART: [string, string?][] = [
    ['Адский рай', 'Jigokuraku'],
    ['Адский рай 2', 'Jigokuraku 2'],
    ['Бездомный Бог', 'Noragami'],
    ['Бездомный Бог 2', 'Noragami Aragoto'],
    ['Блич', 'Bleach'],
    ['Вайолет Эвергарден', 'Violet Evergarden'],
    ['Вайолет Эвергарден: Вечность и призрак пера', 'Violet Evergarden Gaiden: Eien to Jidou Shuki Ningyou'],
    ['Вайолет Эвергарден. Фильм', 'Violet Evergarden Movie'],
    ['Академия клинка: День святого Валентина', 'Chuukou Ikkan!! Kimetsu Gakuen Monogatari: Valentine-hen'],
    ['Клинок, рассекающий демонов'],
    ['Клинок, рассекающий демонов: Бесконечный поезд'],
    ['Клинок, рассекающий демонов: Деревня кузнецов'],
    ['Мастера меча онлайн', 'Sword Art Online'],
    ['Мастера меча онлайн ТВ-2', 'Sword Art Online TV-2'],
    ['Мастера Меча Онлайн: Альтернативная «Призрачная пуля»', 'Sword Art Online Alternative: Gun Gale Online'],
    ['Мастера меча онлайн: Порядковый ранг', 'Gekijouban Sword Art Online: Ordinal Scale'],
    ['Монстр', 'Monster'],
    ['Непризнанный школой владыка демонов!', 'Maou Gakuin no Futekigousha'],
    ['Непризнанный школой владыка демонов! 2'],
    ['Реинкарнация безработного: История о приключениях в другом мире', 'Mushoku Tensei: Isekai Ittara Honki Dasu'],
    ['Реинкарнация безработного: История о приключениях в другом мире. Часть 2', 'Mushoku Tensei: Isekai Ittara Honki Dasu Part 2'],
    ['Судьба/Ночь схватки', 'Fate/stay night'],
    ['Судьба/Ночь схватки: Прикосновение небес', "Gekijouban Fate/Stay Night: Heaven's Feel"],
    ['Судьба/Ночь схватки: Прикосновение небес 2'],
    ['За Гранью', 'Kyoukai no Kanata'],
    ['За гранью: Спецвыпуски', 'Kyoukai no Kanata: Mini Gekijou'],
    ['Иная', 'Another'],
];

const library = () => ANIXART.map(([title, original]) => item(title, { aliases: original ? [original] : undefined }));

describe('finding series', () => {
    const proposals = findSeries(library());
    const byName = Object.fromEntries(proposals.map((p) => [p.name, p.joining.map((i) => i.title)]));

    it('puts each part with the title it continues', () => {
        expect(byName['Адский рай']).toEqual(['Адский рай', 'Адский рай 2']);
        expect(byName['Вайолет Эвергарден']).toHaveLength(3);
        expect(byName['Мастера меча онлайн']).toHaveLength(4);
        expect(byName['Непризнанный школой владыка демонов!']).toHaveLength(2);
        expect(byName['Реинкарнация безработного: История о приключениях в другом мире']).toHaveLength(2);
        // Letter case and "ё" do not split a series.
        expect(byName['За Гранью']).toEqual(['За Гранью', 'За гранью: Спецвыпуски']);
    });

    it('folds a series inside a series into the outer one', () => {
        expect(byName['Судьба/Ночь схватки']).toEqual([
            'Судьба/Ночь схватки',
            'Судьба/Ночь схватки: Прикосновение небес',
            'Судьба/Ночь схватки: Прикосновение небес 2',
        ]);
        expect(byName['Судьба/Ночь схватки: Прикосновение небес']).toBeUndefined();
    });

    it('leaves alone what only looks alike', () => {
        const all = proposals.flatMap((p) => p.joining.map((i) => i.title));
        expect(all).not.toContain('Блич');
        expect(all).not.toContain('Иная');
        expect(all).not.toContain('Монстр');
        // Shares a word with the demon slayer, not a title.
        expect(all).not.toContain('Академия клинка: День святого Валентина');
        expect(proposals).toHaveLength(9);
    });

    it('never reads a longer word as a part', () => {
        const found = findSeries([item('Monster'), item('Monster Hunter'), item('Monsters: 1')]);
        expect(found).toEqual([]);
    });

    it('recognises a part by its original name when the translated ones differ', () => {
        const found = findSeries([
            item('Бездомный Бог', { aliases: ['Noragami'] }),
            item('Норагами: Арагото', { aliases: ['Noragami: Aragoto'] }),
        ]);
        expect(found[0]?.joining.map((i) => i.title)).toEqual(['Бездомный Бог', 'Норагами: Арагото']);
    });

    it('adds new parts to a series that already exists, and moves nothing', () => {
        const found = findSeries([
            item('Sword Art Online', { series: 'SAO' }),
            item('Sword Art Online: Progressive'),
            item('Bleach', { series: 'Bleach' }),
        ]);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ name: 'SAO' });
        expect(found[0].joining.map((i) => i.title)).toEqual(['Sword Art Online: Progressive']);
        expect(found[0].already.map((i) => i.title)).toEqual(['Sword Art Online']);
    });

    it('names the series after its first part when later parts carry the same alias', () => {
        // Anixart lists the series' own name among a later season's alternatives.
        const first = item('Клинок, рассекающий демонов', { aliases: ['Kimetsu no Yaiba'] });
        const village = item('Клинок, рассекающий демонов: Деревня кузнецов', {
            aliases: ['Kimetsu no Yaiba: Katanakaji no Sato-hen', 'Kimetsu no Yaiba'],
        });
        const castle = item('Клинок: Бесконечный замок', { aliases: ['Kimetsu no Yaiba Movie 1: Mugenjou-hen'] });
        const found = findSeries([village, castle, first]);
        expect(found).toHaveLength(1);
        expect(found[0].name).toBe('Клинок, рассекающий демонов');
        expect(found[0].joining).toEqual([village, castle, first]);
    });

    it('takes the base of the part’s own type when an anime and a manga share a title', () => {
        const manga = item('Клинок, рассекающий демонов', { type: 'manga' });
        const anime = item('Клинок, рассекающий демонов', { type: 'anime' });
        const part = item('Клинок, рассекающий демонов: Бесконечный поезд', { type: 'anime' });
        const [found] = findSeries([manga, anime, part]);
        expect(found.joining).toContain(anime);
        expect(found.joining).not.toContain(manga);
    });
});

describe('a series', () => {
    it('is everything carrying its name, however it is spelled', () => {
        const groups = groupSeries([
            item('A', { series: 'Sword Art Online' }),
            item('B', { series: 'sword art online' }),
            item('C', { series: 'Sword Art Online' }),
            item('D'),
        ]);
        expect([...groups.values()]).toHaveLength(1);
        const [group] = groups.values();
        expect(group.name).toBe('Sword Art Online');
        expect(group.items).toHaveLength(3);
        expect(seriesKey('Sword Art Online!')).toBe(group.key);
    });

    it('lists the parts: a place set by hand, then the year, then the titles', () => {
        const name = 'Моя геройская академия';
        const parts = [
            item('Моя геройская академия: Два героя'),
            item('Моя геройская академия 10'),
            item('Моя геройская академия 2'),
            item('Моя геройская академия'),
            item('Моя геройская академия ТВ-3'),
        ];
        const sorted = [...parts].sort((a, b) => compareParts(a, b, name)).map((i) => i.title);
        expect(sorted).toEqual([
            'Моя геройская академия',
            'Моя геройская академия 2',
            'Моя геройская академия ТВ-3',
            'Моя геройская академия 10',
            'Моя геройская академия: Два героя',
        ]);

        const placed = [
            item('Later', { seriesOrder: 2 }),
            item('First', { seriesOrder: 1 }),
            item('Unplaced', { year: 1990 }),
        ];
        expect([...placed].sort((a, b) => compareParts(a, b, 'X')).map((i) => i.title)).toEqual([
            'First',
            'Later',
            'Unplaced',
        ]);
    });

    it('lists a part by what sets it apart from the others', () => {
        const name = 'Мастера меча онлайн';
        expect(partTitle('Мастера Меча Онлайн: Алисизация — Война Андерворлда', name)).toBe(
            'Алисизация — Война Андерворлда'
        );
        expect(partTitle('Мастера меча онлайн ТВ-2', name)).toBe('ТВ-2');
        expect(partTitle('Мастера меча онлайн', name)).toBe('Мастера меча онлайн');
        expect(partTitle('Sword Art Online Progressive', name)).toBe('Sword Art Online Progressive');
    });

    it('counts how far through it is', () => {
        const parts = [
            item('1', { status: 'completed' }),
            item('2', { status: 'completed' }),
            item('3', { status: 'dropped' }),
            item('4', { status: 'backlog' }),
        ];
        expect(seriesProgress(parts)).toMatchObject({ done: 2, total: 4 });
    });

    it('finds its parts by key', () => {
        const items = [item('A', { series: 'Fate' }), item('B', { series: 'fate' }), item('C', { series: 'Other' })];
        expect(partsOf(items, seriesKey('Fate')).map((i) => i.title)).toEqual(['A', 'B']);
    });

    it('offers a name from what the picked titles share', () => {
        expect(
            suggestSeriesName([
                item('Mushoku Tensei 2'),
                item('Mushoku Tensei: Eris the Goblin Slayer'),
                item('Mushoku Tensei'),
            ])
        ).toBe('Mushoku Tensei');
        expect(suggestSeriesName([item('Mushoku Tensei II'), item('Mushoku Tensei Isekai')])).toBe(
            'Mushoku Tensei'
        );
        expect(suggestSeriesName([item('Dune'), item('Arrival')])).toBe('Dune');
        expect(suggestSeriesName([item('A'), item('B', { series: 'Named' })])).toBe('Named');
    });

    it('is read from the note and written back', () => {
        const parsed = normalizeContentItem(
            { title: 'X', type: 'anime', series: 'Fate', seriesOrder: 3 },
            'X',
            'X.md',
            ''
        );
        expect(parsed).toMatchObject({ series: 'Fate', seriesOrder: 3 });
        expect(normalizeContentItem({ title: 'X', type: 'anime' }, 'X', 'X.md', '')?.series).toBeUndefined();
    });
});

describe('Goodreads series', () => {
    it('takes the series and its number out of the title', () => {
        expect(splitGoodreadsTitle('The Name of the Wind (The Kingkiller Chronicle, #1)')).toEqual({
            title: 'The Name of the Wind',
            series: 'The Kingkiller Chronicle',
            order: 1,
        });
        expect(splitGoodreadsTitle('The Colour of Magic (Discworld, #1; Rincewind #1)')).toMatchObject({
            series: 'Discworld',
            order: 1,
        });
        expect(splitGoodreadsTitle('Harry Potter Boxed Set (Harry Potter, #1-7)')).toMatchObject({
            title: 'Harry Potter Boxed Set',
            order: 1,
        });
        expect(splitGoodreadsTitle('Novella (Series, #2.5)').order).toBe(2.5);
        expect(splitGoodreadsTitle('Catch-22 (Paperback)')).toEqual({ title: 'Catch-22 (Paperback)' });
    });

    const CSV = [
        'Title,Author,My Rating,Exclusive Shelf,Number of Pages',
        '"The Name of the Wind (The Kingkiller Chronicle, #1)",Patrick Rothfuss,5,read,662',
        '"The Wise Man\'s Fear (The Kingkiller Chronicle, #2)",Patrick Rothfuss,4,to-read,994',
    ].join('\n');
    const TYPES = { anime: 'anime', manga: 'manga', book: 'book', movie: 'movie' };

    it('still knows a book imported with the series in its title', () => {
        const result = parseImport(CSV, TYPES)!;
        const old = item('The Name of the Wind (The Kingkiller Chronicle, #1)', { type: 'book', status: 'completed' });
        const plan = planImport(result, [old]);
        expect(plan.create.map((i) => i.title)).toEqual(["The Wise Man's Fear"]);
        expect(plan.same).toBe(1);
    });

    it('puts new books into their series', () => {
        const result = parseImport(CSV, TYPES)!;
        const plan = planImport(result, []);
        const series = planImportSeries(plan, []);
        expect([...series.assign.values()]).toEqual([
            { series: 'The Kingkiller Chronicle', seriesOrder: 1 },
            { series: 'The Kingkiller Chronicle', seriesOrder: 2 },
        ]);
        expect(series.count).toBe(1);
    });
});

describe('Anixart names with commas in them', () => {
    it('keeps a name whole when the list separator also sits inside it', () => {
        const csv = [
            '#,Русское название,Оригинальное название,Альтернативные названия,Добавлено в избранное,Статус просмотра',
            '40,"Клинок, рассекающий демонов: Бесконечный поезд","Kimetsu no Yaiba Movie","Клинок, рассекающий демонов: Поезд «Бесконечный», Истребитель демонов: Бесконечный поезд, Demon Slayer",Не добавлено,Просмотрено',
        ].join('\n');
        const result = parseImport(csv, { anime: 'anime', manga: 'manga', book: 'book', movie: 'movie' })!;
        expect(result.items[0].aliases).toEqual([
            'Kimetsu no Yaiba Movie',
            'Клинок, рассекающий демонов: Поезд «Бесконечный»',
            'Истребитель демонов: Бесконечный поезд',
            'Demon Slayer',
        ]);
    });
});

describe('series an import brings', () => {
    it('groups new parts, and brings in the library item they continue', () => {
        const base = item('Адский рай', { aliases: ['Jigokuraku'] });
        const unrelatedPair = [item('Лагерь'), item('Лагерь 2')];
        const plan = {
            create: [
                { title: 'Адский рай 2', type: 'anime', status: 'backlog' as const, rating: 0, tags: [] },
                { title: 'Монстр', type: 'anime', status: 'backlog' as const, rating: 0, tags: [] },
            ],
            update: [],
            same: 0,
        };
        const series = planImportSeries(plan, [base, ...unrelatedPair]);
        expect(series.assign.get(0)).toEqual({ series: 'Адский рай' });
        expect(series.assign.has(1)).toBe(false);
        expect(series.join).toEqual([{ item: base, series: 'Адский рай' }]);
        // Two library items alone are not the import's to group.
        expect(series.count).toBe(1);
    });
});
