import { describe, expect, it } from 'vitest';
import {
    hexToHsv,
    hexToRgb,
    hsvToHex,
    normalizeHex,
    rgbToHex,
} from '../src/components/ui/fields/colorMath';

/**
 * The colour picker stores hex and draws HSV, so every drag goes through these
 * conversions twice. A rounding slip here is a colour that creeps each time
 * the picker is opened and closed without touching anything.
 */

describe('normalizeHex', () => {
    it('accepts the forms people type', () => {
        expect(normalizeHex('#7C6CFF')).toBe('#7c6cff');
        expect(normalizeHex('7c6cff')).toBe('#7c6cff');
        expect(normalizeHex(' #abc ')).toBe('#aabbcc');
        expect(normalizeHex('abc')).toBe('#aabbcc');
    });

    it('refuses anything that is not a whole code', () => {
        expect(normalizeHex('#7c6cf')).toBeNull();
        expect(normalizeHex('#zzzzzz')).toBeNull();
        expect(normalizeHex('')).toBeNull();
        expect(normalizeHex('red')).toBeNull();
    });
});

describe('hex ↔ rgb', () => {
    it('reads the channels', () => {
        expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    });

    it('writes them back, rounded and clamped', () => {
        expect(rgbToHex({ r: 255, g: 127.6, b: -4 })).toBe('#ff8000');
    });
});

describe('hex ↔ hsv', () => {
    it('puts the primaries where the hue strip draws them', () => {
        expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
        expect(hexToHsv('#00ff00')?.h).toBe(120);
        expect(hexToHsv('#0000ff')?.h).toBe(240);
    });

    it('reads a grey as no saturation, whatever the hue', () => {
        const grey = hexToHsv('#808080');
        expect(grey?.s).toBe(0);
        expect(grey?.v).toBeCloseTo(128 / 255, 5);
    });

    it('survives the round trip for every preset and a few awkward ones', () => {
        const colours = [
            '#ef4444',
            '#7c6cff',
            '#10b981',
            '#6b7280',
            '#000000',
            '#ffffff',
            '#010203',
            '#fefdfc',
        ];
        for (const hex of colours) {
            const hsv = hexToHsv(hex);
            expect(hsv).not.toBeNull();
            expect(hsvToHex(hsv!)).toBe(hex);
        }
    });

    it('wraps a hue of 360 round to red', () => {
        expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    });

    it('keeps any hue at zero brightness black', () => {
        expect(hsvToHex({ h: 210, s: 0.7, v: 0 })).toBe('#000000');
    });
});
