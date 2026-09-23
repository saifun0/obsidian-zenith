import { describe, it, expect } from 'vitest';
import {
    MAX_TEXT,
    RateLimiter,
    nextTrackerValue,
    oneLine,
    readUriRequest,
} from '../src/core/uri/uriRequest';

describe('readUriRequest', () => {
    it('reads an add-task link', () => {
        expect(
            readUriRequest({ action: 'zenith', do: 'add-task', text: 'Купить молоко завтра' })
        ).toEqual({
            ok: true,
            request: { kind: 'add-task', text: 'Купить молоко завтра' },
        });
    });

    it('never lets a task text start a second line in the note', () => {
        const read = readUriRequest({
            do: 'add-task',
            text: 'Buy milk\n- [ ] injected\r\n# Heading',
        });
        expect(read).toEqual({
            ok: true,
            request: { kind: 'add-task', text: 'Buy milk - [ ] injected # Heading' },
        });
    });

    it('refuses a task with no text', () => {
        expect(readUriRequest({ do: 'add-task', text: '  \n ' })).toEqual({
            ok: false,
            error: 'missing-text',
        });
    });

    it.each([
        ['+1', { op: 'add', amount: 1 }],
        ['-2', { op: 'add', amount: -2 }],
        ['+0,5', { op: 'add', amount: 0.5 }],
        ['8', { op: 'set', amount: 8 }],
        // An unencoded "+1" in a query string arrives as " 1".
        [' 1', { op: 'add', amount: 1 }],
        ['true', true],
        ['no', false],
        [undefined, { op: 'add', amount: 1 }],
    ])('reads a log value %s', (value, want) => {
        expect(readUriRequest({ do: 'log', tracker: 'water', value })).toEqual({
            ok: true,
            request: { kind: 'log', tracker: 'water', value: want },
        });
    });

    it('refuses a log with no tracker, or a value it cannot read', () => {
        expect(readUriRequest({ do: 'log', value: '+1' })).toEqual({
            ok: false,
            error: 'missing-tracker',
        });
        expect(readUriRequest({ do: 'log', tracker: 'water', value: 'lots' })).toEqual({
            ok: false,
            error: 'bad-value',
        });
    });

    it('opens the views a person would name, and nothing else', () => {
        expect(readUriRequest({ do: 'open', view: 'Calendar' })).toEqual({
            ok: true,
            request: { kind: 'open', view: 'calendar' },
        });
        expect(readUriRequest({ do: 'open' })).toEqual({
            ok: true,
            request: { kind: 'open', view: 'dashboard' },
        });
        expect(readUriRequest({ do: 'open', view: 'settings' })).toEqual({
            ok: false,
            error: 'unknown-view',
        });
    });

    it('knows only the three actions — nothing that deletes or edits', () => {
        for (const action of ['delete', 'edit', 'toggle', '', 'add-task ']) {
            const read = readUriRequest({ do: action, text: 'x' });
            if (action.trim() === 'add-task') continue;
            expect(read).toEqual({ ok: false, error: 'unknown-action' });
        }
    });
});

describe('oneLine', () => {
    it('caps the length', () => {
        expect(oneLine('a'.repeat(MAX_TEXT + 100))).toHaveLength(MAX_TEXT);
    });

    it('folds every kind of line break', () => {
        expect(oneLine('a\u2028b\u2029c\td')).toBe('a b c d');
    });
});

describe('nextTrackerValue', () => {
    it('adds to a number, never below zero', () => {
        expect(nextTrackerValue({ kind: 'number' }, 3, { op: 'add', amount: 1 })).toBe(4);
        expect(nextTrackerValue({ kind: 'number' }, undefined, { op: 'add', amount: 1 })).toBe(1);
        expect(nextTrackerValue({ kind: 'number' }, 1, { op: 'add', amount: -5 })).toBe(0);
        expect(nextTrackerValue({ kind: 'number' }, 1, { op: 'set', amount: 7.5 })).toBe(7.5);
    });

    it('keeps a scale within 1–5', () => {
        expect(nextTrackerValue({ kind: 'scale' }, 5, { op: 'add', amount: 1 })).toBe(5);
        expect(nextTrackerValue({ kind: 'scale' }, undefined, { op: 'set', amount: 3 })).toBe(3);
        expect(nextTrackerValue({ kind: 'scale' }, 2, { op: 'add', amount: -4 })).toBe(1);
    });

    it('ticks a check box from "+1" or "true", and clears it from "false"', () => {
        expect(nextTrackerValue({ kind: 'check' }, undefined, { op: 'add', amount: 1 })).toBe(true);
        expect(nextTrackerValue({ kind: 'check' }, undefined, true)).toBe(true);
        expect(nextTrackerValue({ kind: 'check' }, true, false)).toBeNull();
    });

    it('says when a value does not fit the tracker', () => {
        expect(nextTrackerValue({ kind: 'number' }, 3, true)).toBeUndefined();
    });
});

describe('RateLimiter', () => {
    it('lets a few through in a window, then none until it passes', () => {
        const limiter = new RateLimiter(3, 60_000);
        expect([0, 1, 2, 3].map((i) => limiter.take(1000 + i))).toEqual([true, true, true, false]);
        expect(limiter.take(30_000)).toBe(false);
        expect(limiter.take(61_000)).toBe(true);
    });
});
