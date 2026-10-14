// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAmount } from '../src/modules/journal/services/amountInput';
import { AmountInput } from '../src/modules/journal/components/AmountInput';

describe('what was typed into an amount', () => {
    it('is a number, with a comma or a point', () => {
        expect(parseAmount('20')).toBe(20);
        expect(parseAmount(' 60 ')).toBe(60);
        expect(parseAmount('7.5')).toBe(7.5);
        // A Russian number pad types a comma.
        expect(parseAmount('7,5')).toBe(7.5);
        expect(parseAmount('.5')).toBe(0.5);
        expect(parseAmount('0')).toBe(0);
    });

    it('keeps two decimals and no more', () => {
        expect(parseAmount('1.239')).toBe(1.24);
    });

    it('clears the day when the field was emptied', () => {
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('   ')).toBeNull();
    });

    it('is nothing at all when it is not an amount', () => {
        for (const text of ['abc', '-3', '1e3', '1.2.3', '.', '12 reps', '+5']) {
            expect(parseAmount(text), text).toBeUndefined();
        }
    });
});

describe('the amount as a field', () => {
    let host: HTMLDivElement;
    let root: Root;
    const onCommit = vi.fn();

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        onCommit.mockClear();
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    const draw = (amount: number | undefined) =>
        act(() =>
            root.render(
                React.createElement(AmountInput, {
                    amount,
                    placeholder: 'not set',
                    label: 'Exercise',
                    className: 'field',
                    onCommit,
                })
            )
        );
    const field = () => host.querySelector('input') as HTMLInputElement;
    /** Type the way React hears it: through the element's own value setter. */
    const type = (text: string) =>
        act(() => {
            field().focus();
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            set.call(field(), text);
            field().dispatchEvent(new Event('input', { bubbles: true }));
        });
    const press = (key: string) =>
        act(() => {
            field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        });

    it('shows the amount, or the placeholder where there is none', () => {
        draw(20);
        expect(field().value).toBe('20');
        draw(undefined);
        expect(field().value).toBe('');
        expect(field().placeholder).toBe('not set');
    });

    it('records what was typed on Enter, and nothing before it', () => {
        draw(20);
        type('60');
        expect(onCommit).not.toHaveBeenCalled();
        press('Enter');
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(60);
    });

    it('records on leaving the field', () => {
        draw(undefined);
        type('7,5');
        act(() => field().blur());
        expect(onCommit).toHaveBeenCalledWith(7.5);
    });

    it('clears the day when the field is emptied', () => {
        draw(20);
        type('');
        press('Enter');
        expect(onCommit).toHaveBeenCalledWith(null);
    });

    it('puts the amount back on Escape, and keeps the key to itself', () => {
        draw(20);
        const outside = vi.fn();
        document.addEventListener('keydown', outside);
        type('999');
        press('Escape');
        document.removeEventListener('keydown', outside);
        expect(onCommit).not.toHaveBeenCalled();
        expect(field().value).toBe('20');
        // A popover listening for Escape on the document does not hear this one.
        expect(outside).not.toHaveBeenCalled();
    });

    it('writes nothing for what is not an amount, or is the amount already', () => {
        draw(20);
        type('lots');
        press('Enter');
        expect(field().value).toBe('20');
        type('20');
        press('Enter');
        // Emptying a field that was empty is not a change either.
        draw(undefined);
        type('');
        press('Enter');
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('follows the amount when it changes from outside', () => {
        draw(20);
        draw(25);
        expect(field().value).toBe('25');
    });
});
