import { describe, it, expect } from 'vitest';
import { clampRate } from '../src/modules/journal/components/trackerWindow';

describe('clampRate', () => {
    it('passes a real share through', () => {
        expect(clampRate(0.37)).toBeCloseTo(0.37);
    });

    // Both ends come from parsing notes: a day counted twice would report more
    // of the window than the window has, and a missing window would report NaN.
    it('refuses to report more than the whole window', () => {
        expect(clampRate(1.4)).toBe(1);
        expect(clampRate(-0.2)).toBe(0);
        expect(clampRate(Number.NaN)).toBe(0);
        expect(clampRate(Number.POSITIVE_INFINITY)).toBe(0);
    });
});
