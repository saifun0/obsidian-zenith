import React, { useState } from 'react';
import { CalendarDays, Clock, Cloud, Gauge, MapPin, RotateCw, Sun, Wind } from 'lucide-react';
import { Modal } from '../../../components/shared/Modal';
import { Tabs } from '../../../components/shared/Tabs';
import { DynamicIcon } from '../../../components/shared/DynamicIcon';
import type { Translator } from '../../../core/i18n';
import type { WeatherUnit } from '../../../store/settingsSlice';
import { describeWeather } from '../weatherService';
import { temperature } from '../weatherFormat';
import { locationNowMs } from '../sun';
import type { WeatherData } from '../weatherTypes';
import { MetricGrid } from './MetricGrid';
import { SunPanel } from './SunPanel';
import { AirPanel } from './AirPanel';
import { HourlyStrip } from './HourlyStrip';
import { DailyForecastList } from './DailyForecastList';

type TabId = 'now' | 'hourly' | 'daily' | 'sun' | 'air';

interface Props {
    data: WeatherData;
    unit: WeatherUnit;
    forecastDays: number;
    showAir: boolean;
    loading: boolean;
    now: Date;
    t: Translator;
    onRefresh: () => void;
    onClose: () => void;
}

/**
 * Full-detail view shown when the card is clicked.
 *
 * Tabbed rather than one long scroll. There is now roughly five times as much
 * data as the old panel showed, and stacking all of it vertically would mean a
 * phone user scrolling past the hourly strip and a ten-day list to reach the
 * air quality — while also forcing every section to render whether or not it is
 * being looked at, which is exactly what made the panel expensive on mobile.
 *
 * The shell is the shared `Modal`: it already handles Escape, scrim clicks,
 * background scroll locking, the focus trap, the `zenith-root` token
 * re-declaration a portal needs, and the phone bottom-sheet layout. The old
 * bespoke portal reimplemented half of that and omitted the rest.
 */
export const WeatherExpanded: React.FC<Props> = ({
    data,
    unit,
    forecastDays,
    showAir,
    loading,
    now,
    t,
    onRefresh,
    onClose,
}) => {
    const [tab, setTab] = useState<TabId>('now');

    const look = describeWeather(data.code, data.isDay);
    const hourly = data.hourly ?? [];
    const daily = (data.daily ?? []).slice(0, Math.max(1, forecastDays || 10));
    const nowMs = locationNowMs(data, now);

    const tabs = [
        { id: 'now', label: t('weather.tab.now'), icon: <Gauge size={13} /> },
        { id: 'hourly', label: t('weather.tab.hourly'), icon: <Clock size={13} /> },
        { id: 'daily', label: t('weather.tab.daily'), icon: <CalendarDays size={13} /> },
        { id: 'sun', label: t('weather.tab.sun'), icon: <Sun size={13} /> },
        ...(showAir ? [{ id: 'air', label: t('weather.tab.air'), icon: <Wind size={13} /> }] : []),
    ];

    const header = (
        <div className="zenith-weather-modal__head">
            <DynamicIcon
                name={look.icon}
                fallback={Cloud}
                size={56}
                className="zenith-weather__icon"
            />
            <div className="zenith-weather-modal__head-text zenith-weather__temp-group">
                <span className="zenith-weather__temp zenith-serif">
                    {temperature(data.tempC, unit)}°
                </span>
                <span className="zenith-weather__condition">{look.label}</span>
                <span className="zenith-weather__location">
                    <MapPin size={13} />
                    <span>{data.location}</span>
                    <button
                        className="zenith-weather__refresh"
                        onClick={onRefresh}
                        aria-label={t('weather.refresh')}
                        title={t('weather.refresh')}
                    >
                        <RotateCw size={13} className={loading ? 'zenith-spin' : ''} />
                    </button>
                </span>
            </div>
        </div>
    );

    return (
        <Modal
            title={t('weather.detailsTitle')}
            header={header}
            size="lg"
            className="zenith-weather-modal"
            onClose={onClose}
        >
            <Tabs tabs={tabs} activeTab={tab} onTabChange={(id) => setTab(id as TabId)} />

            {/* Only the active tab is mounted: the sparkline maths, the arc and
                the ten-day list are all real work, and a phone should not pay
                for the four panels nobody is looking at. */}
            <div className="zenith-weather-modal__body">
                {tab === 'now' && <MetricGrid data={data} unit={unit} t={t} />}

                {tab === 'hourly' &&
                    (hourly.length > 0 ? (
                        <HourlyStrip hourly={hourly} unit={unit} t={t} detailed />
                    ) : (
                        <p className="zenith-weather__note">{t('weather.noData')}</p>
                    ))}

                {tab === 'daily' &&
                    (daily.length > 0 ? (
                        <DailyForecastList daily={daily} unit={unit} t={t} detailed />
                    ) : (
                        <p className="zenith-weather__note">{t('weather.noData')}</p>
                    ))}

                {tab === 'sun' && <SunPanel data={data} nowMs={nowMs} t={t} />}

                {tab === 'air' && <AirPanel air={data.air} t={t} />}
            </div>
        </Modal>
    );
};
