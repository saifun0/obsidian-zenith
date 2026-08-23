import React, { type FC } from 'react';

/** Referenced from CSS as `filter: url(#…)`, so it is fixed, not generated. */
export const GOOEY_FILTER_ID = 'zenith-hmon-goo';

/**
 * The filter that fuses a streak into one shape.
 *
 * Blur, then push alpha hard through a contrast curve: overlapping shapes come
 * back as a single silhouette with a concave fillet where they meet, which is
 * what makes a row of discs and the bars between them read as one drawn-out
 * drop instead of beads threaded on a stick. `feBlend` puts the original,
 * unblurred graphic back on top so the discs keep their crisp edge.
 *
 * `stdDeviation` is the whole tuning: too little and the joint stays a corner,
 * too much and separate streaks a day apart start reaching for each other.
 * Three pixels fuses shapes that already touch and nothing else — and by
 * construction, two kept days that touch ARE the same streak.
 *
 * Rendered inside the panel rather than in a global stylesheet: `url(#id)` only
 * resolves against the document the element is in, and an Obsidian view can be
 * torn off into a window of its own.
 */
export const GooeyDefs: FC = () => (
    <svg className="zenith-hmon__defs" aria-hidden="true" focusable="false">
        <defs>
            <filter id={GOOEY_FILTER_ID}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurred" />
                <feColorMatrix
                    in="blurred"
                    type="matrix"
                    values="1 0 0 0 0
                            0 1 0 0 0
                            0 0 1 0 0
                            0 0 0 20 -9"
                    result="fused"
                />
                <feBlend in="SourceGraphic" in2="fused" />
            </filter>
        </defs>
    </svg>
);

/**
 * The chain's colour at a point along a streak, 0 at its head and 1 at its
 * tail — full strength where a run starts, palest where it ends.
 *
 * Measured along the STREAK rather than along the month. Spread over a whole
 * month the drift was arithmetically present and visually absent: a week-long
 * run covers a quarter of it, so its colour shifted by eight percent, which
 * nobody can see. Anchored to the run, every chain carries the full drift
 * however short it is, and a day standing alone is simply full strength.
 *
 * Reads `--hmon-color` and `--hmon-fade` from whatever element it lands on, so
 * the habit grid and the dashboard widget shade identically.
 */
export function chainShade(along: number): string {
    const strength = Math.round(100 - Math.max(0, Math.min(1, along)) * 45);
    return `color-mix(in oklab, var(--hmon-color) ${strength}%, var(--hmon-fade))`;
}
