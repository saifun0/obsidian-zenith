import { describe, it, expect } from 'vitest';
import { CARD_NAME_KEY, MAX_CARD_NAME, cardNameOf } from '../src/modules/dashboard/widgetConfig';

/**
 * What the board knows about a card apart from the widget on it.
 *
 * A card's bucket in `widgetConfig` is the widget's to read; the few keys the
 * board keeps there are read here, from the same untrusted `data.json`.
 */

describe('a card’s own name', () => {
    it('is empty for a card nobody named', () => {
        expect(cardNameOf({}, 'picture.text')).toBe('');
        expect(cardNameOf({ 'picture.text': { text: 'hello' } }, 'picture.text')).toBe('');
    });

    it('is the name given, without the spaces around it', () => {
        const all = { 'picture.text#2': { [CARD_NAME_KEY]: '  Goals  ' } };
        expect(cardNameOf(all, 'picture.text#2')).toBe('Goals');
    });

    it('belongs to the copy it was given to, not to the widget', () => {
        const all = { 'picture.text#2': { [CARD_NAME_KEY]: 'Goals' } };
        expect(cardNameOf(all, 'picture.text')).toBe('');
    });

    it('treats a name of spaces as no name', () => {
        expect(cardNameOf({ a: { [CARD_NAME_KEY]: '   ' } }, 'a')).toBe('');
    });

    it('ignores anything that is not text, and cuts what is too long for a header', () => {
        expect(cardNameOf({ a: { [CARD_NAME_KEY]: 42 } }, 'a')).toBe('');
        const long = 'x'.repeat(MAX_CARD_NAME + 20);
        expect(cardNameOf({ a: { [CARD_NAME_KEY]: long } }, 'a')).toHaveLength(MAX_CARD_NAME);
    });
});
