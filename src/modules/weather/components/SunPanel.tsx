import React, { useId } from 'react';
import { Clock4, Info, Sun, Sunrise, Sunset, Timer } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { clockFromMs, clockLabel, formatDuration, skyLook, solarNoonMs, sunArc } from '../sun';
import { litOnRight, moonPhase, nextNamedPhase, terminatorRatio } from '../moon';
import type { WeatherData } from '../weatherTypes';
import { Metric } from './MetricGrid';

/**
 * Sky geometry, in viewBox units.
 *
 * Wide and shallow on purpose: the svg scales to the panel's width, so a
 * squarer box would turn a 700px modal into a 500px wall of sky. `h` runs past
 * `baseline` to leave a strip of ground under the horizon.
 */
const ARC = { w: 420, h: 108, pad: 26, baseline: 92, rise: 60 };

const LEFT = ARC.pad;
const RIGHT = ARC.w - ARC.pad;
const SPAN = RIGHT - LEFT;
const APEX_Y = ARC.baseline - ARC.rise;
/** Centre and horizontal radius of the ellipse the arc is half of. */
const CX = LEFT + SPAN / 2;
const RX = SPAN / 2;

/** The sun's path: a half-ellipse from sunrise to sunset. */
const ARC_PATH = `M${LEFT},${ARC.baseline} A${RX},${ARC.rise} 0 0 1 ${RIGHT},${ARC.baseline}`;

/**
 * The arc, sampled once, with the running distance along it.
 *
 * Everything that has to agree about where the sun is measures the same way:
 * `offset-path` walks the curve by length, and so does a dash pattern. Placing
 * the sun by anything else — an angle, or a fraction of the width — puts it
 * beside its own trail rather than at the end of it, which is what the old
 * `sin(pπ)` placement quietly did between the three points where the two
 * parametrisations happen to meet.
 */
const ARC_WALK = (() => {
    const steps = 240;
    const xs: number[] = [LEFT];
    const ys: number[] = [ARC.baseline];
    const at: number[] = [0];
    for (let i = 1; i <= steps; i++) {
        const u = (i / steps) * Math.PI;
        const x = CX - RX * Math.cos(u);
        const y = ARC.baseline - ARC.rise * Math.sin(u);
        at.push(at[i - 1] + Math.hypot(x - xs[i - 1], y - ys[i - 1]));
        xs.push(x);
        ys.push(y);
    }
    return { xs, ys, at, length: at[steps] };
})();

/** The point a given fraction of the way *along* the arc. */
function pointAlong(p: number): { x: number; y: number } {
    const target = Math.min(1, Math.max(0, p)) * ARC_WALK.length;
    const { xs, ys, at } = ARC_WALK;
    let lo = 0;
    let hi = at.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (at[mid] <= target) lo = mid;
        else hi = mid;
    }
    const span = at[hi] - at[lo];
    const f = span > 0 ? (target - at[lo]) / span : 0;
    return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
}

/**
 * Whether the browser can move an element along a path.
 *
 * When it can, the sun rides the arc — rising from dawn to where it is now when
 * the tab opens, and sliding on as the minutes pass. When it can't, it is
 * simply placed: the same picture without the journey. Asked once, because the
 * answer cannot change while the app is running.
 */
const CAN_FOLLOW_PATH =
    typeof CSS !== 'undefined' && (CSS.supports?.('offset-path', 'path("M0 0 L1 1")') ?? false);

/** Cloud cover under which the sky is drawn clear. */
const CLOUD_FLOOR = 12;

interface Star {
    x: number;
    y: number;
    r: number;
    /** Brightest this star ever gets. */
    o: number;
    /** Seconds into the twinkle it starts, so they don't blink in unison. */
    delay: number;
}

/**
 * A fixed star field.
 *
 * Seeded rather than random, so it is the same sky every time the tab is
 * opened. Stars that reshuffle on each render read as noise rather than as a
 * night.
 */
const STARS: Star[] = (() => {
    let seed = 20260828;
    const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    return Array.from({ length: 34 }, () => ({
        x: 6 + rnd() * (ARC.w - 12),
        y: 5 + rnd() * (ARC.baseline - 16),
        r: 0.5 + rnd() * 1.05,
        o: 0.3 + rnd() * 0.7,
        delay: rnd() * 5,
    }));
})();

/** Drifting cloud layers, back to front. Smaller reads as further away. */
const CLOUDS = [
    { y: 24, scale: 1, dur: 110, delay: -14 },
    { y: 47, scale: 0.68, dur: 152, delay: -78 },
    { y: 13, scale: 0.5, dur: 196, delay: -130 },
];

/** How many of them the sky wears at this cover. */
function cloudCount(cover: number): number {
    if (cover < CLOUD_FLOOR) return 0;
    if (cover < 45) return 1;
    if (cover < 75) return 2;
    return 3;
}

/** One cloud, drawn from overlapping puffs around its own origin. */
const Cloud: React.FC<{ y: number; scale: number; dur: number; delay: number }> = ({
    y,
    scale,
    dur,
    delay,
}) => (
    <g
        className="zenith-weather__sky-cloud"
        style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
    >
        <g transform={`translate(0,${y}) scale(${scale})`}>
            <ellipse cx={-15} cy={4} rx={13} ry={6} />
            <ellipse cx={2} cy={0} rx={17} ry={9} />
            <ellipse cx={18} cy={4} rx={14} ry={6.5} />
        </g>
    </g>
);

/** Eight spokes around the sun, drawn at the origin so the crown can turn. */
const RAYS = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return {
        x1: Math.sin(a) * 9.5,
        y1: -Math.cos(a) * 9.5,
        x2: Math.sin(a) * 13.5,
        y2: -Math.cos(a) * 13.5,
    };
});

/**
 * The sun's day, as a sky.
 *
 * Half an ellipse from sunrise to sunset with the sun sitting where it actually
 * is, so "how much daylight is left" is answered by looking rather than by
 * subtracting two clock times. Around it the sky carries the rest of what the
 * forecast already knows: how dark it is — the stars fade in across twilight
 * rather than switching on at sunset — and how much cloud is in the way of the
 * sunshine hours quoted underneath. Before dawn and after dusk the sun is
 * parked at the horizon instead of being extrapolated underground, and the
 * countdown switches to the next sunrise.
 */
const SkyStage: React.FC<{ data: WeatherData; nowMs: number; t: Translator }> = ({
    data,
    nowMs,
    t,
}) => {
    const uid = useId().replace(/:/g, '');
    const arcId = `zenith-arc${uid}`;
    const glowId = `zenith-sunglow${uid}`;
    const groundId = `zenith-ground${uid}`;
    const skyClipId = `zenith-skyclip${uid}`;

    const arc = sunArc(data, nowMs);
    const today = data.daily[0];
    if (!arc || !today) return null;

    const sky = skyLook(data, nowMs);
    const clouds = cloudCount(data.cloudCover);

    // How far along the arc the day has got. Null progress means below the
    // horizon — park it at the end it will next appear from.
    const p = arc.progress ?? (arc.next === 'sunrise' ? 0 : 1);
    const at = pointAlong(p);

    // Riding the path keeps the sun on the arc for free; the fallback places it
    // at the point we worked out ourselves. Both land in the same pixel.
    const sunStyle: React.CSSProperties = CAN_FOLLOW_PATH
        ? {
              offsetPath: `path("${ARC_PATH}")`,
              offsetDistance: `${(p * 100).toFixed(3)}%`,
              offsetRotate: '0deg',
          }
        : { transform: `translate(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px)` };

    return (
        <div
            className={`zenith-weather__sky is-${sky.phase}`}
            style={{ ['--night' as string]: sky.nightness.toFixed(3) }}
        >
            <svg
                className="zenith-weather__sky-svg"
                viewBox={`0 0 ${ARC.w} ${ARC.h}`}
                role="img"
                aria-label={t('weather.sunPath')}
            >
                <defs>
                    <linearGradient id={arcId} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" className="zenith-weather__arc-stop-low" />
                        <stop offset="0.5" className="zenith-weather__arc-stop-high" />
                        <stop offset="1" className="zenith-weather__arc-stop-low" />
                    </linearGradient>
                    <radialGradient id={glowId}>
                        <stop offset="0" className="zenith-weather__glow-stop-in" />
                        <stop offset="1" className="zenith-weather__glow-stop-out" />
                    </radialGradient>
                    <linearGradient id={groundId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" className="zenith-weather__ground-stop-in" />
                        <stop offset="1" className="zenith-weather__ground-stop-out" />
                    </linearGradient>
                    {/* Everything atmospheric is clipped to the sky: a cloud
                        must not drift out of the card, and none of it belongs
                        below the horizon. */}
                    <clipPath id={skyClipId}>
                        <rect x={0} y={0} width={ARC.w} height={ARC.baseline} />
                    </clipPath>
                </defs>

                <g clipPath={`url(#${skyClipId})`}>
                    <g className="zenith-weather__sky-stars">
                        {STARS.map((s, i) => (
                            <circle
                                key={i}
                                cx={s.x}
                                cy={s.y}
                                r={s.r}
                                style={{
                                    ['--star' as string]: s.o.toFixed(2),
                                    animationDelay: `${s.delay.toFixed(2)}s`,
                                }}
                            />
                        ))}
                    </g>
                    {CLOUDS.slice(0, clouds).map((c, i) => (
                        <Cloud key={i} {...c} />
                    ))}
                </g>

                <rect
                    className="zenith-weather__ground"
                    x={0}
                    y={ARC.baseline}
                    width={ARC.w}
                    height={ARC.h - ARC.baseline}
                    fill={`url(#${groundId})`}
                />
                <line
                    className="zenith-weather__arc-horizon"
                    x1={0}
                    y1={ARC.baseline}
                    x2={ARC.w}
                    y2={ARC.baseline}
                />

                <path className="zenith-weather__arc-track" d={ARC_PATH} />

                {/* Solar noon is the top of the arc by definition, so the tick
                    needs no maths of its own — only a name on hover. */}
                <line
                    className="zenith-weather__arc-noon"
                    x1={CX}
                    y1={APEX_Y - 9}
                    x2={CX}
                    y2={APEX_Y - 4}
                >
                    <title>{t('weather.solarNoon')}</title>
                </line>
                <circle className="zenith-weather__arc-end" cx={LEFT} cy={ARC.baseline} r={2.2} />
                <circle className="zenith-weather__arc-end" cx={RIGHT} cy={ARC.baseline} r={2.2} />

                {arc.progress !== null && (
                    <>
                        <path
                            className="zenith-weather__arc-done"
                            d={ARC_PATH}
                            stroke={`url(#${arcId})`}
                            // Dash the whole arc and reveal only the part
                            // already travelled — cheaper and smoother than
                            // rebuilding the path on every tick. In user units
                            // rather than through `pathLength`, because the
                            // stroke this dashes must not be a non-scaling one:
                            // that measures dashes in device pixels while the
                            // path keeps its own units, and the arc then stops
                            // short by exactly the scale factor. `--p` hands the
                            // same distance to the keyframe that draws it in.
                            strokeDasharray={`${(arc.progress * ARC_WALK.length).toFixed(2)} ${ARC_WALK.length.toFixed(2)}`}
                            style={{
                                ['--p' as string]: (arc.progress * ARC_WALK.length).toFixed(2),
                            }}
                        />
                        <line
                            className="zenith-weather__arc-drop"
                            x1={at.x}
                            y1={at.y}
                            x2={at.x}
                            y2={ARC.baseline}
                        />
                    </>
                )}

                <g className={`zenith-weather__sun${arc.isUp ? '' : ' is-down'}`} style={sunStyle}>
                    <circle className="zenith-weather__sun-glow" r={26} fill={`url(#${glowId})`} />
                    <g className="zenith-weather__sun-rays">
                        {RAYS.map((ray, i) => (
                            <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} />
                        ))}
                    </g>
                    <circle className="zenith-weather__sun-core" r={6.5} />
                </g>
            </svg>

            <div className="zenith-weather__sky-foot">
                <span className="zenith-weather__sky-end">
                    <Sunrise size={15} />
                    <span>
                        <b>{clockLabel(today.sunrise)}</b>
                        <small>{t('weather.sunrise')}</small>
                    </span>
                </span>
                <span className="zenith-weather__sky-count">
                    {t(arc.next === 'sunset' ? 'weather.untilSunset' : 'weather.untilSunrise', {
                        time: formatDuration(
                            arc.untilNextSec,
                            t('common.hourShort'),
                            t('common.minShort')
                        ),
                    })}
                </span>
                <span className="zenith-weather__sky-end is-right">
                    <span>
                        <b>{clockLabel(today.sunset)}</b>
                        <small>{t('weather.sunset')}</small>
                    </span>
                    <Sunset size={15} />
                </span>
            </div>
        </div>
    );
};

/** Craters, in disc-radius units. Placed by eye, to read as *the* moon. */
const CRATERS = [
    { x: -0.3, y: -0.34, r: 0.26, o: 0.16 },
    { x: 0.16, y: -0.12, r: 0.19, o: 0.12 },
    { x: -0.12, y: 0.34, r: 0.3, o: 0.1 },
    { x: 0.42, y: 0.3, r: 0.15, o: 0.14 },
    { x: -0.55, y: 0.12, r: 0.12, o: 0.13 },
    { x: 0.3, y: -0.55, r: 0.1, o: 0.11 },
];

/**
 * The moon as it currently looks, and where that is in its month.
 *
 * Drawn rather than picked from eight glyphs: the terminator is an ellipse
 * whose horizontal radius tracks the phase continuously, so the shape is right
 * on the days between the named phases too. Which limb is lit flips below the
 * equator, because it does. Blurring the mask is the one liberty taken — a real
 * terminator is soft, and the hard edge is what made the old disc read as a
 * logo rather than as the moon.
 */
const MoonCard: React.FC<{ latitude: number; t: Translator; at?: Date }> = ({
    latitude,
    t,
    at,
}) => {
    const uid = useId().replace(/:/g, '');
    const maskId = `zenith-moonmask${uid}`;
    const faceId = `zenith-moonface${uid}`;
    const haloId = `zenith-moonhalo${uid}`;
    const softId = `zenith-moonsoft${uid}`;

    const phase = moonPhase(at);
    const r = 24;
    const ratio = terminatorRatio(phase.fraction);
    const right = litOnRight(phase.waxing, latitude);
    const next = nextNamedPhase(phase.fraction);
    const nextDays = Math.round(next.days);

    // Lit half as a disc-wide path: one semicircle for the limb, one elliptical
    // arc for the terminator. `sweep` flips the ellipse between crescent and
    // gibbous; a negative ratio means it bulges the other way.
    const sweepLimb = right ? 1 : 0;
    const sweepTerm = ratio >= 0 ? (right ? 0 : 1) : right ? 1 : 0;
    const lit =
        `M0,${-r} A${r},${r} 0 0 ${sweepLimb} 0,${r} ` +
        `A${Math.abs(ratio) * r},${r} 0 0 ${sweepTerm} 0,${-r} Z`;

    return (
        <div className="zenith-weather__moon">
            <div className="zenith-weather__moon-disc">
                <svg
                    viewBox="-34 -34 68 68"
                    role="img"
                    aria-label={t(`weather.moon.${phase.phase}`)}
                >
                    <defs>
                        <radialGradient id={faceId} cx="0.36" cy="0.3" r="0.85">
                            <stop offset="0" className="zenith-weather__moon-stop-in" />
                            <stop offset="1" className="zenith-weather__moon-stop-out" />
                        </radialGradient>
                        <radialGradient id={haloId}>
                            <stop offset="0.55" className="zenith-weather__halo-stop-in" />
                            <stop offset="1" className="zenith-weather__halo-stop-out" />
                        </radialGradient>
                        <filter id={softId}>
                            <feGaussianBlur stdDeviation="0.9" />
                        </filter>
                        <mask id={maskId}>
                            <path d={lit} fill="#fff" filter={`url(#${softId})`} />
                        </mask>
                    </defs>

                    {/* Scaled by illumination: a new moon has no glow to give. */}
                    <circle
                        className="zenith-weather__moon-halo"
                        r={33}
                        fill={`url(#${haloId})`}
                        style={{ opacity: (0.15 + phase.illumination * 0.85).toFixed(3) }}
                    />
                    <circle className="zenith-weather__moon-dark" r={r} />
                    <g mask={`url(#${maskId})`}>
                        <circle r={r} fill={`url(#${faceId})`} />
                        <g className="zenith-weather__moon-craters">
                            {CRATERS.map((c, i) => (
                                <circle
                                    key={i}
                                    cx={c.x * r}
                                    cy={c.y * r}
                                    r={c.r * r}
                                    style={{ opacity: c.o }}
                                />
                            ))}
                        </g>
                    </g>
                    <circle className="zenith-weather__moon-limb" r={r} />
                </svg>
            </div>

            <div className="zenith-weather__moon-text">
                <span className="zenith-weather__moon-name">
                    {t(`weather.moon.${phase.phase}`)}
                </span>
                <span className="zenith-weather__moon-illum">
                    {t('weather.moon.illuminated', { pct: Math.round(phase.illumination * 100) })}
                    <i>·</i>
                    {t('weather.moon.age', { days: Math.round(phase.ageDays) })}
                </span>

                {/* The month as a track, with the quarters marked. The phase
                    name says where the moon is; this says how far that is from
                    the two nights anyone actually plans around. */}
                <div className="zenith-weather__lunation">
                    <div
                        className="zenith-weather__lunation-track"
                        role="img"
                        aria-label={t('weather.moon.lunation')}
                    >
                        {[0.25, 0.5, 0.75].map((q) => (
                            <span
                                key={q}
                                className={`zenith-weather__lunation-tick${
                                    q === 0.5 ? ' is-full' : ''
                                }`}
                                style={{ left: `${q * 100}%` }}
                            />
                        ))}
                        <span
                            className="zenith-weather__lunation-now"
                            style={{ left: `${(phase.fraction * 100).toFixed(2)}%` }}
                        />
                    </div>
                    <span className="zenith-weather__lunation-next">
                        {t(
                            next.phase === 'full'
                                ? 'weather.moon.untilFull'
                                : 'weather.moon.untilNew'
                        )}
                        <b>
                            {nextDays === 0
                                ? t('weather.moon.today')
                                : t.plural('weather.moon.days', nextDays)}
                        </b>
                    </span>
                </div>
            </div>

            {/* Tucked into a tooltip rather than said on screen: it explains an
                absence, which is worth having and not worth a paragraph. */}
            <span
                className="zenith-weather__moon-note"
                title={t('weather.moon.note')}
                aria-label={t('weather.moon.note')}
            >
                <Info size={13} />
            </span>
        </div>
    );
};

/** Sun and moon together — the "Sun" tab of the expanded panel. */
export const SunPanel: React.FC<{ data: WeatherData; nowMs: number; t: Translator }> = React.memo(
    ({ data, nowMs, t }) => {
        const today = data.daily[0];
        const tomorrow = data.daily[1];
        const noon = solarNoonMs(today);

        // Minutes at most, and none at all at the solstice — but it is the one
        // thing about daylight a forecast can say that a clock cannot.
        const delta = tomorrow && today ? tomorrow.daylightSec - today.daylightSec : 0;
        const sameLength = Math.abs(delta) < 60;

        return (
            <div className="zenith-weather__sunpanel">
                <SkyStage data={data} nowMs={nowMs} t={t} />

                {today && (
                    <div className="zenith-weather__sunfacts">
                        <Metric
                            icon={<Sun size={13} />}
                            label={t('weather.dayLength')}
                            value={formatDuration(
                                today.daylightSec,
                                t('common.hourShort'),
                                t('common.minShort')
                            )}
                        />
                        {/* Sunshine is always ≤ daylight; the gap is the cloud. */}
                        <Metric
                            icon={<Timer size={13} />}
                            label={t('weather.sunshine')}
                            value={formatDuration(
                                today.sunshineSec,
                                t('common.hourShort'),
                                t('common.minShort')
                            )}
                            hint={t('weather.sunshineOf', {
                                pct: today.daylightSec
                                    ? Math.round((today.sunshineSec / today.daylightSec) * 100)
                                    : 0,
                            })}
                        />
                        {noon !== null && (
                            <Metric
                                icon={<Clock4 size={13} />}
                                label={t('weather.solarNoon')}
                                value={clockFromMs(noon)}
                            />
                        )}
                        {tomorrow && (
                            <Metric
                                icon={<Sunrise size={13} />}
                                label={t('weather.tomorrow')}
                                value={
                                    sameLength
                                        ? '='
                                        : `${delta > 0 ? '+' : '−'}${formatDuration(
                                              Math.abs(delta),
                                              t('common.hourShort'),
                                              t('common.minShort')
                                          )}`
                                }
                                hint={t(
                                    sameLength
                                        ? 'weather.daySame'
                                        : delta > 0
                                          ? 'weather.dayLonger'
                                          : 'weather.dayShorter'
                                )}
                            />
                        )}
                    </div>
                )}

                <MoonCard latitude={data.place.lat} t={t} />
            </div>
        );
    }
);
SunPanel.displayName = 'SunPanel';
