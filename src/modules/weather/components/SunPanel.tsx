import React from 'react';
import { Sun, Sunrise, Sunset } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { clockLabel, formatDuration, sunArc } from '../sun';
import { litOnRight, moonPhase, terminatorRatio } from '../moon';
import type { WeatherData } from '../weatherTypes';

/** Arc geometry, in viewBox units. */
const ARC = { w: 300, h: 92, pad: 16, baseline: 74, rise: 56 };

/**
 * The sun's path across today, as a real arc.
 *
 * Half an ellipse from sunrise to sunset with the sun sitting where it actually
 * is, so "how much daylight is left" is answered by looking rather than by
 * subtracting two clock times. Before dawn and after dusk the sun is parked at
 * the horizon instead of being extrapolated underground, and the countdown
 * switches to the next sunrise.
 */
const SunPath: React.FC<{ data: WeatherData; nowMs: number; t: Translator }> = ({
    data,
    nowMs,
    t,
}) => {
    const arc = sunArc(data, nowMs);
    const today = data.daily[0];
    if (!arc || !today) return null;

    const left = ARC.pad;
    const right = ARC.w - ARC.pad;
    const span = right - left;

    // Parametric half-ellipse: t ∈ [0,1] left→right, peaking at the middle.
    const pointAt = (p: number) => ({
        x: left + p * span,
        y: ARC.baseline - Math.sin(p * Math.PI) * ARC.rise,
    });

    const path = `M${left},${ARC.baseline} A${span / 2},${ARC.rise} 0 0 1 ${right},${ARC.baseline}`;
    // Null progress means below the horizon — park it at the relevant end.
    const at = pointAt(arc.progress ?? (arc.next === 'sunrise' ? 0 : 1));

    return (
        <div className="zenith-weather__arc">
            <svg viewBox={`0 0 ${ARC.w} ${ARC.h}`} role="img" aria-label={t('weather.sunPath')}>
                <line
                    className="zenith-weather__arc-horizon"
                    x1={0}
                    y1={ARC.baseline}
                    x2={ARC.w}
                    y2={ARC.baseline}
                />
                <path className="zenith-weather__arc-track" d={path} />
                {arc.progress !== null && (
                    <path
                        className="zenith-weather__arc-done"
                        d={path}
                        // Dash the whole arc and reveal only the part already
                        // travelled — cheaper and smoother than rebuilding the
                        // path on every tick.
                        pathLength={1}
                        strokeDasharray={`${arc.progress} 1`}
                    />
                )}
                <circle
                    className={`zenith-weather__arc-sun${arc.isUp ? '' : ' is-down'}`}
                    cx={at.x}
                    cy={at.y}
                    r={5}
                />
            </svg>

            <div className="zenith-weather__arc-ends">
                <span>
                    <Sunrise size={12} /> {clockLabel(today.sunrise)}
                </span>
                <span className="zenith-weather__arc-until">
                    {t(arc.next === 'sunset' ? 'weather.untilSunset' : 'weather.untilSunrise', {
                        time: formatDuration(
                            arc.untilNextSec,
                            t('common.hourShort'),
                            t('common.minShort')
                        ),
                    })}
                </span>
                <span>
                    <Sunset size={12} /> {clockLabel(today.sunset)}
                </span>
            </div>
        </div>
    );
};

/**
 * The moon as it currently looks.
 *
 * Drawn rather than picked from eight glyphs: the terminator is an ellipse
 * whose horizontal radius tracks the phase continuously, so the shape is right
 * on the days between the named phases too. Which limb is lit flips below the
 * equator, because it does.
 */
const MoonDisc: React.FC<{ latitude: number; t: Translator; at?: Date }> = ({
    latitude,
    t,
    at,
}) => {
    const phase = moonPhase(at);
    const r = 22;
    const ratio = terminatorRatio(phase.fraction);
    const right = litOnRight(phase.waxing, latitude);

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
            <svg viewBox="-26 -26 52 52" role="img" aria-label={t(`weather.moon.${phase.phase}`)}>
                <circle className="zenith-weather__moon-dark" r={r} />
                <path className="zenith-weather__moon-lit" d={lit} />
            </svg>
            <div className="zenith-weather__moon-text">
                <span className="zenith-weather__moon-name">{t(`weather.moon.${phase.phase}`)}</span>
                <span className="zenith-weather__moon-illum">
                    {t('weather.moon.illuminated', {
                        pct: Math.round(phase.illumination * 100),
                    })}
                </span>
                <span className="zenith-weather__moon-age">
                    {t('weather.moon.age', { days: Math.round(phase.ageDays) })}
                </span>
            </div>
        </div>
    );
};

/** Sun and moon together — the "Sun" tab of the expanded panel. */
export const SunPanel: React.FC<{ data: WeatherData; nowMs: number; t: Translator }> = React.memo(
    ({ data, nowMs, t }) => {
        const today = data.daily[0];
        return (
            <div className="zenith-weather__sunpanel">
                <SunPath data={data} nowMs={nowMs} t={t} />

                {today && (
                    <div className="zenith-weather__sunfacts">
                        <span>
                            <Sun size={12} />
                            {t('weather.dayLength')}
                            <b>
                                {formatDuration(
                                    today.daylightSec,
                                    t('common.hourShort'),
                                    t('common.minShort')
                                )}
                            </b>
                        </span>
                        {/* Sunshine is always ≤ daylight; the gap is the cloud. */}
                        <span>
                            <Sun size={12} />
                            {t('weather.sunshine')}
                            <b>
                                {formatDuration(
                                    today.sunshineSec,
                                    t('common.hourShort'),
                                    t('common.minShort')
                                )}
                            </b>
                        </span>
                    </div>
                )}

                <MoonDisc latitude={data.place.lat} t={t} />
                {/* Said out loud because its absence is otherwise a mystery:
                    Open-Meteo publishes no lunar rise/set, and guessing one
                    from the phase alone is not possible. */}
                <p className="zenith-weather__note">{t('weather.moon.note')}</p>
            </div>
        );
    }
);
SunPanel.displayName = 'SunPanel';
