/**
 * Where the trackers stand on the dial, and how the mark gets between them.
 *
 * Pure arithmetic, kept out of the component so the two things that are easy to
 * get wrong and impossible to see in a screenshot can be tested: an angle
 * measured from the wrong zero puts every icon a quarter turn out, and a mark
 * that takes the long way round is only visible for the four hundred
 * milliseconds it is travelling.
 */

/** Slots run clockwise from the top, which is where the first tracker sits. */
const TOP_DEG = -90;

/**
 * The angle of each slot, in degrees, measured the way CSS rotates.
 *
 * Evenly spaced and starting at twelve o'clock. Two trackers land at top and
 * bottom rather than left and right: the first one is *the* first one, and a
 * ring that starts somewhere else has to be read before it can be used.
 */
export function dialAngles(count: number): number[] {
    if (count <= 0) return [];
    const step = 360 / count;
    return Array.from({ length: count }, (_, i) => TOP_DEG + i * step);
}

/**
 * A slot's position on a circle of radius `r` about the origin.
 *
 * Returned in the same units `r` came in, so the caller can hand it percentages
 * and place an icon with `left`/`top` without knowing the dial's pixel size.
 */
export function dialPoint(angleDeg: number, r: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

/**
 * The next value of a continuously accumulating rotation that lands on `target`.
 *
 * The travelling mark is one element rotated about the dial's centre, and
 * `transform: rotate()` interpolates through the number it is given. Feed it an
 * angle normalised into [0, 360) and the mark spins the long way round every
 * time the set wraps — from the last tracker back to the first it would sweep
 * 330° backwards to travel 30° forwards. So the rotation is never normalised:
 * it keeps growing, and this picks the multiple of a full turn nearest to where
 * the mark already is.
 */
export function nearestTurn(current: number, targetDeg: number): number {
    const delta = ((((targetDeg - current) % 360) + 540) % 360) - 180;
    return current + delta;
}

/**
 * The share of the window the tracker was recorded on, 0–1 and safe to print.
 *
 * Every kind of tracker has a rate, and it is the one quantity all three can be
 * asked for without the answer changing meaning. An average out of five and a
 * sum of repetitions do not share a scale; "written down on eleven days of
 * thirty" does. It used to be drawn as the ring's arc and is now a figure in
 * the panel beside it, which is the same claim said in words.
 *
 * Clamped rather than trusted: the window and the count come from parsing
 * notes, and a day counted twice would otherwise report 103%.
 */
export function clampRate(rate: number): number {
    if (!Number.isFinite(rate)) return 0;
    return Math.min(1, Math.max(0, rate));
}
