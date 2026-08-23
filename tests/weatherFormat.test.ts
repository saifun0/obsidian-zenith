import { describe, it, expect } from 'vitest';
import {
    compass,
    europeanAqiBand,
    precipitation,
    pressure,
    pressureTrend,
    temperature,
    temperaturePrecise,
    unitSystem,
    usAqiBand,
    uvBand,
    visibility,
    wind,
} from '../src/modules/weather/weatherFormat';

describe('temperature', () => {
    it('rounds once, at the end', () => {
        // The bug this replaces: 32.4 was rounded to 32 at parse time, then
        // scaled, landing on 90 instead of 90.32 → 90.
        expect(temperature(32.4, 'c')).toBe(32);
        expect(temperature(32.4, 'f')).toBe(90);
        expect(temperature(-17.8, 'f')).toBe(0);
        expect(temperature(0, 'f')).toBe(32);
        expect(temperature(100, 'f')).toBe(212);
    });

    it('keeps a decimal where the decimal is the point', () => {
        expect(temperaturePrecise(12.34, 'c')).toBe(12.3);
        expect(temperaturePrecise(0, 'f')).toBe(32);
    });
});

describe('unitSystem', () => {
    it('follows the temperature choice, so units never mix', () => {
        expect(unitSystem('c')).toBe('metric');
        expect(unitSystem('f')).toBe('imperial');
    });
});

describe('wind / pressure / precipitation / visibility', () => {
    it('converts wind', () => {
        expect(wind(14.4, 'metric')).toEqual({ value: 14, unit: 'km/h' });
        expect(wind(100, 'imperial')).toEqual({ value: 62, unit: 'mph' });
    });

    it('converts pressure', () => {
        expect(pressure(1013.25, 'metric')).toEqual({ value: 1013, unit: 'hPa' });
        expect(pressure(1013.25, 'imperial')).toEqual({ value: 29.92, unit: 'inHg' });
    });

    it('converts precipitation', () => {
        expect(precipitation(12.34, 'metric')).toEqual({ value: 12.3, unit: 'mm' });
        expect(precipitation(25.4, 'imperial')).toEqual({ value: 1, unit: 'in' });
    });

    it('flags visibility that hit the API ceiling rather than reporting it as exact', () => {
        expect(visibility(24000, 'metric')).toEqual({ value: 24, unit: 'km', capped: true });
        expect(visibility(8400, 'metric')).toEqual({ value: 8.4, unit: 'km', capped: false });
        expect(visibility(8047, 'imperial')).toMatchObject({ value: 5, unit: 'mi' });
    });
});

describe('compass', () => {
    it('names the eight points', () => {
        expect(compass(0)).toBe('N');
        expect(compass(45)).toBe('NE');
        expect(compass(90)).toBe('E');
        expect(compass(180)).toBe('S');
        expect(compass(270)).toBe('W');
        expect(compass(315)).toBe('NW');
    });

    it('rounds to the nearest point and wraps past 360', () => {
        expect(compass(350)).toBe('N');
        expect(compass(359)).toBe('N');
        expect(compass(370)).toBe('N');
        expect(compass(-90)).toBe('W');
    });
});

describe('uvBand', () => {
    it('follows the WHO thresholds', () => {
        expect(uvBand(0)).toBe('low');
        expect(uvBand(2.9)).toBe('low');
        expect(uvBand(3)).toBe('moderate');
        expect(uvBand(6)).toBe('high');
        expect(uvBand(8)).toBe('veryHigh');
        expect(uvBand(11)).toBe('extreme');
    });
});

describe('aqi bands', () => {
    it('keeps the two scales apart — 60 is not the same air on both', () => {
        expect(europeanAqiBand(60)).toBe('moderate');
        expect(usAqiBand(60)).toBe('fair');
        expect(europeanAqiBand(20)).toBe('good');
        expect(usAqiBand(20)).toBe('good');
        expect(europeanAqiBand(101)).toBe('extreme');
        expect(usAqiBand(101)).toBe('moderate');
    });
});

describe('pressureTrend', () => {
    it('calls small movement steady rather than inventing a trend', () => {
        expect(pressureTrend(1013, 1013)).toBe('steady');
        expect(pressureTrend(1013.8, 1013)).toBe('steady');
        expect(pressureTrend(1016, 1013)).toBe('rising');
        expect(pressureTrend(1010, 1013)).toBe('falling');
    });
});
