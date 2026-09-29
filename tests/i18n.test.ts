import { describe, it, expect } from 'vitest';
import {
    DICTS,
    intlLocale,
    pluralForm,
    translate,
    translatePlural,
    resolveLocale,
} from '../src/core/i18n';
import { mockLanguage } from './mocks/obsidian';

describe('dictionary parity', () => {
    // Counted nouns are stored one key per plural form, and the two languages
    // legitimately need different forms: English has one/other, Russian has
    // one/few/many. So parity is about the BASE key — comparing raw key lists
    // would report every Russian `.few` as an orphan.
    const PLURAL_SUFFIX = /\.(one|few|many|other)$/;

    const split = (dict: Record<string, string>) => {
        const plain = new Set<string>();
        const plural = new Set<string>();
        for (const key of Object.keys(dict)) {
            if (PLURAL_SUFFIX.test(key)) plural.add(key.replace(PLURAL_SUFFIX, ''));
            else plain.add(key);
        }
        return { plain, plural };
    };

    const en = split(DICTS.en);
    const ru = split(DICTS.ru);
    const missingFrom = (a: Set<string>, b: Set<string>) => [...a].filter((k) => !b.has(k)).sort();

    it('translates every English string into Russian', () => {
        // `translate` falls back to English before giving up, so a missing
        // Russian string is invisible at runtime — it just renders in English
        // inside an otherwise Russian interface.
        expect(missingFrom(en.plain, ru.plain)).toEqual([]);
        expect(missingFrom(en.plural, ru.plural)).toEqual([]);
    });

    it('has no Russian strings without an English original', () => {
        // A key only Russian defines is almost always a typo in one of the two.
        expect(missingFrom(ru.plain, en.plain)).toEqual([]);
        expect(missingFrom(ru.plural, en.plural)).toEqual([]);
    });

    it('defines every plural form each language actually uses', () => {
        // `pluralForm` can return `few`/`many` for Russian and `one`/`other`
        // for English; a form that is reachable but undefined falls through to
        // the English catch-all mid-sentence.
        const missing: string[] = [];
        for (const base of en.plural) {
            for (const form of ['one', 'other']) {
                if (DICTS.en[`${base}.${form}`] === undefined) missing.push(`en:${base}.${form}`);
            }
        }
        for (const base of ru.plural) {
            for (const form of ['one', 'few', 'many']) {
                if (DICTS.ru[`${base}.${form}`] === undefined) missing.push(`ru:${base}.${form}`);
            }
        }
        expect(missing).toEqual([]);
    });

    const zh = split(DICTS.zh);

    it('translates every English string into Chinese', () => {
        expect(missingFrom(en.plain, zh.plain)).toEqual([]);
        expect(missingFrom(en.plural, zh.plural)).toEqual([]);
        expect(missingFrom(zh.plain, en.plain)).toEqual([]);
        expect(missingFrom(zh.plural, en.plural)).toEqual([]);
    });

    it('gives each counted Chinese string its one form, and only that', () => {
        // Chinese does not inflect for number, so `pluralForm` always says
        // `other`; a `one` there would never be read.
        const wrong = Object.keys(DICTS.zh).filter((k) => /\.(one|few|many)$/.test(k));
        const missing = [...zh.plural].filter((b) => DICTS.zh[`${b}.other`] === undefined);
        expect(wrong).toEqual([]);
        expect(missing).toEqual([]);
    });

    it('keeps every placeholder of the English in the Russian and the Chinese', () => {
        // A `{count}` lost in translation prints nothing where the number was;
        // one misspelt prints itself.
        const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
        const base = (k: string) => k.replace(PLURAL_SUFFIX, '');
        const english = new Map<string, string>();
        for (const [k, v] of Object.entries(DICTS.en)) english.set(base(k), names(v));
        const differ: string[] = [];
        for (const locale of ['ru', 'zh'] as const) {
            for (const [k, v] of Object.entries(DICTS[locale])) {
                const want = english.get(base(k));
                if (want !== undefined && names(v) !== want) differ.push(`${locale}:${k}`);
            }
        }
        expect(differ).toEqual([]);
    });
});

describe('pluralForm', () => {
    it('splits English into one / other', () => {
        expect(pluralForm('en', 1)).toBe('one');
        expect(pluralForm('en', 0)).toBe('other');
        expect(pluralForm('en', 2)).toBe('other');
        expect(pluralForm('en', 21)).toBe('other');
    });

    it('follows the Russian one/few/many rules', () => {
        // 1, 21, 31 … but not 11
        expect(pluralForm('ru', 1)).toBe('one');
        expect(pluralForm('ru', 21)).toBe('one');
        expect(pluralForm('ru', 101)).toBe('one');
        expect(pluralForm('ru', 11)).toBe('many');

        // 2–4, 22–24 … but not 12–14
        expect(pluralForm('ru', 2)).toBe('few');
        expect(pluralForm('ru', 4)).toBe('few');
        expect(pluralForm('ru', 23)).toBe('few');
        expect(pluralForm('ru', 12)).toBe('many');
        expect(pluralForm('ru', 14)).toBe('many');

        // everything else
        expect(pluralForm('ru', 0)).toBe('many');
        expect(pluralForm('ru', 5)).toBe('many');
        expect(pluralForm('ru', 100)).toBe('many');
    });

    it('has one form for Chinese', () => {
        expect(pluralForm('zh', 1)).toBe('other');
        expect(pluralForm('zh', 5)).toBe('other');
        expect(translatePlural('zh', 'common.items', 1)).toBe('1 项');
    });

    it('treats negatives and fractions by magnitude', () => {
        expect(pluralForm('ru', -1)).toBe('one');
        expect(pluralForm('ru', 2.4)).toBe('few');
    });
});

describe('translate', () => {
    it('substitutes placeholders', () => {
        expect(translate('en', 'content.summary.inProgress', { count: 3 })).toContain('3');
    });

    it('falls back to English, then to the key itself', () => {
        expect(translate('ru', 'definitely.not.a.key')).toBe('definitely.not.a.key');
    });

    it('leaves unknown placeholders alone rather than printing "undefined"', () => {
        expect(translate('en', 'definitely.not.a.key {nope}')).toBe('definitely.not.a.key {nope}');
    });
});

describe('translatePlural', () => {
    it('picks the Russian form that matches the count', () => {
        expect(translatePlural('ru', 'common.items', 1)).toBe('1 элемент');
        expect(translatePlural('ru', 'common.items', 3)).toBe('3 элемента');
        expect(translatePlural('ru', 'common.items', 9)).toBe('9 элементов');
        expect(translatePlural('ru', 'common.items', 11)).toBe('11 элементов');
    });

    it('picks the English form', () => {
        expect(translatePlural('en', 'common.items', 1)).toBe('1 item');
        expect(translatePlural('en', 'common.items', 9)).toBe('9 items');
    });
});

describe('resolveLocale', () => {
    it('honours an explicit choice', () => {
        expect(resolveLocale('ru')).toBe('ru');
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('zh')).toBe('zh');
    });

    it('names each locale for Intl', () => {
        expect(intlLocale('ru')).toBe('ru-RU');
        expect(intlLocale('zh')).toBe('zh-CN');
        expect(intlLocale('en')).toBe('en-US');
        expect(intlLocale('en', 'en-GB')).toBe('en-GB');
    });

    it("follows Obsidian's language on auto, and English for anything else", () => {
        try {
            mockLanguage.value = 'ru';
            expect(resolveLocale('auto')).toBe('ru');
            mockLanguage.value = 'zh';
            expect(resolveLocale('auto')).toBe('zh');
            mockLanguage.value = 'zh-TW';
            expect(resolveLocale('auto')).toBe('zh');
            mockLanguage.value = 'de';
            expect(resolveLocale('auto')).toBe('en');
        } finally {
            mockLanguage.value = 'en';
        }
    });
});
