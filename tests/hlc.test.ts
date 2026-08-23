import { describe, it, expect } from 'vitest';
import {
    MAX_DRIFT_MS,
    compare,
    encode,
    isAfter,
    next,
    parse,
    receive,
    zero,
    type Hlc,
} from '../src/modules/sync/hlc';

describe('next', () => {
    it('starts at the wall clock', () => {
        expect(next(null, 1000, 'a')).toEqual({ wall: 1000, counter: 0, node: 'a' });
    });

    it('advances the wall clock and resets the counter', () => {
        const first = next(null, 1000, 'a');
        expect(next(first, 2000, 'a')).toEqual({ wall: 2000, counter: 0, node: 'a' });
    });

    it('ticks the counter when two edits land in the same millisecond', () => {
        const first = next(null, 1000, 'a');
        const second = next(first, 1000, 'a');
        const third = next(second, 1000, 'a');
        expect(second.counter).toBe(1);
        expect(third.counter).toBe(2);
        expect(isAfter(third, second)).toBe(true);
    });

    it('never moves backwards when the OS clock does', () => {
        // NTP correction, resume from sleep, someone changing the timezone.
        const first = next(null, 5000, 'a');
        const afterJumpBack = next(first, 1000, 'a');
        expect(afterJumpBack.wall).toBe(5000);
        expect(isAfter(afterJumpBack, first)).toBe(true);
    });
});

describe('receive', () => {
    it('makes the next local stamp sort after the remote one', () => {
        const remote: Hlc = { wall: 9000, counter: 3, node: 'b' };
        const merged = receive({ wall: 1000, counter: 0, node: 'a' }, remote, 1001, 'a');
        expect(isAfter(merged, remote)).toBe(true);
    });

    it('takes the highest counter when both clocks read the same millisecond', () => {
        const local: Hlc = { wall: 5000, counter: 2, node: 'a' };
        const remote: Hlc = { wall: 5000, counter: 7, node: 'b' };
        expect(receive(local, remote, 5000, 'a')).toEqual({ wall: 5000, counter: 8, node: 'a' });
    });

    it('resets the counter once real time has moved past both', () => {
        const local: Hlc = { wall: 1000, counter: 5, node: 'a' };
        const remote: Hlc = { wall: 1000, counter: 9, node: 'b' };
        expect(receive(local, remote, 8000, 'a')).toEqual({ wall: 8000, counter: 0, node: 'a' });
    });

    it('clamps a device whose clock is implausibly far ahead', () => {
        // Without the cap this one stamp wins every conflict on every device
        // for the next decade, and the user just watches edits revert.
        const remote: Hlc = { wall: 1000 + MAX_DRIFT_MS * 100, counter: 0, node: 'b' };
        const merged = receive(zero('a'), remote, 1000, 'a');
        expect(merged.wall).toBe(1000 + MAX_DRIFT_MS);
    });

    it('still accepts the edit it clamped', () => {
        // Refusing it would lose data; clamping only refuses the clock.
        const remote: Hlc = { wall: MAX_DRIFT_MS * 50, counter: 4, node: 'b' };
        const merged = receive(zero('a'), remote, 1000, 'a');
        expect(merged.counter).toBeGreaterThanOrEqual(0);
        expect(merged.node).toBe('a');
    });
});

describe('compare', () => {
    it('orders by wall, then counter, then node', () => {
        expect(compare({ wall: 1, counter: 9, node: 'z' }, { wall: 2, counter: 0, node: 'a' })).toBe(-1);
        expect(compare({ wall: 2, counter: 0, node: 'z' }, { wall: 2, counter: 1, node: 'a' })).toBe(-1);
        expect(compare({ wall: 2, counter: 1, node: 'a' }, { wall: 2, counter: 1, node: 'b' })).toBe(-1);
    });

    it('is 0 only for the identical stamp', () => {
        expect(compare({ wall: 2, counter: 1, node: 'a' }, { wall: 2, counter: 1, node: 'a' })).toBe(0);
    });

    it('breaks ties the same way on both devices', () => {
        // The node tiebreak is what stops two devices merging the same pair of
        // stamps and converging on different winners.
        const a: Hlc = { wall: 100, counter: 0, node: 'alpha' };
        const b: Hlc = { wall: 100, counter: 0, node: 'beta' };
        expect(compare(a, b)).toBe(-1);
        expect(compare(b, a)).toBe(1);
    });
});

describe('encode / parse', () => {
    it('round-trips', () => {
        const h: Hlc = { wall: 1731000000000, counter: 42, node: 'device-x' };
        expect(parse(encode(h))).toEqual(h);
    });

    it('sorts lexicographically in the same order as compare', () => {
        // Fixed-width padding is the whole point: unpadded, "9-" sorts after
        // "10-" and any ordering done by a plain string sort is silently wrong.
        const stamps: Hlc[] = [
            { wall: 9, counter: 0, node: 'a' },
            { wall: 10, counter: 0, node: 'a' },
            { wall: 10, counter: 9, node: 'a' },
            { wall: 10, counter: 10, node: 'a' },
            { wall: 2000, counter: 0, node: 'a' },
        ];
        const byCompare = [...stamps].sort(compare);
        const byString = [...stamps].sort((x, y) => (encode(x) < encode(y) ? -1 : 1));
        expect(byString).toEqual(byCompare);
    });

    it('returns null for anything malformed rather than throwing', () => {
        // These come out of a JSON file the user can edit and sync can mangle.
        for (const bad of ['', 'nonsense', '123-456', null, undefined, 42, {}, 'zzzzzzzzzzzz-0000-a']) {
            expect(parse(bad)).toBeNull();
        }
    });

    it('clamps a counter past the encodable range instead of overflowing', () => {
        const encoded = encode({ wall: 1000, counter: 0xffffff, node: 'a' });
        expect(parse(encoded)?.counter).toBe(0xffff);
    });
});
