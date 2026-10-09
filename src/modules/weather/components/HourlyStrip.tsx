import React from 'react';
import { Cloud, Wind } from 'lucide-react';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import type { Translator } from '../../../core/i18n';
import type { WeatherUnit } from '../../../store/settingsSlice';
import { describeWeather } from '../weatherService';
import { precipitation, temperature, unitSystem, wind as windOf } from '../weatherFormat';
import { clockLabel } from '../sun';
import type { HourlyForecast } from '../weatherTypes';
import { useHorizontalWheelRef } from './useHorizontalWheel';

/** Precipitation probability under which an hour reads as dry. */
const WET_THRESHOLD = 10;

interface Props {
    hourly: HourlyForecast[];
    unit: WeatherUnit;
    t: Translator;
    /** Add the rows the expanded panel has room for: rainfall and wind. */
    detailed?: boolean;
    /**
     * Draw this many hours, spread over the day ahead, and nothing to scroll.
     * Absent, every hour is drawn and the strip scrolls — the expanded panel.
     */
    columns?: number;
}

/** How far ahead the card's strip looks: a day. */
const AHEAD_HOURS = 24;

/**
 * `columns` hours out of the day ahead, evenly spaced, the present one first.
 *
 * A strip that scrolled sideways showed nine hours of twenty-four and hid the
 * evening behind a gesture; thinned to what fits, the whole day is on the
 * card — every hour of it in a wide one, every third in a narrow one.
 */
export function spreadHours<T>(hourly: readonly T[], columns: number): T[] {
    const day = hourly.slice(0, AHEAD_HOURS);
    const n = Math.max(1, Math.floor(columns));
    if (day.length <= n) return day;
    const step = Math.ceil(day.length / n);
    return day.filter((_, i) => i % step === 0);
}

/**
 * The hours ahead, a column each. On the card as many as fit, spread over the
 * day (`columns`); in the expanded panel all of them, wheel-scrollable.
 *
 * The card shows the compact form; the expanded panel passes `detailed` and
 * gets millimetres and wind as well, which is the difference between knowing it
 * might rain and knowing whether to care.
 */
export const HourlyStrip: React.FC<Props> = React.memo(({ hourly, unit, t, detailed, columns }) => {
    const ref = useHorizontalWheelRef();
    const system = unitSystem(unit);
    const shown = columns ? spreadHours(hourly, columns) : hourly;

    return (
        <div className={`zenith-weather__hourly${columns ? ' is-spread' : ''}`} ref={ref}>
            {shown.map((h, i) => {
                const look = describeWeather(h.code, h.isDay);
                const rain = precipitation(h.precipMm, system);
                const gust = windOf(h.windKmh, system);
                return (
                    <div className="zenith-weather__hour" key={h.time}>
                        <span className="zenith-weather__hour-label">
                            {i === 0 ? t('weather.now') : clockLabel(h.time).slice(0, 2)}
                        </span>
                        <DynamicIcon
                            name={look.icon}
                            fallback={Cloud}
                            size={20}
                            className="zenith-weather__hour-icon"
                        />
                        <span className="zenith-weather__hour-pop">
                            {h.precipProb >= WET_THRESHOLD ? `${h.precipProb}%` : ''}
                        </span>
                        <span className="zenith-weather__hour-temp">
                            {temperature(h.tempC, unit)}°
                        </span>
                        {detailed && (
                            <>
                                {/* Blank rather than "0 mm": an empty slot reads
                                    as dry faster than a zero does. */}
                                <span className="zenith-weather__hour-mm">
                                    {h.precipMm > 0 ? `${rain.value}` : ''}
                                </span>
                                <span className="zenith-weather__hour-wind">
                                    <Wind size={9} />
                                    {gust.value}
                                </span>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
});
HourlyStrip.displayName = 'HourlyStrip';
