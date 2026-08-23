import { describe, it, expect } from 'vitest';
import { dueCountdown } from '../src/core/dueCountdown';
import { translate, translatePlural, type Locale, type Translator } from '../src/core/i18n';

/**
 * A real translator rather than a stub, so these cases double as a check that
 * the `date.left.*` / `date.due.*` keys actually exist in both dictionaries —
 * a missing key resolves to the key itself, which every assertion below catches.
 */
function makeT(locale: Locale): Translator {
    const t = ((key: string, params?: Record<string, string | number>) =>
        translate(locale, key, params)) as Translator;
    t.plural = (key, count, params) => translatePlural(locale, key, count, params);
    t.locale = locale;
    return t;
}

const ru = makeT('ru');
const en = makeT('en');

/** 15 June 2025, 18:00 local. */
const at = (h: number, m = 0, s = 0) => new Date(2025, 5, 15, h, m, s);

describe('dueCountdown', () => {
    it('has nothing to count down to without a deadline', () => {
        expect(dueCountdown(undefined, ru, at(18))).toBeNull();
        expect(dueCountdown('', ru, at(18))).toBeNull();
    });

    it('rejects malformed dates instead of treating them as today', () => {
        // daysBetweenIso returns 0 for unparseable input, which without the
        // shape check would render junk as "due today".
        expect(dueCountdown('not-a-date', ru, at(18))).toBeNull();
        expect(dueCountdown('2025-6-15', ru, at(18))).toBeNull();
    });

    it('counts hours left when the deadline is today', () => {
        const d = dueCountdown('2025-06-15', ru, at(18));
        expect(d).toEqual({
            text: '6 ч',
            tone: 'today',
            title: expect.stringContaining('15 июня'),
        });
    });

    it('switches to minutes inside the last hour', () => {
        expect(dueCountdown('2025-06-15', ru, at(23, 40))?.text).toBe('20 мин');
    });

    it('never reads as zero while the day is still running', () => {
        expect(dueCountdown('2025-06-15', ru, at(23, 59, 30))?.text).toBe('1 мин');
    });

    it('reports a passed deadline as negative days', () => {
        const d = dueCountdown('2025-06-12', ru, at(18));
        expect(d?.text).toBe('−3 д');
        expect(d?.tone).toBe('overdue');
        expect(d?.title).toContain('12 июня');
    });

    it('grades upcoming deadlines by urgency', () => {
        expect(dueCountdown('2025-06-16', ru, at(18))).toMatchObject({ text: '1 д', tone: 'soon' });
        expect(dueCountdown('2025-06-17', ru, at(18))).toMatchObject({ text: '2 д', tone: 'soon' });
        expect(dueCountdown('2025-06-18', ru, at(18))).toMatchObject({ text: '3 д', tone: 'later' });
    });

    it('names the year only when the deadline is in another one', () => {
        expect(dueCountdown('2025-06-20', ru, at(18))?.title).not.toContain('2025');
        expect(dueCountdown('2026-02-01', ru, at(18))?.title).toContain('2026');
    });

    it('localises both the unit and the date', () => {
        expect(dueCountdown('2025-06-18', en, at(18))?.text).toBe('3d');
        expect(dueCountdown('2025-06-18', en, at(18))?.title).toContain('June 18');
        expect(dueCountdown('2025-06-12', en, at(18))?.text).toBe('−3d');
    });

    it('is unaffected by the hour on any day but today', () => {
        // Only the "today" branch reads the clock; a whole-day count must not
        // drift as the evening wears on.
        expect(dueCountdown('2025-06-18', ru, at(0, 1))?.text).toBe('3 д');
        expect(dueCountdown('2025-06-18', ru, at(23, 59))?.text).toBe('3 д');
    });
});
