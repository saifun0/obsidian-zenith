// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal } from '../src/components/shared/Modal';

/**
 * A dialog takes the focus once, when it opens.
 *
 * It used to take it on every render. The effect that focuses the first field
 * named `onClose` as a dependency, and nearly every caller passes an arrow
 * written in place — a new function each time the form re-renders, which is
 * each keystroke. Typing in a tag, a note or a subtask of the task editor sent
 * the cursor back to the title after every character.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Two things Obsidian adds to the page that the dialog leans on.
(globalThis as { activeDocument?: Document }).activeDocument = document;
(HTMLElement.prototype as { setCssStyles?: (styles: Record<string, string>) => void }).setCssStyles =
    function (this: HTMLElement, styles: Record<string, string>) {
        Object.assign(this.style, styles);
    };

let host: HTMLElement;
let root: Root;

/** Past the dialog's own `setTimeout(…, 0)`. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

function dialog(onClose: () => void): React.ReactElement {
    return React.createElement(
        Modal,
        { title: 'Dialog', onClose },
        React.createElement('textarea', { 'data-field': 'title' }),
        React.createElement('input', { 'data-field': 'tag' })
    );
}

const field = (name: string) => document.querySelector<HTMLElement>(`[data-field="${name}"]`);

describe('Modal', () => {
    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('focuses the first field when it opens', async () => {
        act(() => root.render(dialog(() => {})));
        await settle();
        expect(document.activeElement).toBe(field('title'));
    });

    it('leaves the focus where it is when the form re-renders', async () => {
        act(() => root.render(dialog(() => {})));
        await settle();

        field('tag')?.focus();
        expect(document.activeElement).toBe(field('tag'));

        // What a keystroke does: the parent renders again and hands over a
        // new `onClose`.
        act(() => root.render(dialog(() => {})));
        await settle();

        expect(document.activeElement).toBe(field('tag'));
    });

    it('closes with the latest onClose, not the one it opened with', async () => {
        const first = vi.fn();
        const latest = vi.fn();
        act(() => root.render(dialog(first)));
        act(() => root.render(dialog(latest)));
        await settle();

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(latest).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});
