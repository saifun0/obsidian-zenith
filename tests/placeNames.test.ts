import { describe, it, expect } from 'vitest';
import {
    cyrillicFromLatin,
    displayName,
    matchLevel,
    nameSkeleton,
    tidyRegion,
} from '../src/services/placeNames';
import { rankHits, placeLabel, type GeocodeHit } from '../src/services/geocode';

describe('cyrillicFromLatin', () => {
    it('reverses the romanisation the geocoder uses', () => {
        expect(cyrillicFromLatin('Stavropol’')).toBe('Ставрополь');
        expect(cyrillicFromLatin('Yekaterinburg')).toBe('Екатеринбург');
        expect(cyrillicFromLatin('Mineral’nyye Vody')).toBe('Минеральные Воды');
        expect(cyrillicFromLatin('Tol’yatti')).toBe('Тольятти');
        expect(cyrillicFromLatin('Kaspiysk')).toBe('Каспийск');
        expect(cyrillicFromLatin('Novyy Urengoy')).toBe('Новый Уренгой');
        expect(cyrillicFromLatin('Yoshkar-Ola')).toBe('Йошкар-Ола');
        expect(cyrillicFromLatin('Elista')).toBe('Элиста');
        expect(cyrillicFromLatin('Rostov-na-Donu')).toBe('Ростов-на-Дону');
        expect(cyrillicFromLatin('Shchyolkovo')).toBe('Щёлково');
        expect(cyrillicFromLatin('Kyakhta')).toBe('Кяхта');
    });

    // A name with a letter the system never writes is not a Russian name, and
    // inventing a Cyrillic one for it would be worse than showing it as is.
    it('refuses names that are not romanised Russian', () => {
        expect(cyrillicFromLatin('Córdoba')).toBeNull();
        expect(cyrillicFromLatin('Washington')).toBeNull();
        expect(cyrillicFromLatin('Chicago')).toBeNull();
    });
});

describe('displayName', () => {
    // THE bug: "Ставрополь" typed, the city came back as "Stavropol’" — the one
    // Latin row among Russian ones, on the one row that was the city.
    it('shows a Cyrillic query its answer in Cyrillic', () => {
        expect(displayName('Stavropol’', 'Ставрополь')).toBe('Ставрополь');
        expect(displayName('Stavropol’', 'ставр')).toBe('Ставрополь');
    });

    it('keeps the romanisation when reversing it disagrees with the query', () => {
        // "ts" reverses to ц; the query says т+с. Typed in full, the query wins.
        expect(displayName('Bratsk', 'Братск')).toBe('Братск');
        // Typed in part, nothing can be trusted, so it stays as the provider said.
        expect(displayName('Bratsk', 'Братс')).toBe('Bratsk');
    });

    it('leaves Latin queries and Cyrillic answers alone', () => {
        expect(displayName('Stavropol’', 'Stavropol')).toBe('Stavropol’');
        expect(displayName('Ставрово', 'Ставр')).toBe('Ставрово');
    });
});

describe('matchLevel', () => {
    it('compares literally within one script', () => {
        expect(matchLevel('Краснодар', 'краснодар')).toBe(0);
        expect(matchLevel('Краснодарка', 'Краснодар')).toBe(1);
        // Skeletons would drop the ы and call this exact.
        expect(matchLevel('Ставры', 'Ставр')).toBe(1);
    });

    it('compares by skeleton across scripts', () => {
        expect(matchLevel('Казань', 'Kazan')).toBe(0);
        expect(matchLevel('Екатеринбург', 'Yekat')).toBe(1);
        expect(nameSkeleton('Pyatigorsk')).toBe(nameSkeleton('Пятигорск'));
    });
});

describe('tidyRegion', () => {
    it('lowercases the generic word the provider capitalised', () => {
        expect(tidyRegion('Ростовская Область')).toBe('Ростовская область');
        expect(tidyRegion('Краснодарский край')).toBe('Краснодарский край');
        expect(tidyRegion('Республика Татарстан')).toBe('Республика Татарстан');
        expect(tidyRegion(undefined)).toBeUndefined();
    });
});

/** Open-Meteo's answer for "Ставрополь", language=ru, trimmed to what matters. */
const STAVROPOL: GeocodeHit[] = [
    { name: 'Stavropol’', feature_code: 'PPLA', population: 433931, admin1: 'Ставрополье', country_code: 'RU', latitude: 45.03442, longitude: 41.9642 },
    { name: 'Ставрополь', feature_code: 'PPL', admin1: 'Ростовская Область', country_code: 'RU', latitude: 46.61722, longitude: 42.25806 },
    { name: 'Ставрополь', feature_code: 'PPL', admin1: 'Актюбинская Область', country_code: 'KZ', latitude: 49.25, longitude: 56.35 },
    { name: 'Ставрополь', feature_code: 'AIRP', admin1: 'Ставрополье', country_code: 'RU', latitude: 45.10916, longitude: 42.11278 },
    { name: 'Ставропольский', feature_code: 'PPL', admin1: 'Ставрополье', country_code: 'RU', latitude: 44.94556, longitude: 43.55028 },
    { name: 'Ставропольская Возвышенность', feature_code: 'UPLD', admin1: 'Ставрополье', country_code: 'RU', latitude: 45.00417, longitude: 42.98028 },
];

describe('rankHits', () => {
    it('puts the city first, in Russian, and drops its airport and upland', () => {
        const ranked = rankHits(STAVROPOL, 'Ставрополь');
        expect(ranked.map((c) => c.place.name)).toEqual([
            'Ставрополь',
            'Ставрополь',
            'Ставрополь',
            'Ставропольский',
        ]);
        expect(ranked[0]).toMatchObject({ population: 433931, place: { admin1: 'Ставрополье' } });
        expect(ranked[1].place.admin1).toBe('Ростовская область');
    });

    it('ranks a Latin query by what it means, not how it is spelled', () => {
        const hits: GeocodeHit[] = [
            { name: 'Kazan', feature_code: 'PPLA2', population: 23889, country_code: 'TR', latitude: 40.2, longitude: 32.7 },
            { name: 'Казань', feature_code: 'PPLA', population: 1243500, country_code: 'RU', latitude: 55.79, longitude: 49.12 },
        ];
        expect(rankHits(hits, 'Kazan')[0].place.name).toBe('Казань');
    });

    it('folds two rows for one place into one', () => {
        const hits: GeocodeHit[] = [
            { name: 'Нальчик', feature_code: 'PPLA', population: 239300, admin1: 'Кабардино-Балкария', country_code: 'RU', latitude: 43.498, longitude: 43.618 },
            { name: 'Нальчик', feature_code: 'PPL', admin1: 'Кабардино-Балкария', country_code: 'RU', latitude: 43.51, longitude: 43.63 },
        ];
        expect(rankHits(hits, 'Нальчик')).toHaveLength(1);
    });

    // Weather on a mountain is a fair thing to want.
    it('offers other features when no settlement matches', () => {
        const hits: GeocodeHit[] = [
            { name: 'Эльбрус', feature_code: 'MT', country_code: 'RU', latitude: 43.35, longitude: 42.44 },
        ];
        expect(rankHits(hits, 'Эльбрус')).toHaveLength(1);
    });
});

describe('placeLabel', () => {
    it('does not repeat a name that is its own region', () => {
        expect(placeLabel({ lat: 0, lon: 0, name: 'Москва', admin1: 'Москва', country: 'RU' })).toBe(
            'Москва, RU'
        );
    });
});
