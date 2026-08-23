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
}

/**
 * Horizontal, wheel-scrollable strip of hours.
 *
 * The card shows the compact form; the expanded panel passes `detailed` and
 * gets millimetres and wind as well, which is the difference between knowing it
 * might rain and knowing whether to care.
 */
export const HourlyStrip: React.FC<Props> = React.memo(({ hourly, unit, t, detailed }) => {
    const ref = useHorizontalWheelRef();
    const system = unitSystem(unit);

    return (
        <div className="zenith-weather__hourly" ref={ref}>
            {hourly.map((h, i) => {
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
