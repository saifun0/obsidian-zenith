/**
 * Turning stored metric values into something to put on screen.
 *
 * Everything is stored metric and unrounded (see `weatherTypes`), so every
 * display path goes through here. Rounding happens once, at the end — the old
 * code rounded at parse time and then converted to °F on top, which turned a
 * clean 32.4 °C into a visibly wrong Fahrenheit reading.
 */

import type { WeatherUnit } from '../../store/settingsSlice';

/**
 * Which family of units to show. Derived from the temperature setting rather
 * than configured separately: someone who asked for °F wants mph and inches
 * too, and a widget that mixes °F with km/h reads as a bug.
 */
export type UnitSystem = 'metric' | 'imperial';

export function unitSystem(unit: WeatherUnit): UnitSystem {
    return unit === 'f' ? 'imperial' : 'metric';
}

export interface Measure {
    value: number;
    unit: string;
}

/**
 * `Math.round` of a small negative is `-0`. That prints as "0", so it costs
 * nothing on screen, but it fails an `Object.is` comparison against zero and
 * would flip the sign of anything derived from it — so it gets normalised here
 * rather than surprising a caller later.
 */
function round(value: number, decimals = 0): number {
    const factor = 10 ** decimals;
    const rounded = Math.round(value * factor) / factor;
    return rounded === 0 ? 0 : rounded;
}

/** Celsius → the display unit, rounded once. */
export function temperature(celsius: number, unit: WeatherUnit): number {
    return round(unit === 'f' ? (celsius * 9) / 5 + 32 : celsius);
}

/** Celsius → the display unit, keeping one decimal (dew point, deltas). */
export function temperaturePrecise(celsius: number, unit: WeatherUnit): number {
    return round(unit === 'f' ? (celsius * 9) / 5 + 32 : celsius, 1);
}

export function wind(kmh: number, system: UnitSystem): Measure {
    return system === 'imperial'
        ? { value: Math.round(kmh * 0.621371), unit: 'mph' }
        : { value: Math.round(kmh), unit: 'km/h' };
}

export function pressure(hpa: number, system: UnitSystem): Measure {
    return system === 'imperial'
        ? { value: Math.round(hpa * 0.02953 * 100) / 100, unit: 'inHg' }
        : { value: Math.round(hpa), unit: 'hPa' };
}

export function precipitation(mm: number, system: UnitSystem): Measure {
    return system === 'imperial'
        ? { value: Math.round(mm * 0.0393701 * 100) / 100, unit: 'in' }
        : { value: Math.round(mm * 10) / 10, unit: 'mm' };
}

/**
 * Metres → km or miles. Open-Meteo saturates at 24 km, so anything at or above
 * that is reported as a ceiling rather than as a precise figure it isn't.
 */
export function visibility(metres: number, system: UnitSystem): Measure & { capped: boolean } {
    const capped = metres >= 24000;
    return system === 'imperial'
        ? { value: Math.round(metres * 0.000621371), unit: 'mi', capped }
        : { value: Math.round(metres / 100) / 10, unit: 'km', capped };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Wind direction as a compass point. Degrees are what the wind blows *from*. */
export function compass(degrees: number): string {
    const normalized = ((degrees % 360) + 360) % 360;
    return COMPASS[Math.round(normalized / 45) % 8];
}

/** UV exposure bands, as published by the WHO. */
export type UvBand = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

export function uvBand(index: number): UvBand {
    if (index < 3) return 'low';
    if (index < 6) return 'moderate';
    if (index < 8) return 'high';
    if (index < 11) return 'veryHigh';
    return 'extreme';
}

/**
 * European AQI bands. Deliberately separate from the US scale: the two run on
 * different numbers and are not interchangeable, so a shared band function
 * would quietly mislabel one of them.
 */
export type AqiBand = 'good' | 'fair' | 'moderate' | 'poor' | 'veryPoor' | 'extreme';

export function europeanAqiBand(aqi: number): AqiBand {
    if (aqi <= 20) return 'good';
    if (aqi <= 40) return 'fair';
    if (aqi <= 60) return 'moderate';
    if (aqi <= 80) return 'poor';
    if (aqi <= 100) return 'veryPoor';
    return 'extreme';
}

export function usAqiBand(aqi: number): AqiBand {
    if (aqi <= 50) return 'good';
    if (aqi <= 100) return 'fair';
    if (aqi <= 150) return 'moderate';
    if (aqi <= 200) return 'poor';
    if (aqi <= 300) return 'veryPoor';
    return 'extreme';
}

/**
 * Pressure trend over the last few hours of the series.
 *
 * Only the sign matters to a reader — "falling" is the useful word, not the
 * exact hectopascals — so anything inside the noise floor reads as steady.
 */
export type PressureTrend = 'rising' | 'steady' | 'falling';

export function pressureTrend(hpaNow: number, hpaThen: number): PressureTrend {
    const delta = hpaNow - hpaThen;
    if (delta > 1) return 'rising';
    if (delta < -1) return 'falling';
    return 'steady';
}
