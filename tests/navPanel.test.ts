import { describe, it, expect } from 'vitest';
import {
    DEFAULT_PANEL_BUTTONS,
    applyOrder,
    moveItem,
    normalizePanelButtons,
} from '../src/modules/navigator/panel';
import { navigatorTranslations } from '../src/modules/navigator/i18n';
import { mergeStrategyOf } from '../src/modules/sync/statePolicy';

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe('applyOrder', () => {
    it('lists items in the saved order', () => {
        expect(ids(applyOrder(items('a', 'b', 'c'), ['c', 'a', 'b']))).toEqual(['c', 'a', 'b']);
    });

    it('puts items the order does not name after it, in their own order', () => {
        // A module installed after the order was saved: its view shows up
        // rather than waiting to be found.
        expect(ids(applyOrder(items('a', 'new', 'b', 'c'), ['c', 'a']))).toEqual([
            'c',
            'a',
            'new',
            'b',
        ]);
    });

    it('skips ids nothing has any more', () => {
        expect(ids(applyOrder(items('a', 'b'), ['gone', 'b', 'a']))).toEqual(['b', 'a']);
    });

    it('keeps the items own order when nothing was arranged', () => {
        expect(ids(applyOrder(items('a', 'b'), []))).toEqual(['a', 'b']);
    });
});

describe('moveItem', () => {
    it('moves an item down and up', () => {
        expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('clamps a target past either end', () => {
        expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
        expect(moveItem(['a', 'b', 'c'], 2, -4)).toEqual(['c', 'a', 'b']);
    });

    it('leaves the list alone for an index that is not in it', () => {
        expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    });

    it('does not change the list it was given', () => {
        const list = ['a', 'b'];
        moveItem(list, 0, 1);
        expect(list).toEqual(['a', 'b']);
    });
});

describe('normalizePanelButtons', () => {
    it('gives a config with no buttons yet the defaults, as copies', () => {
        const buttons = normalizePanelButtons(undefined);
        expect(buttons).toEqual(DEFAULT_PANEL_BUTTONS);
        expect(buttons[0]).not.toBe(DEFAULT_PANEL_BUTTONS[0]);
    });

    it('keeps an emptied panel empty', () => {
        expect(normalizePanelButtons([])).toEqual([]);
    });

    it('drops what is not a button, and a command listed twice', () => {
        expect(
            normalizePanelButtons([
                { command: 'app:go-back', label: '  Back ', icon: 'arrow-left' },
                null,
                'zenith:search',
                { label: 'no command' },
                { command: '' },
                { command: 'app:go-back', label: 'again' },
                { command: 'zenith:search', label: '   ', icon: 5 },
            ])
        ).toEqual([
            { command: 'app:go-back', label: 'Back', icon: 'arrow-left' },
            { command: 'zenith:search' },
        ]);
    });
});

describe('side panel settings', () => {
    it('merges the arranged lists as one decision', () => {
        expect(mergeStrategyOf('navigatorOrder')).toBe('lww');
        expect(mergeStrategyOf('navigatorPanelButtons')).toBe('lww');
    });

    it('has every string in both languages', () => {
        const en = Object.keys(navigatorTranslations.en ?? {}).sort();
        const ru = Object.keys(navigatorTranslations.ru ?? {}).sort();
        expect(ru).toEqual(en);
    });
});
