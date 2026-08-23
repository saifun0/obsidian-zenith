import React from 'react';
import { Cloud, Droplets, Sun, Wind } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import type { Locale, Translator } from '../../../core/i18n';
import type { WeatherUnit } from '../../../store/settingsSlice';
import { describeWeather } from '../weatherService';
import { precipitation, temperature, unitSystem, uvBand, wind as windOf } from '../weatherFormat';
import type { DailyForecast } from '../weatherTypes';
import { tempColor } from './colors';

/** Precipitation probability under which a day reads as dry. */
const WET_THRESHOLD = 10;
/** Below this the UV index isn't worth a line. */
const UV_WORTH_SHOWING = 3;

/** Short weekday for a `yyyy-mm-dd` date; "Today" for index 0. */
function dayLabel(date: string, index: number, locale: Locale, t: Translator): string {
    if (index === 0) return t('weather.today');
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(
        locale === 'ru' ? 'ru-RU' : 'en-US',
        { weekday: 'short' }
    );
}

interface Props {
    daily: DailyForecast[];
    unit: WeatherUnit;
    t: Translator;
    /** Add the second line the expanded panel has room for. */
    detailed?: boolean;
}

/**
 * Multi-day list with a shared-scale temperature range bar per day.
 *
 * The scale is shared across the whole list on purpose: a per-row scale would
 * make every day's bar the same width and destroy the one comparison the list
 * exists to support.
 */
export const DailyForecastList: React.FC<Props> = React.memo(({ daily, unit, t, detailed }) => {
    const locale = t.locale;
    const system = unitSystem(unit);

    const weekMin = daily.length ? Math.min(...daily.map((d) => d.tempMinC)) : 0;
    const weekMax = daily.length ? Math.max(...daily.map((d) => d.tempMaxC)) : 1;
    const weekSpan = weekMax - weekMin || 1;

    return (
        <div className={`zenith-weather__daily${detailed ? ' is-detailed' : ''}`}>
            {daily.map((d, i) => {
                const look = describeWeather(d.code, true);
                const left = ((d.tempMinC - weekMin) / weekSpan) * 100;
                const width = ((d.tempMaxC - d.tempMinC) / weekSpan) * 100;
                const rain = precipitation(d.precipMm, system);
                const gust = windOf(d.windGustMaxKmh, system);

                return (
                    <div className="zenith-weather__day-row" key={d.date}>
                        <div className="zenith-weather__day">
                            <span className="zenith-weather__day-label">
                                {dayLabel(d.date, i, locale, t)}
                            </span>
                            <span className="zenith-weather__day-pop">
                                {d.precipProb >= WET_THRESHOLD ? (
                                    <>
                                        <Droplets size={10} />
                                        {d.precipProb}%
                                    </>
                                ) : null}
                            </span>
                            <DynamicIcon
                                name={look.icon}
                                fallback={Cloud}
                                size={18}
                                className="zenith-weather__day-icon"
                            />
                            <span className="zenith-weather__day-lo">
                                {temperature(d.tempMinC, unit)}°
                            </span>
                            <span className="zenith-weather__day-track">
                                <span
                                    className="zenith-weather__day-range"
                                    style={{
                                        marginLeft: `${left}%`,
                                        width: `${Math.max(width, 6)}%`,
                                        background: `linear-gradient(90deg, ${tempColor(
                                            d.tempMinC,
                                            weekMin,
                                            weekMax
                                        )}, ${tempColor(d.tempMaxC, weekMin, weekMax)})`,
                                    }}
                                />
                            </span>
                            <span className="zenith-weather__day-hi">
                                {temperature(d.tempMaxC, unit)}°
                            </span>
                        </div>

                        {detailed && (
                            <div className="zenith-weather__day-extra">
                                {d.precipMm > 0 && (
                                    <span>
                                        <Droplets size={10} />
                                        {rain.value} {rain.unit}
                                    </span>
                                )}
                                {d.windGustMaxKmh > 0 && (
                                    <span>
                                        <Wind size={10} />
                                        {gust.value} {gust.unit}
                                    </span>
                                )}
                                {d.uvIndexMax >= UV_WORTH_SHOWING && (
                                    <span className={`is-uv-${uvBand(d.uvIndexMax)}`}>
                                        <Sun size={10} />
                                        {t('weather.uv')} {Math.round(d.uvIndexMax)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
});
DailyForecastList.displayName = 'DailyForecastList';
