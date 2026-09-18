import React from 'react';
import {
    ArrowDown,
    ArrowUp,
    Cloud,
    Droplets,
    Eye,
    Gauge,
    Minus,
    Sun,
    Thermometer,
    Waves,
    Wind,
} from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import type { WeatherUnit } from '../../../store/settingsSlice';
import {
    compass,
    precipitation,
    pressure,
    pressureTrend,
    temperature,
    temperaturePrecise,
    unitSystem,
    uvBand,
    visibility,
    wind as windOf,
} from '../weatherFormat';
import type { WeatherData } from '../weatherTypes';

/** How far back to look for a pressure trend. Three hours is the standard window. */
const TREND_HOURS = 3;

/**
 * One labelled reading. Exported because the Sun tab states its facts in the
 * same shape, and two tile designs across two tabs of one panel would read as
 * two panels.
 */
export const Metric: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: string;
}> = ({ icon, label, value, hint, tone }) => (
    <div className={`zenith-weather__metric${tone ? ` ${tone}` : ''}`}>
        <span className="zenith-weather__metric-icon">{icon}</span>
        <span className="zenith-weather__metric-label">{label}</span>
        <span className="zenith-weather__metric-value">{value}</span>
        {hint && <span className="zenith-weather__metric-hint">{hint}</span>}
    </div>
);

/**
 * Everything about right now that isn't the headline number.
 *
 * The card used to show three chips — feels-like, humidity, wind — because
 * three was all the service fetched. It now fetches the full set, so the panel
 * can answer the questions those three raised: how much wind, gusting to what,
 * from where; is that humidity muggy or just cool; is the pressure going
 * anywhere.
 */
export const MetricGrid: React.FC<{ data: WeatherData; unit: WeatherUnit; t: Translator }> =
    React.memo(({ data, unit, t }) => {
        const system = unitSystem(unit);
        const w = windOf(data.windKmh, system);
        const gust = windOf(data.windGustKmh, system);
        const p = pressure(data.pressureHpa, system);
        const vis = visibility(data.visibilityM, system);
        const rain = precipitation(data.precipMm, system);
        const uv = Math.round(data.uvIndex);

        // The series starts at the current hour, so there is no history to look
        // back at — this is where the pressure is *going* over the next three
        // hours, which is the half that actually predicts anything. Falls back
        // to steady when the series is too short to say.
        const later = data.hourly[TREND_HOURS];
        const trend = later ? pressureTrend(later.pressureHpa, data.pressureHpa) : 'steady';
        const TrendIcon = trend === 'rising' ? ArrowUp : trend === 'falling' ? ArrowDown : Minus;

        return (
            <div className="zenith-weather__metrics">
                <Metric
                    icon={<Thermometer size={13} />}
                    label={t('weather.feelsLike')}
                    value={`${temperature(data.feelsLikeC, unit)}°`}
                />
                <Metric
                    icon={<Droplets size={13} />}
                    label={t('weather.humidity')}
                    value={`${Math.round(data.humidity)}%`}
                />
                <Metric
                    icon={<Waves size={13} />}
                    label={t('weather.dewPoint')}
                    value={`${temperaturePrecise(data.dewPointC, unit)}°`}
                />
                <Metric
                    icon={<Wind size={13} />}
                    label={t('weather.wind')}
                    value={`${w.value} ${w.unit}`}
                    hint={
                        <>
                            {compass(data.windDir)}
                            {data.windGustKmh > data.windKmh &&
                                ` · ${t('weather.gusts')} ${gust.value}`}
                        </>
                    }
                />
                <Metric
                    icon={<Gauge size={13} />}
                    label={t('weather.pressure')}
                    value={`${p.value} ${p.unit}`}
                    hint={
                        <span title={t(`weather.pressure.${trend}`)}>
                            <TrendIcon size={11} />
                        </span>
                    }
                />
                <Metric
                    icon={<Cloud size={13} />}
                    label={t('weather.cloudCover')}
                    value={`${Math.round(data.cloudCover)}%`}
                />
                <Metric
                    icon={<Eye size={13} />}
                    label={t('weather.visibility')}
                    // Open-Meteo saturates at 24 km, so say "at least" rather
                    // than presenting a ceiling as a measurement.
                    value={`${vis.capped ? '≥ ' : ''}${vis.value} ${vis.unit}`}
                />
                <Metric
                    icon={<Sun size={13} />}
                    label={t('weather.uv')}
                    value={String(uv)}
                    hint={t(`weather.uv.${uvBand(data.uvIndex)}`)}
                    tone={`is-uv-${uvBand(data.uvIndex)}`}
                />
                <Metric
                    icon={<Droplets size={13} />}
                    label={t('weather.precipNow')}
                    value={`${rain.value} ${rain.unit}`}
                />
            </div>
        );
    });
MetricGrid.displayName = 'MetricGrid';
