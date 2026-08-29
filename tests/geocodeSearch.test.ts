import { describe, it, expect } from 'vitest';
import { preferredPlace, searchLanguage } from '../src/services/geocode';
import type { GeoPlace } from '../src/services/geocode';

const place = (name: string): GeoPlace => ({ lat: 1, lon: 2, name });

describe('searchLanguage', () => {
    it('reads the script rather than the interface', () => {
        // THE bug this guards. With `language=en` the provider returns nothing
        // at all for "Махачкала" — so a person whose Obsidian is in English
        // could not type a Russian city name, which is not a preference but a
        // dead end.
        expect(searchLanguage('Махачкала', 'en')).toBe('ru');
        expect(searchLanguage('Ставр', 'en')).toBe('ru');
    });

    it('leaves Latin to the interface, since too many languages share it', () => {
        expect(searchLanguage('Stavropol', 'en')).toBe('en');
        expect(searchLanguage('Stavropol', 'ru')).toBe('ru');
        expect(searchLanguage('', 'ru')).toBe('ru');
    });

    it('knows the other scripts that name their own language', () => {
        expect(searchLanguage('北京', 'en')).toBe('zh');
        expect(searchLanguage('東京', 'en')).toBe('zh'); // shared Han block
        expect(searchLanguage('とうきょう', 'en')).toBe('ja');
        expect(searchLanguage('서울', 'en')).toBe('ko');
        expect(searchLanguage('मुंबई', 'en')).toBe('hi');
    });

    it('takes the script from anywhere in the query', () => {
        expect(searchLanguage('Нью-Йорк', 'en')).toBe('ru');
    });
});

describe('preferredPlace', () => {
    const global = place('Stavropol');
    const override = place('Istanbul');

    it('prefers a module’s own override', () => {
        expect(preferredPlace(override, global)).toBe(override);
    });

    it('falls back to the plugin-wide location', () => {
        expect(preferredPlace(null, global)).toBe(global);
        expect(preferredPlace(undefined, global)).toBe(global);
    });

    it('is null when neither is set, so callers ask instead of guessing', () => {
        expect(preferredPlace(null, null)).toBeNull();
        expect(preferredPlace(undefined, undefined)).toBeNull();
    });
});
