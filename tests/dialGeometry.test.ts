import { describe, it, expect } from 'vitest';
import {
    clampRate,
    dialAngles,
    dialPoint,
    nearestTurn,
} from '../src/modules/journal/components/dialGeometry';

describe('dialAngles', () => {
    it('puts the first tracker at the top', () => {
        expect(dialAngles(1)).toEqual([-90]);
        expect(dialAngles(4)[0]).toBe(-90);
    });

    it('spaces them evenly, clockwise', () => {
        expect(dialAngles(4)).toEqual([-90, 0, 90, 180]);
    });

    // Top and bottom, not left and right: the first tracker is *the* first one,
    // and a ring that starts somewhere else has to be read before it is used.
    it('puts two trackers at top and bottom', () => {
        expect(dialAngles(2)).toEqual([-90, 90]);
    });

    it('has nothing to place for an empty journal', () => {
        expect(dialAngles(0)).toEqual([]);
        expect(dialAngles(-3)).toEqual([]);
    });
});

describe('dialPoint', () => {
    const round = (n: number) => Math.round(n * 1000) / 1000;

    it('places the top slot straight above the centre', () => {
        const p = dialPoint(-90, 40);
        expect(round(p.x)).toBe(0);
        expect(round(p.y)).toBe(-40);
    });

    it('runs clockwise', () => {
        const p = dialPoint(0, 40);
        expect(round(p.x)).toBe(40);
        expect(round(p.y)).toBe(0);
    });

    it('keeps every slot on the circle', () => {
        for (const angle of dialAngles(5)) {
            const { x, y } = dialPoint(angle, 40);
            expect(round(Math.hypot(x, y))).toBe(40);
        }
    });
});

describe('nearestTurn', () => {
    it('goes forward when forward is nearer', () => {
        expect(nearestTurn(-90, 0)).toBe(0);
    });

    it('goes backward when backward is nearer', () => {
        expect(nearestTurn(0, -90)).toBe(-90);
    });

    // The whole reason this exists. Wrapping from the last tracker to the first
    // is 30° forwards; a normalised angle would send the mark 330° backwards.
    it('takes the short way across the wrap', () => {
        const last = 240;
        const firstSlot = -90; // normalises to 270
        const next = nearestTurn(last, firstSlot);
        expect(next).toBe(270);
        expect(Math.abs(next - last)).toBeLessThanOrEqual(180);
    });

    it('keeps accumulating instead of snapping back', () => {
        // Four trackers, cycled twice round: the rotation should have grown by
        // two full turns rather than returned to where it started.
        const slots = dialAngles(4);
        let angle = slots[0];
        for (let i = 1; i <= 8; i++) angle = nearestTurn(angle, slots[i % 4]);
        expect(angle).toBe(slots[0] + 720);
    });

    it('never asks for more than half a turn at a time', () => {
        const slots = dialAngles(7);
        let angle = slots[0];
        for (let i = 1; i < 20; i++) {
            const next = nearestTurn(angle, slots[i % 7]);
            expect(Math.abs(next - angle)).toBeLessThanOrEqual(180);
            angle = next;
        }
    });
});

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
