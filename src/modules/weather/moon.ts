/**
 * Moon phase, computed locally.
 *
 * Open-Meteo publishes no lunar data, and no second provider is worth a network
 * request for something this predictable: the synodic month is regular enough
 * that counting forward from a known new moon lands within a few hours of the
 * truth for any date a forecast widget will ever show.
 *
 * What we deliberately do NOT derive is moonrise and moonset. Those depend on
 * latitude and lunar orbital inclination and cannot be had from the phase
 * alone, so the panel shows the phase and says nothing about rise times rather
 * than showing a confident wrong number.
 */

/** Mean length of one lunation, in days. */
const SYNODIC_DAYS = 29.530588853;

/** A known new moon: 6 January 2000, 18:14 UTC. */
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);

const MS_PER_DAY = 86_400_000;

export const MOON_PHASES = [
    'new',
    'waxingCrescent',
    'firstQuarter',
    'waxingGibbous',
    'full',
    'waningGibbous',
    'lastQuarter',
    'waningCrescent',
] as const;

export type MoonPhaseName = (typeof MOON_PHASES)[number];

export interface MoonPhaseInfo {
    /** Position in the lunation, 0–1. 0 = new, 0.5 = full. */
    fraction: number;
    /** Days since the last new moon. */
    ageDays: number;
    /** Lit portion of the disc, 0–1. */
    illumination: number;
    phase: MoonPhaseName;
    /** Growing towards full. Decides which limb is lit. */
    waxing: boolean;
}

export function moonPhase(at: Date = new Date()): MoonPhaseInfo {
    const days = (at.getTime() - NEW_MOON_EPOCH_MS) / MS_PER_DAY;
    // Modulo twice: JS keeps the sign of the dividend, so dates before the
    // epoch would otherwise come back negative.
    const ageDays = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
    const fraction = ageDays / SYNODIC_DAYS;

    return {
        fraction,
        ageDays,
        // The terminator sweeps the disc sinusoidally, so illumination is not
        // linear in age — a "half" moon is at a quarter of the month.
        illumination: (1 - Math.cos(2 * Math.PI * fraction)) / 2,
        // Eight equal bins centred on their named phase, so "full" spans the
        // days either side of the exact moment rather than one instant.
        phase: MOON_PHASES[Math.floor(fraction * 8 + 0.5) % 8],
        waxing: fraction < 0.5,
    };
}

/**
 * Horizontal radius of the terminator ellipse, as a signed fraction of the
 * disc radius. The sign says which way the ellipse bulges, which is what turns
 * a crescent into a gibbous; magnitude 1 is new or full, 0 is a half moon.
 */
export function terminatorRatio(fraction: number): number {
    return Math.cos(2 * Math.PI * fraction);
}

/**
 * Whether the lit limb should be drawn on the right.
 *
 * A waxing moon lights from the right in the northern hemisphere and from the
 * left in the southern one. Getting this backwards is the kind of detail that
 * tells anyone who looks up that the widget is decorative.
 */
export function litOnRight(waxing: boolean, latitude: number): boolean {
    return latitude >= 0 ? waxing : !waxing;
}

/**
 * Days from a position in the lunation forward to the next time the moon
 * reaches `target` (0 = new, 0.5 = full).
 *
 * Always forwards: the wrap is what makes "three days after full" answer
 * "twenty-six days until the next full moon" rather than a negative number.
 */
export function daysUntilPhase(fraction: number, target: number): number {
    const ahead = (((target - fraction) % 1) + 1) % 1;
    return ahead * SYNODIC_DAYS;
}

export interface NextMoonPhase {
    /** Only the two anyone waits for. */
    phase: 'new' | 'full';
    days: number;
}

/** Whichever of the new or full moon comes first, and how far off it is. */
export function nextNamedPhase(fraction: number): NextMoonPhase {
    const toNew = daysUntilPhase(fraction, 0);
    const toFull = daysUntilPhase(fraction, 0.5);
    return toFull <= toNew ? { phase: 'full', days: toFull } : { phase: 'new', days: toNew };
}
