import React, { useCallback, useEffect, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    CloudOff,
    Droplets,
    MapPin,
    Maximize2,
    RotateCw,
    Thermometer,
    Wind,
} from 'lucide-react';
import { useZenithStore } from '../../store';
import { resolveLocale, useTranslation } from '../../core/i18n';
import { useNow } from '../../core/useNow';
import type { DashboardWidgetProps } from '../dashboard/widgets';
import { preferredPlace, searchPlaces } from '../../services/geocode';
import { getCachedWeather, getWeather, describeWeather, type WeatherData } from './weatherService';
import { temperature, unitSystem, wind as windOf } from './weatherFormat';
import { WeatherGlyph } from './components/WeatherGlyph';
import { HourlySparkline, SunLine } from './components/HourlySparkline';
import { HourlyStrip } from './components/HourlyStrip';
import { DailyForecastList } from './components/DailyForecastList';
import { WeatherExpanded } from './components/WeatherExpanded';

/** How often the card re-reads the clock, for "now" markers and countdowns. */
const TICK_MS = 60_000;

// ── Shared blocks ────────────────────────────────────

/** Place name with a refresh button. */
const LocationLine: React.FC<{
    location: string;
    loading: boolean;
    label: string;
    onRefresh: () => void;
}> = ({ location, loading, label, onRefresh }) => (
    <div className="zenith-weather__location">
        <MapPin size={12} />
        <span>{location}</span>
        <button
            className="zenith-weather__refresh"
            onClick={(e) => {
                // Never let a click on the button reach the card, which opens
                // the expanded panel.
                e.stopPropagation();
                onRefresh();
            }}
            aria-label={label}
            title={label}
        >
            <RotateCw size={12} className={loading ? 'zenith-spin' : ''} />
        </button>
    </div>
);

/**
 * The card's detail chips — icons only, no labels, so they stay language-free
 * and fit the cell. The labelled, full set lives in the expanded panel.
 */
const DetailsRow: React.FC<{ data: WeatherData; unit: 'c' | 'f' }> = ({ data, unit }) => {
    const w = windOf(data.windKmh, unitSystem(unit));
    return (
        <div className="zenith-weather__details">
            <span className="zenith-weather__detail">
                <Thermometer size={12} /> {temperature(data.feelsLikeC, unit)}°
            </span>
            <span className="zenith-weather__detail">
                <Droplets size={12} /> {Math.round(data.humidity)}%
            </span>
            <span className="zenith-weather__detail">
                <Wind size={12} /> {w.value} {w.unit}
            </span>
        </div>
    );
};

/**
 * The sm card's stat strip: today's range, plus the two numbers the detail row
 * would have carried if there were room for it.
 */
const SmallStats: React.FC<{ data: WeatherData; unit: 'c' | 'f' }> = ({ data, unit }) => {
    const today = data.daily?.[0];
    return (
        <div className="zenith-weather__sm-stats">
            {today && (
                <>
                    <span className="zenith-weather__sm-stat">
                        <ArrowUp size={11} /> {temperature(today.tempMaxC, unit)}°
                    </span>
                    <span className="zenith-weather__sm-stat">
                        <ArrowDown size={11} /> {temperature(today.tempMinC, unit)}°
                    </span>
                </>
            )}
            <span className="zenith-weather__sm-stat">
                <Thermometer size={11} /> {temperature(data.feelsLikeC, unit)}°
            </span>
            <span className="zenith-weather__sm-stat">
                <Droplets size={11} /> {Math.round(data.humidity)}%
            </span>
        </div>
    );
};

/**
 * The card's own shape while it waits.
 *
 * A lone spinner in an empty cell made the dashboard jump on every refresh: the
 * card lost its height, the neighbours reflowed, and the data came back into a
 * different layout than it left. Holding the shape and shimmering makes a
 * refresh look like the card thinking rather than the grid rearranging itself.
 */
const WeatherSkeleton: React.FC<{ size: string; label: string }> = ({ size, label }) => (
    <div
        className={`zenith-weather zenith-weather--${size} zenith-weather--loading`}
        role="status"
        aria-busy="true"
        aria-label={label}
    >
        <div className="zenith-weather__main">
            <span className="zenith-weather__sk zenith-weather__sk-icon" />
            <div className="zenith-weather__sk-lines">
                <span className="zenith-weather__sk zenith-weather__sk-temp" />
                <span className="zenith-weather__sk zenith-weather__sk-cond" />
                <span className="zenith-weather__sk zenith-weather__sk-place" />
            </div>
        </div>
        <span className="zenith-weather__sk zenith-weather__sk-chart" />
    </div>
);

/**
 * The card renders a different amount of detail per size preset, and each
 * variant is built to fit its cell without scrolling:
 *
 *   sm — conditions, temperature, place, the 12-hour trend and today's sun.
 *   md — plus the detail chips and the hourly strip.
 *   lg — plus the multi-day forecast.
 *
 * That's why there are no collapse toggles: the size *is* the control. For a
 * full read at any preset, clicking the card opens the expanded panel.
 */
export const WeatherWidget: React.FC<DashboardWidgetProps> = ({ size = 'sm' }) => {
    const t = useTranslation();
    const override = useZenithStore((s) => s.settings.weatherPlace);
    const location = useZenithStore((s) => s.settings.location);
    const place = preferredPlace(override, location);
    const legacyCity = useZenithStore((s) => s.settings.weatherCity);
    const allowIpLookup = useZenithStore((s) => s.settings.weatherAllowIpLookup);
    const includeAir = useZenithStore((s) => s.settings.weatherShowAir);
    const language = useZenithStore((s) => s.settings.language);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const unit = useZenithStore((s) => s.settings.weatherUnit);
    const showHourly = useZenithStore((s) => s.settings.weatherShowHourly);
    const showSun = useZenithStore((s) => s.settings.weatherShowSun);
    const forecastDays = useZenithStore((s) => s.settings.weatherForecastDays);
    const lang = resolveLocale(language);

    const now = useNow(TICK_MS);
    const [data, setData] = useState<WeatherData | null>(() => getCachedWeather(place));
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [failed, setFailed] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(
        async (force = false) => {
            setLoading(true);
            if (force) setRefreshing(true);
            setFailed(false);
            try {
                const result = await getWeather({ place, allowIpLookup, lang, includeAir, force });
                setData(result);
                setFailed(result === null);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [place, allowIpLookup, lang, includeAir]
    );

    // Reload (and repaint from the right cache) whenever the place changes.
    useEffect(() => {
        setData(getCachedWeather(place));
        void load(false);
    }, [place, load]);

    // One-time upgrade from the old free-text city field: geocode what the user
    // typed, store real coordinates, and clear the legacy key so this never runs
    // again. Failing to match simply leaves it for the next attempt.
    //
    // It lands in the plugin-wide location rather than the weather override:
    // the old field was the only place anyone ever named, so it is the answer
    // to "where are you", not to "where do you want the forecast instead".
    useEffect(() => {
        if (place || !legacyCity.trim()) return;
        let cancelled = false;
        void searchPlaces(legacyCity, lang).then((hits) => {
            if (!cancelled && hits[0]) {
                updateSettings({ location: hits[0], weatherCity: '' });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [place, legacyCity, lang, updateSettings]);

    // ── Loading takeover ─────────────────────────────
    // On a manual refresh (or first load with no cache), hide everything and
    // show just a centered spinner. Suppressed while the panel is open so a
    // refresh from inside it doesn't yank the whole card out.
    if ((refreshing || (!data && loading)) && !expanded) {
        return <WeatherSkeleton size={size} label={t('weather.loading')} />;
    }

    if (!data) {
        return (
            <div className="zenith-weather zenith-weather--empty">
                <CloudOff size={22} />
                <span className="zenith-weather__msg">
                    {failed ? t('weather.unavailable') : t('weather.loading')}
                </span>
                {failed && (
                    <button className="zenith-weather__retry" onClick={() => load(true)}>
                        {t('weather.retry')}
                    </button>
                )}
            </div>
        );
    }

    const look = describeWeather(data.code, data.isDay);
    const hourly = data.hourly ?? [];
    const daily = (data.daily ?? []).slice(0, Math.max(0, forecastDays));
    const today = data.daily?.[0];

    const withDetails = size !== 'sm';
    const withSpark = size === 'sm' && hourly.length >= 3;
    const withHourly = size !== 'sm' && showHourly && hourly.length > 0;
    const withDaily = size === 'lg' && daily.length > 0;

    return (
        <div
            className={`zenith-weather zenith-weather--${size} zenith-weather--interactive`}
            role="button"
            tabIndex={0}
            aria-label={t('weather.openDetails')}
            title={t('weather.openDetails')}
            onClick={() => {
                // Portals bubble through the React tree, so a click inside the
                // open panel reaches here too — ignore it while expanded.
                if (!expanded) setExpanded(true);
            }}
            onKeyDown={(e) => {
                if (expanded) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpanded(true);
                }
            }}
        >
            <Maximize2 className="zenith-weather__expand-hint" size={15} aria-hidden="true" />

            <div className="zenith-weather__top">
                <div className="zenith-weather__main">
                    <WeatherGlyph
                        kind={look.glyph}
                        size={size === 'sm' ? 52 : 62}
                        className="zenith-weather__icon"
                        label={t(look.labelKey)}
                    />
                    <div className="zenith-weather__temp-group">
                        <span className="zenith-weather__temp zenith-serif">
                            {temperature(data.tempC, unit)}°
                        </span>
                        <span className="zenith-weather__condition">{t(look.labelKey)}</span>
                        <LocationLine
                            location={data.location}
                            loading={loading}
                            label={t('weather.refresh')}
                            onRefresh={() => load(true)}
                        />
                    </div>
                </div>
            </div>

            {size === 'sm' && <SmallStats data={data} unit={unit} />}
            {withDetails && <DetailsRow data={data} unit={unit} />}

            {withSpark && (
                <HourlySparkline hourly={hourly} daily={data.daily ?? []} unit={unit} t={t} />
            )}

            {showSun && <SunLine today={today} t={t} />}

            {withHourly && (
                <div className="zenith-weather__section">
                    <span className="zenith-weather__section-title">{t('weather.tab.hourly')}</span>
                    <HourlyStrip hourly={hourly} unit={unit} t={t} />
                </div>
            )}

            {withDaily && (
                <div className="zenith-weather__section">
                    <span className="zenith-weather__section-title">
                        {t('weather.forecastDays', { count: daily.length })}
                    </span>
                    <DailyForecastList daily={daily} unit={unit} t={t} />
                </div>
            )}

            {expanded && (
                <WeatherExpanded
                    data={data}
                    unit={unit}
                    forecastDays={forecastDays}
                    showAir={includeAir}
                    loading={loading}
                    now={now}
                    t={t}
                    onRefresh={() => load(true)}
                    onClose={() => setExpanded(false)}
                />
            )}
        </div>
    );
};
