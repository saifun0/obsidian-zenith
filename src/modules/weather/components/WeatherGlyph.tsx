import React from 'react';
import type { WeatherGlyphKind } from '../weatherService';

/**
 * The condition, drawn and moving.
 *
 * The card's largest element used to be a flat accent-coloured outline of a
 * cloud — the same shape whether it was overcast, pouring or snowing, and the
 * only thing on a weather card that told you nothing about the weather. This
 * draws the sky instead: the sun turns, cloud drifts, rain falls, flakes sway,
 * fog slides and lightning strikes on its own schedule.
 *
 * Only the hero uses it. The hourly strip and the ten-day list keep their small
 * lucide icons: two dozen animated glyphs on one card would be a fairground,
 * and every one of them a compositor layer.
 *
 * Everything moves in CSS, so Zenith's animation switch and the system's
 * reduced-motion setting both turn it off without this file knowing.
 */

const VIEW = 48;

/** Where the drops and flakes fall from, and how far. */
const FALL_X = [17, 24, 31];

/**
 * A cloud, as three overlapping discs on a rounded slab.
 *
 * One fill and no strokes, so the union renders as a single silhouette without
 * a seam where the shapes meet — which a stroked outline could not do without
 * tracing the whole envelope by hand.
 */
const Cloud: React.FC<{ className: string }> = ({ className }) => (
    <g className={className}>
        <circle cx={17} cy={27} r={8} />
        <circle cx={27} cy={23.5} r={10.5} />
        <circle cx={35} cy={28} r={6.5} />
        <rect x={11} y={28} width={28} height={8} rx={4} />
    </g>
);

/** The sun: a disc, a crown of eight spokes, and the air lit around it. */
const SunFace: React.FC<{ cx: number; cy: number; r: number; glowId: string }> = ({
    cx,
    cy,
    r,
    glowId,
}) => (
    <g transform={`translate(${cx},${cy})`}>
        <circle className="zenith-wglyph__glow" r={r * 2.6} fill={`url(#${glowId})`} />
        <g className="zenith-wglyph__rays">
            {Array.from({ length: 8 }, (_, i) => {
                const a = (i * Math.PI) / 4;
                return (
                    <line
                        key={i}
                        x1={Math.sin(a) * (r + 3)}
                        y1={-Math.cos(a) * (r + 3)}
                        x2={Math.sin(a) * (r + 6.5)}
                        y2={-Math.cos(a) * (r + 6.5)}
                    />
                );
            })}
        </g>
        <circle className="zenith-wglyph__sun" r={r} />
    </g>
);

/**
 * The moon: a disc with a second one bitten out of it, so the limb stays true.
 *
 * Behind a cloud the bite has to come from the other side. The lit horn is the
 * only part that shows above the cloud line, and with the standalone
 * orientation that horn is exactly the part the cloud covers.
 */
const MoonFace: React.FC<{ cx: number; cy: number; r: number; maskId: string; flip?: boolean }> = ({
    cx,
    cy,
    r,
    maskId,
    flip,
}) => (
    <g transform={`translate(${cx},${cy})`}>
        <mask id={maskId}>
            <circle r={r} fill="#fff" />
            <circle
                cx={r * (flip ? -0.6 : 0.62)}
                cy={r * (flip ? 0.46 : -0.42)}
                r={r * 0.92}
                fill="#000"
            />
        </mask>
        <circle className="zenith-wglyph__moon" r={r} mask={`url(#${maskId})`} />
    </g>
);

/** Two specks of night, blinking out of step. */
const Stars: React.FC = () => (
    <g className="zenith-wglyph__stars">
        <circle cx={13} cy={16} r={1.5} />
        <circle cx={38} cy={31} r={1.2} style={{ animationDelay: '1.3s' }} />
        <circle cx={35} cy={11} r={1} style={{ animationDelay: '2.4s' }} />
    </g>
);

/** Falling rain. `slant` tips the whole shower into the wind. */
const Rain: React.FC<{ long?: boolean; slant?: boolean; fast?: boolean }> = ({
    long,
    slant,
    fast,
}) => (
    <g
        className={`zenith-wglyph__rain${slant ? ' is-slanted' : ''}${fast ? ' is-fast' : ''}`}
        transform={slant ? 'rotate(14 24 40)' : undefined}
    >
        {FALL_X.map((x, i) => (
            <line
                key={x}
                className="zenith-wglyph__drop"
                x1={x}
                y1={37}
                x2={x}
                y2={37 + (long ? 5 : 2.5)}
                style={{ animationDelay: `${-i * 0.42}s` }}
            />
        ))}
    </g>
);

/** Falling snow — same three columns, but drifting sideways on the way down. */
const Snow: React.FC = () => (
    <g className="zenith-wglyph__snow">
        {FALL_X.map((x, i) => (
            <circle
                key={x}
                className="zenith-wglyph__flake"
                cx={x}
                cy={39}
                r={2}
                style={{ animationDelay: `${-i * 1.05}s` }}
            />
        ))}
    </g>
);

/** Fog: bars sliding past each other under a cloud that has lost its edge. */
const Fog: React.FC = () => (
    <g className="zenith-wglyph__fog">
        {[
            { y: 38, x1: 12, x2: 34, d: '0s' },
            { y: 42, x1: 16, x2: 38, d: '-1.4s' },
            { y: 46, x1: 13, x2: 31, d: '-2.7s' },
        ].map((b) => (
            <line key={b.y} x1={b.x1} y1={b.y} x2={b.x2} y2={b.y} style={{ animationDelay: b.d }} />
        ))}
    </g>
);

/** The strike. Long dark, short bright — the way one actually arrives. */
const Bolt: React.FC = () => (
    <path className="zenith-wglyph__bolt" d="M27.5,34 L21,42 L25,42 L21.5,47" />
);

interface Props {
    kind: WeatherGlyphKind;
    size?: number;
    className?: string;
    label?: string;
}

export const WeatherGlyph: React.FC<Props> = React.memo(
    ({ kind, size = 44, className = '', label }) => {
        // Ids have to be unique per instance — the card and the open panel draw
        // the same glyph at once, and a duplicated gradient id makes one of them
        // reference the other's.
        const uid = React.useId().replace(/:/g, '');
        const glowId = `zenith-wg-glow${uid}`;
        const maskId = `zenith-wg-moon${uid}`;

        const withSun = kind === 'sun' || kind === 'cloud-sun';
        const withMoon = kind === 'moon' || kind === 'cloud-moon';
        const clear = kind === 'sun' || kind === 'moon';
        // Behind a cloud the light source is smaller and sits up in the corner.
        const face = clear
            ? { cx: 24, cy: 24, r: 9.5 }
            : { cx: 33.5, cy: 15.5, r: 6.5 };

        return (
            <svg
                className={`zenith-wglyph is-${kind} ${className}`}
                viewBox={`0 0 ${VIEW} ${VIEW}`}
                width={size}
                height={size}
                role="img"
                aria-label={label}
            >
                <defs>
                    <radialGradient id={glowId}>
                        <stop offset="0.35" className="zenith-wglyph__glow-in" />
                        <stop offset="1" className="zenith-wglyph__glow-out" />
                    </radialGradient>
                </defs>

                {/* One group for the whole scene: a kind with nothing falling
                    under it has to sit lower and larger to fill the same box,
                    and doing that here leaves every part's own transform free
                    for its own animation. */}
                <g className="zenith-wglyph__stage">
                    {withMoon && clear && <Stars />}
                    {withSun && <SunFace {...face} glowId={glowId} />}
                    {withMoon && <MoonFace {...face} maskId={maskId} flip={!clear} />}

                    {!clear && (
                        <>
                            {/* A second cloud further off, so an overcast sky
                                has some depth rather than one flat shape. */}
                            <Cloud className="zenith-wglyph__cloud-back" />
                            <Cloud className="zenith-wglyph__cloud" />
                        </>
                    )}

                    {kind === 'drizzle' && <Rain />}
                    {kind === 'rain' && <Rain long />}
                    {kind === 'showers' && <Rain long slant fast />}
                    {kind === 'snow' && <Snow />}
                    {kind === 'fog' && <Fog />}
                    {kind === 'thunder' && <Bolt />}
                </g>
            </svg>
        );
    }
);
WeatherGlyph.displayName = 'WeatherGlyph';
