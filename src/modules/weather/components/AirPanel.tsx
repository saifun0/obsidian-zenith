import React from 'react';
import { Flower2, Wind } from 'lucide-react';
import type { Translator } from '../../../core/i18n';
import { europeanAqiBand, usAqiBand, type AqiBand } from '../weatherFormat';
import type { AirQuality, PollenCounts } from '../weatherTypes';

/** Where the European AQI scale tops out for the purposes of the meter. */
const EU_AQI_MAX = 120;

/** Pollen species, in the order the CAMS model reports them. */
const SPECIES: Array<keyof PollenCounts> = [
    'alder',
    'birch',
    'grass',
    'mugwort',
    'olive',
    'ragweed',
];

/**
 * Grains/m³ thresholds. Species differ in potency, but a shared three-step
 * scale is honest at this resolution and far more readable than six.
 */
function pollenBand(grains: number): 'low' | 'moderate' | 'high' {
    if (grains < 10) return 'low';
    if (grains < 50) return 'moderate';
    return 'high';
}

const AqiMeter: React.FC<{ label: string; value: number; band: AqiBand; max: number; t: Translator }> =
    ({ label, value, band, max, t }) => (
        <div className={`zenith-weather__aqi is-${band}`}>
            <div className="zenith-weather__aqi-head">
                <span className="zenith-weather__aqi-label">{label}</span>
                <span className="zenith-weather__aqi-value">{Math.round(value)}</span>
                <span className="zenith-weather__aqi-band">{t(`weather.aqi.${band}`)}</span>
            </div>
            <div className="zenith-weather__aqi-track">
                <span
                    className="zenith-weather__aqi-fill"
                    style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                />
            </div>
        </div>
    );

const Pollutant: React.FC<{ label: string; value: number | null }> = ({ label, value }) =>
    value === null ? null : (
        <div className="zenith-weather__pollutant">
            <span className="zenith-weather__pollutant-label">{label}</span>
            <span className="zenith-weather__pollutant-value">
                {Math.round(value * 10) / 10}
                <em>µg/m³</em>
            </span>
        </div>
    );

/**
 * Air quality and pollen — the "Air" tab.
 *
 * Both AQI scales are shown side by side rather than one converted into the
 * other, because they are not convertible: 60 is "moderate" in Europe and
 * "fair" in the US, and quietly picking one would misreport the other.
 *
 * Pollen is a Europe-only CAMS product, so its section disappears entirely
 * outside that domain instead of rendering a row of zeroes that would read as
 * "no pollen today".
 */
export const AirPanel: React.FC<{ air: AirQuality | undefined; t: Translator }> = React.memo(
    ({ air, t }) => {
        if (!air) return <p className="zenith-weather__note">{t('weather.air.none')}</p>;

        const hasAqi = air.europeanAqi !== null || air.usAqi !== null;
        const pollen = air.pollen;

        return (
            <div className="zenith-weather__airpanel">
                {hasAqi ? (
                    <div className="zenith-weather__aqis">
                        {air.europeanAqi !== null && (
                            <AqiMeter
                                label={t('weather.aqi.european')}
                                value={air.europeanAqi}
                                band={europeanAqiBand(air.europeanAqi)}
                                max={EU_AQI_MAX}
                                t={t}
                            />
                        )}
                        {air.usAqi !== null && (
                            <AqiMeter
                                label={t('weather.aqi.us')}
                                value={air.usAqi}
                                band={usAqiBand(air.usAqi)}
                                max={300}
                                t={t}
                            />
                        )}
                    </div>
                ) : (
                    <p className="zenith-weather__note">{t('weather.air.noCoverage')}</p>
                )}

                <div className="zenith-weather__pollutants">
                    <Pollutant label="PM2.5" value={air.pm2_5} />
                    <Pollutant label="PM10" value={air.pm10} />
                    <Pollutant label="O₃" value={air.ozone} />
                    <Pollutant label="NO₂" value={air.nitrogenDioxide} />
                    <Pollutant label="SO₂" value={air.sulphurDioxide} />
                    <Pollutant label="CO" value={air.carbonMonoxide} />
                </div>

                {pollen && (
                    <div className="zenith-weather__pollen">
                        <span className="zenith-weather__section-title">
                            <Flower2 size={13} /> {t('weather.pollen')}
                        </span>
                        <div className="zenith-weather__pollen-grid">
                            {SPECIES.map((key) => {
                                const grains = pollen[key];
                                if (grains === null) return null;
                                return (
                                    <div
                                        key={key}
                                        className={`zenith-weather__pollen-item is-${pollenBand(grains)}`}
                                    >
                                        <span>{t(`weather.pollen.${key}`)}</span>
                                        <b>{Math.round(grains)}</b>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <p className="zenith-weather__note">
                    <Wind size={11} /> {t('weather.air.source')}
                </p>
            </div>
        );
    }
);
AirPanel.displayName = 'AirPanel';
