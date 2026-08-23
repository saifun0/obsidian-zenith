/** Map a temperature to a cold→warm hue within the given range. */
export function tempColor(t: number, min: number, max: number): string {
    const f = max > min ? (t - min) / (max - min) : 0.5;
    const hue = 210 - f * 190; // 210 = cold blue, 20 = warm orange
    return `hsl(${Math.round(hue)}, 78%, 56%)`;
}

/**
 * Cold→warm hue on a fixed −15…35 °C scale. The daily bars stretch their scale
 * to the week they show, which the sparkline can't afford: over a 2° afternoon
 * that would paint the same mild weather arctic-blue at one end and desert
 * orange at the other. Pinning the domain keeps a colour meaning one
 * temperature, refresh after refresh — and it stays in Celsius even in °F mode,
 * so the hue tracks the physical temperature rather than the number on screen.
 */
export function absTempColor(c: number): string {
    return tempColor(Math.min(35, Math.max(-15, c)), -15, 35);
}
