import React, { useState } from 'react';
import { MapPin, Crosshair } from 'lucide-react';
import { useZenithStore } from '../../../store';
import { resolveLocale, useTranslation } from '../../../core/i18n';
import { devicePosition, reverseGeocode } from '../../../services/geocode';

/**
 * What the widget shows before it knows where you are.
 *
 * Prayer times are wrong — not approximate, wrong — without coordinates, so
 * this asks rather than guessing. The device button is offered because it is
 * one tap and needs no typing; the settings page is where the city search
 * lives, and the answer is stored so this is a one-time interruption.
 */
export const PrayerNoPlace: React.FC = () => {
    const t = useTranslation();
    const language = useZenithStore((s) => s.settings.language);
    const updateSettings = useZenithStore((s) => s.updateSettings);
    const [status, setStatus] = useState<'idle' | 'locating' | 'denied'>('idle');

    const detect = async () => {
        setStatus('locating');
        const fix = await devicePosition();
        if (!fix) {
            setStatus('denied');
            return;
        }
        const named = await reverseGeocode(fix.lat, fix.lon, resolveLocale(language));
        updateSettings({
            prayerPlace: { lat: fix.lat, lon: fix.lon, name: t('settings.place.here'), ...named },
        });
        setStatus('idle');
    };

    return (
        <div className="zenith-prayer__empty">
            <MapPin size={20} />
            <p className="zenith-prayer__empty-title">{t('prayer.noPlace')}</p>
            <p className="zenith-prayer__empty-hint">{t('prayer.noPlaceHint')}</p>
            <button
                type="button"
                className="zenith-prayer__cta"
                onClick={() => void detect()}
                disabled={status === 'locating'}
            >
                <Crosshair size={14} />
                {status === 'locating' ? t('prayer.locating') : t('prayer.useDevice')}
            </button>
            {status === 'denied' && (
                <p className="zenith-prayer__empty-hint is-warn">{t('prayer.denied')}</p>
            )}
        </div>
    );
};
