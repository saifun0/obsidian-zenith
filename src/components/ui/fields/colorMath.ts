/**
 * The arithmetic behind the colour picker. Pure, so it is tested on its own.
 *
 * The picker works in HSV because that is the shape of what it draws: a hue
 * strip, and a square whose x is saturation and whose y is brightness. What it
 * stores is a hex code, because that is what settings and notes hold. The two
 * are not interchangeable — every grey is one hex code but a whole row of HSV
 * values, one per hue — which is why the picker keeps its own HSV while it is
 * open instead of re-deriving it from the hex after every move: dragging the
 * square down to black and back up would otherwise forget which hue it was on.
 */

/** Hue in degrees (0–360); saturation and value 0–1. */
export interface Hsv {
    h: number;
    s: number;
    v: number;
}

/** Channels 0–255. */
export interface Rgb {
    r: number;
    g: number;
    b: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** `#abc`, `abc`, `#aabbcc` and `aabbcc` as `#aabbcc`; anything else as null. */
export function normalizeHex(raw: string): string | null {
    const text = raw.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(text)) {
        return `#${text
            .split('')
            .map((c) => c + c)
            .join('')}`;
    }
    return /^[0-9a-f]{6}$/.test(text) ? `#${text}` : null;
}

export function hexToRgb(hex: string): Rgb | null {
    const norm = normalizeHex(hex);
    if (!norm) return null;
    const n = parseInt(norm.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
    const part = (c: number) =>
        Math.round(clamp(c, 0, 255))
            .toString(16)
            .padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
    const hue = ((h % 360) + 360) % 360;
    const sat = clamp(s, 0, 1);
    const val = clamp(v, 0, 1);
    const c = val * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = val - c;

    const [r, g, b] =
        hue < 60
            ? [c, x, 0]
            : hue < 120
              ? [x, c, 0]
              : hue < 180
                ? [0, c, x]
                : hue < 240
                  ? [0, x, c]
                  : hue < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsv(hex: string): Hsv | null {
    const rgb = hexToRgb(hex);
    return rgb ? rgbToHsv(rgb) : null;
}

export function hsvToHex(hsv: Hsv): string {
    return rgbToHex(hsvToRgb(hsv));
}
