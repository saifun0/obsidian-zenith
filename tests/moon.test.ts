import { describe, it, expect } from 'vitest';
import {
    daysUntilPhase,
    litOnRight,
    moonPhase,
    nextNamedPhase,
    terminatorRatio,
} from '../src/modules/weather/moon';

/** A known new moon, used as the reference point by the implementation. */
const NEW_MOON = new Date(Date.UTC(2000, 0, 6, 18, 14));
const SYNODIC_MS = 29.530588853 * 86_400_000;

describe('moonPhase', () => {
    it('reads the reference new moon as new and dark', () => {
        const m = moonPhase(NEW_MOON);
        expect(m.phase).toBe('new');
        expect(m.ageDays).toBeCloseTo(0, 5);
        expect(m.illumination).toBeCloseTo(0, 5);
    });

    it('reads half a lunation later as full and lit', () => {
        const m = moonPhase(new Date(NEW_MOON.getTime() + SYNODIC_MS / 2));
        expect(m.phase).toBe('full');
        expect(m.illumination).toBeCloseTo(1, 5);
    });

    it('puts the quarters at a quarter and three quarters, half lit', () => {
        const first = moonPhase(new Date(NEW_MOON.getTime() + SYNODIC_MS / 4));
        expect(first.phase).toBe('firstQuarter');
        expect(first.illumination).toBeCloseTo(0.5, 5);
        expect(first.waxing).toBe(true);

        const last = moonPhase(new Date(NEW_MOON.getTime() + (SYNODIC_MS * 3) / 4));
        expect(last.phase).toBe('lastQuarter');
        expect(last.illumination).toBeCloseTo(0.5, 5);
        expect(last.waxing).toBe(false);
    });

    it('handles dates before the reference epoch', () => {
        // JS modulo keeps the dividend's sign, so this is the case that breaks
        // a naive implementation into negative ages.
        const m = moonPhase(new Date(Date.UTC(1969, 6, 20)));
        expect(m.ageDays).toBeGreaterThanOrEqual(0);
        expect(m.ageDays).toBeLessThan(29.531);
        expect(m.illumination).toBeGreaterThanOrEqual(0);
        expect(m.illumination).toBeLessThanOrEqual(1);
    });

    it('repeats exactly one lunation later', () => {
        const a = moonPhase(new Date(2025, 5, 15));
        const b = moonPhase(new Date(new Date(2025, 5, 15).getTime() + SYNODIC_MS));
        expect(b.fraction).toBeCloseTo(a.fraction, 6);
        expect(b.phase).toBe(a.phase);
    });

    it('stays inside its ranges across a whole lunation', () => {
        for (let i = 0; i < 60; i++) {
            const m = moonPhase(new Date(NEW_MOON.getTime() + (SYNODIC_MS * i) / 60));
            expect(m.fraction).toBeGreaterThanOrEqual(0);
            expect(m.fraction).toBeLessThan(1);
            expect(m.illumination).toBeGreaterThanOrEqual(0);
            expect(m.illumination).toBeLessThanOrEqual(1);
        }
    });
});

describe('terminatorRatio', () => {
    it('is a flat disc at new and full, and a straight edge at the quarters', () => {
        expect(terminatorRatio(0)).toBeCloseTo(1, 5);
        expect(terminatorRatio(0.5)).toBeCloseTo(-1, 5);
        expect(terminatorRatio(0.25)).toBeCloseTo(0, 5);
        expect(terminatorRatio(0.75)).toBeCloseTo(0, 5);
    });
});

describe('litOnRight', () => {
    it('flips with the hemisphere', () => {
        expect(litOnRight(true, 45)).toBe(true);
        expect(litOnRight(false, 45)).toBe(false);
        expect(litOnRight(true, -34)).toBe(false);
        expect(litOnRight(false, -34)).toBe(true);
    });

    it('treats the equator as northern rather than undefined', () => {
        expect(litOnRight(true, 0)).toBe(true);
    });
});

describe('daysUntilPhase / nextNamedPhase', () => {
    it('always counts forwards, wrapping past the end of the month', () => {
        // Three days after full, the next full moon is a whole month away.
        const justAfterFull = 0.5 + 3 / 29.530588853;
        expect(daysUntilPhase(justAfterFull, 0.5)).toBeCloseTo(29.530588853 - 3, 6);
        expect(daysUntilPhase(justAfterFull, 0)).toBeCloseTo(29.530588853 / 2 - 3, 6);
    });

    it('is zero at the phase itself, not a full month', () => {
        expect(daysUntilPhase(0, 0)).toBeCloseTo(0, 9);
        expect(daysUntilPhase(0.5, 0.5)).toBeCloseTo(0, 9);
    });

    it('names whichever of new or full comes first', () => {
        // Waxing crescent: full is ahead, new is most of a month behind.
        expect(nextNamedPhase(0.15).phase).toBe('full');
        // Waning gibbous: full has just gone, new is next.
        expect(nextNamedPhase(0.65).phase).toBe('new');
    });

    it('never looks further ahead than half a lunation', () => {
        for (let i = 0; i < 40; i++) {
            const next = nextNamedPhase(i / 40);
            expect(next.days).toBeGreaterThanOrEqual(0);
            expect(next.days).toBeLessThanOrEqual(29.530588853 / 2 + 1e-9);
        }
    });
});
