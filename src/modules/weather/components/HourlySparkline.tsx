import React, { useId, useMemo } from 'react';
import { Droplets, Sunrise, Sunset } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import type { WeatherUnit } from '../../../store/settingsSlice';
import { temperature } from '../weatherFormat';
import { clockLabel, formatDuration, skyStops, wallClockMs, windowOffset } from '../sun';
import type { DailyForecast, HourlyForecast } from '../weatherTypes';
import { absTempColor } from './colors';

/** Hours the sparkline covers. */
const SPARK_HOURS = 12;
/** Precipitation probability under which an hour counts as dry. */
const SPARK_DRY = 10;

/**
 * Sparkline geometry, in viewBox units. The svg scales to the card's width, so
 * it's the width:height *ratio* — not the absolute numbers — that decides how
 * tall the chart renders.
 */
const SPARK = {
    w: 340,
    padX: 6,
    curveTop: 15, // above the curve band: room for the high label
    curveBot: 34, // below it: room for the low label
    base: 46, // area fill bottom / axis hairline
    rainTop: 49,
    rainBot: 61,
};

interface Point {
    x: number;
    y: number;
}

/**
 * Catmull-Rom spline through `pts`, as a cubic bezier path. Each segment's
 * control points are clamped to that segment's own y-range, so smoothing can
 * never invent a peak or a dip the forecast doesn't contain.
 */
function smoothPath(pts: Point[]): string {
    const n = (v: number) => v.toFixed(1);
    let d = `M${n(pts[0].x)},${n(pts[0].y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] ?? p2;
        const lo = Math.min(p1.y, p2.y);
        const hi = Math.max(p1.y, p2.y);
        const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: clamp(p1.y + (p2.y - p0.y) / 6) };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: clamp(p2.y - (p3.y - p1.y) / 6) };
        d += ` C${n(c1.x)},${n(c1.y)} ${n(c2.x)},${n(c2.y)} ${n(p2.x)},${n(p2.y)}`;
    }
    return d;
}

interface SunMarker {
    kind: 'sunrise' | 'sunset';
    /** Position across the window, 0–1. */
    offset: number;
    time: string;
}

/**
 * Sunrise and sunset falling inside the charted window, in order.
 *
 * Only the ones actually on screen: a marker for a crossing the chart doesn't
 * reach would be pinned to an edge and read as happening there.
 */
function sunMarkers(days: DailyForecast[], startMs: number, endMs: number): SunMarker[] {
    const out: SunMarker[] = [];
    for (const d of days) {
        for (const kind of ['sunrise', 'sunset'] as const) {
            const time = d[kind];
            const offset = windowOffset(time, startMs, endMs);
            if (offset !== null) out.push({ kind, offset, time });
        }
    }
    return out.sort((a, b) => a.offset - b.offset);
}

interface Props {
    hourly: HourlyForecast[];
    daily: DailyForecast[];
    unit: WeatherUnit;
    t: Translator;
}

/**
 * Temperature trend for the coming hours — the sm card's stand-in for the full
 * hourly strip, so it has to answer at a glance what the strip answers by
 * scrolling: which way the temperature is heading and by how much, whether it
 * rains and when, and where night falls.
 *
 * The daylight band is built from the real sunrise/sunset times rather than the
 * per-hour `is_day` flag it used to use. That flag could only put the boundary
 * on an hour mark — up to half an hour out — and it shaded *night*, with a wash
 * derived from the text colour, which on a dark theme is near-white: night came
 * out lighter than day. Now daylight is what's lit, the boundary lands on the
 * minute, and it ramps through twilight instead of switching.
 */
export const HourlySparkline: React.FC<Props> = React.memo(({ hourly, daily, unit, t }) => {
    // Colons in React's generated ids are legal in markup but awkward inside a
    // url(#…) reference, so strip them.
    const uid = useId().replace(/:/g, '');
    const gradId = `zenith-spark${uid}`;
    const skyId = `zenith-sky${uid}`;
    const wipeId = `zenith-wipe${uid}`;

    // The spline, the gradient and the sky band are pure functions of the
    // forecast, but the whole dashboard re-renders on any grid interaction —
    // so they're memoised rather than recomputed on every drag frame.
    const geo = useMemo(() => {
        const pts = hourly.slice(0, SPARK_HOURS);
        if (pts.length < 3) return null;

        const temps = pts.map((h) => temperature(h.tempC, unit));
        const hiT = Math.max(...temps);
        const loT = Math.min(...temps);
        const last = pts.length - 1;

        // Floor the vertical scale. Normalising to the window's own range alone
        // makes a 1° drift fill the whole band, so a calm evening would read
        // like a cold front; below the floor the curve is as flat as it is.
        const span = Math.max(hiT - loT, unit === 'f' ? 6 : 3);
        const baseT = (hiT + loT) / 2 - span / 2;

        const wet = pts.some((h) => h.precipProb >= SPARK_DRY);
        const H = wet ? SPARK.rainBot : SPARK.base;
        const step = (SPARK.w - SPARK.padX * 2) / last;
        const x = (i: number) => SPARK.padX + i * step;
        const y = (temp: number) =>
            SPARK.curveBot - ((temp - baseT) / span) * (SPARK.curveBot - SPARK.curveTop);

        const curve = smoothPath(temps.map((temp, i) => ({ x: x(i), y: y(temp) })));

        const startMs = wallClockMs(pts[0].time);
        const endMs = wallClockMs(pts[last].time);

        return {
            pts,
            temps,
            hiT,
            loT,
            last,
            wet,
            H,
            step,
            x,
            y,
            curve,
            area: `${curve} L${x(last).toFixed(1)},${SPARK.base} L${x(0).toFixed(1)},${SPARK.base} Z`,
            sky: skyStops(startMs, endMs, daily),
            markers: sunMarkers(daily, startMs, endMs),
            peakRain: pts.reduce((best, h, i) => (h.precipProb > pts[best].precipProb ? i : best), 0),
            barW: Math.min(step * 0.62, 10),
            // Start, end, and two evenly spaced hours between them.
            ticks: [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])],
        };
    }, [hourly, daily, unit]);

    if (!geo) return null;
    const { pts, temps, hiT, loT, last, wet, H, step, x, y, markers } = geo;

    const rainH = (prob: number) => (prob / 100) * (SPARK.rainBot - SPARK.rainTop);

    /** viewBox x → percentage across the plot, for the HTML overlays. */
    const pct = (vx: number) => (vx / SPARK.w) * 100;
    /** Window offset 0–1 → percentage across the plot. */
    const offsetPct = (o: number) => pct(SPARK.padX + o * (SPARK.w - SPARK.padX * 2));

    /** Anchor an HTML label over the chart at a data point. */
    const anchor = (i: number, temp: number, above: boolean): React.CSSProperties => {
        const left = pct(x(i));
        // Near an edge the label would hang off the card, so pivot on its side.
        const shiftX = left < 14 ? '0' : left > 86 ? '-100%' : '-50%';
        return {
            left: `${left}%`,
            top: `${(y(temp) / H) * 100}%`,
            transform: `translate(${shiftX}, ${above ? '-118%' : '18%'})`,
        };
    };

    return (
        <div className="zenith-weather__spark">
            <div className="zenith-weather__spark-plot">
                <svg
                    viewBox={`0 0 ${SPARK.w} ${H}`}
                    role="img"
                    aria-label={t('weather.spark.aria', {
                        hours: last,
                        low: loT,
                        high: hiT,
                    })}
                >
                    <defs>
                        <linearGradient
                            id={gradId}
                            gradientUnits="userSpaceOnUse"
                            x1={x(0)}
                            y1={0}
                            x2={x(last)}
                            y2={0}
                        >
                            {pts.map((h, i) => (
                                <stop
                                    key={h.time}
                                    offset={`${((i / last) * 100).toFixed(1)}%`}
                                    stopColor={absTempColor(h.tempC)}
                                />
                            ))}
                        </linearGradient>

                        {/* Daylight. Colours come from CSS so each theme can say
                            what "lit" means — a wash that reads as daylight on a
                            dark card is invisible on a light one. */}
                        <linearGradient
                            id={skyId}
                            gradientUnits="userSpaceOnUse"
                            x1={x(0)}
                            y1={0}
                            x2={x(last)}
                            y2={0}
                        >
                            {geo.sky.map((s, i) => (
                                <stop
                                    key={`${s.offset}-${i}`}
                                    offset={`${(s.offset * 100).toFixed(2)}%`}
                                    className={
                                        s.day
                                            ? 'zenith-weather__sky-day'
                                            : 'zenith-weather__sky-night'
                                    }
                                />
                            ))}
                        </linearGradient>
                        {/* The sweep. A clip rect widened past the viewBox on
                            every side, so scaling it to nothing and back can
                            never shave the curve's own stroke off the edges. */}
                        <clipPath id={wipeId}>
                            <rect
                                className="zenith-weather__spark-wipe"
                                x={-4}
                                y={-6}
                                width={SPARK.w + 8}
                                height={H + 12}
                            />
                        </clipPath>
                    </defs>

                    {geo.sky.length > 0 && (
                        <rect
                            className="zenith-weather__spark-sky"
                            x={0}
                            y={0}
                            width={SPARK.w}
                            height={SPARK.base}
                            fill={`url(#${skyId})`}
                        />
                    )}

                    {/* A hairline exactly on the crossing, so the eye can tell
                        where the band's soft edge is actually centred. */}
                    {markers.map((m) => (
                        <line
                            key={`guide-${m.time}`}
                            className="zenith-weather__spark-sunline"
                            x1={SPARK.padX + m.offset * (SPARK.w - SPARK.padX * 2)}
                            y1={0}
                            x2={SPARK.padX + m.offset * (SPARK.w - SPARK.padX * 2)}
                            y2={SPARK.base}
                        />
                    ))}

                    <line
                        className="zenith-weather__spark-baseline"
                        x1={0}
                        y1={SPARK.base}
                        x2={SPARK.w}
                        y2={SPARK.base}
                    />

                    {/* Everything read off the forecast is drawn by one sweep
                        from left to right, so the chart arrives the way the
                        hours in it do. A clip rather than a dashed stroke:
                        one animation then covers the curve, its fill and the
                        rain bars together, and none of them has to know how
                        long the path is. */}
                    <g className="zenith-weather__spark-draw" clipPath={`url(#${wipeId})`}>
                        <path
                            className="zenith-weather__spark-fill"
                            d={geo.area}
                            fill={`url(#${gradId})`}
                        />
                        <path
                            className="zenith-weather__spark-line"
                            d={geo.curve}
                            stroke={`url(#${gradId})`}
                            vectorEffect="non-scaling-stroke"
                        />

                        {wet && (
                            <g className="zenith-weather__spark-rain">
                                {pts.map((h, i) =>
                                    h.precipProb >= SPARK_DRY ? (
                                        <rect
                                            key={h.time}
                                            x={x(i) - geo.barW / 2}
                                            y={SPARK.rainBot - rainH(h.precipProb)}
                                            width={geo.barW}
                                            height={rainH(h.precipProb)}
                                            rx={1}
                                        />
                                    ) : null
                                )}
                            </g>
                        )}
                    </g>

                    {/* Now, pinged like a radar contact — the card ticks every
                        minute and this is the one point on the chart that is
                        the present rather than the forecast. */}
                    <circle
                        className="zenith-weather__spark-ping"
                        cx={x(0)}
                        cy={y(temps[0])}
                        r={3}
                        fill={absTempColor(pts[0].tempC)}
                    />
                    <circle
                        className="zenith-weather__spark-dot"
                        cx={x(0)}
                        cy={y(temps[0])}
                        r={3}
                        fill={absTempColor(pts[0].tempC)}
                    />

                    {/* Invisible per-hour hit areas — hover for exact numbers. */}
                    {pts.map((h, i) => (
                        <rect
                            key={`hit-${h.time}`}
                            className="zenith-weather__spark-hit"
                            x={x(i) - step / 2}
                            y={0}
                            width={step}
                            height={H}
                        >
                            <title>
                                {`${i === 0 ? t('weather.now') : clockLabel(h.time)} · ${temperature(
                                    h.tempC,
                                    unit
                                )}°${
                                    h.precipProb >= SPARK_DRY
                                        ? ` · ${t('weather.rainChance', { pct: h.precipProb })}`
                                        : ''
                                }`}
                            </title>
                        </rect>
                    ))}
                </svg>

                {/* Sun and moon sit above the band at the exact crossing. The
                    glyph says which way the light is going; the row underneath
                    gives the time, so neither has to be guessed from position. */}
                {markers.map((m) => (
                    <span
                        key={`mark-${m.time}`}
                        className={`zenith-weather__spark-mark is-${m.kind}`}
                        style={{ left: `${offsetPct(m.offset)}%` }}
                        title={`${t(`weather.${m.kind}`)} ${clockLabel(m.time)}`}
                    >
                        {m.kind === 'sunrise' ? <Sunrise size={11} /> : <Sunset size={11} />}
                    </span>
                ))}

                {hiT !== loT && (
                    <>
                        <span
                            className="zenith-weather__spark-tag"
                            style={anchor(temps.indexOf(hiT), hiT, true)}
                        >
                            {hiT}°
                        </span>
                        <span
                            className="zenith-weather__spark-tag"
                            style={anchor(temps.indexOf(loT), loT, false)}
                        >
                            {loT}°
                        </span>
                    </>
                )}

                {wet && (
                    // Sits in whichever bottom corner the tallest bar isn't.
                    <span
                        className={`zenith-weather__spark-peak${
                            geo.peakRain > last / 2 ? ' is-left' : ''
                        }`}
                    >
                        <Droplets size={10} /> {pts[geo.peakRain].precipProb}%
                    </span>
                )}
            </div>

            <div className="zenith-weather__spark-axis">
                {geo.ticks.map((i) => (
                    <span
                        key={i}
                        style={{
                            left: `${pct(x(i))}%`,
                            transform:
                                i === 0
                                    ? 'translateX(0)'
                                    : i === last
                                      ? 'translateX(-100%)'
                                      : 'translateX(-50%)',
                        }}
                    >
                        {i === 0 ? t('weather.now') : clockLabel(pts[i].time).slice(0, 2)}
                    </span>
                ))}
            </div>
        </div>
    );
});
HourlySparkline.displayName = 'HourlySparkline';

/**
 * Exact sunrise and sunset, spelled out.
 *
 * The markers on the chart say *where* the light changes; this says *when*, to
 * the minute, so the time never has to be read off a position.
 */
export const SunLine: React.FC<{ today: DailyForecast | undefined; t: Translator }> = React.memo(
    ({ today, t }) => {
        if (!today?.sunrise || !today?.sunset) return null;
        return (
            <div className="zenith-weather__sunline">
                <span className="zenith-weather__sunline-item">
                    <Sunrise size={12} />
                    {clockLabel(today.sunrise)}
                </span>
                <span className="zenith-weather__sunline-item">
                    <Sunset size={12} />
                    {clockLabel(today.sunset)}
                </span>
                <span className="zenith-weather__sunline-len">
                    {formatDuration(today.daylightSec, t('common.hourShort'), t('common.minShort'))}
                </span>
            </div>
        );
    }
);
SunLine.displayName = 'SunLine';
