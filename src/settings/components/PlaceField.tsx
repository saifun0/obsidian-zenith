import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, X } from 'lucide-react';
import { useZenithStore } from '../../store';
import { resolveLocale, useTranslation } from '../../core/i18n';
import { devicePosition, placeLabel, reverseGeocode, searchPlaces } from '../../services/geocode';
import type { GeoPlace } from '../../services/geocode';
import type { ZenithSettings } from '../../store/settingsSlice';

/** Let the typing settle before spending a request on it. */
const DEBOUNCE_MS = 400;

type Status = 'idle' | 'searching' | 'locating' | 'empty' | 'denied';

/** Settings keys that hold a place, so the factory can't be pointed at a number. */
type PlaceKey = {
    [K in keyof ZenithSettings]: ZenithSettings[K] extends GeoPlace | null ? K : never;
}[keyof ZenithSettings];

export interface PlaceFieldConfig {
    /** Which setting this picker writes. */
    settingsKey: PlaceKey;
    labelKey: string;
    descKey: string;
    /**
     * Written alongside the place. The weather module clears its legacy
     * free-text city here, so choosing a place can't be undone by the one-time
     * migration that re-resolves it.
     */
    extraPatch?: Partial<ZenithSettings>;
    /**
     * This picker is a module's override of the plugin-wide location, so an
     * empty value means "the global one" rather than "work it out". Saying
     * which place that actually is matters: an override left empty is the
     * normal state, and a row reading "Automatic" under a city set two screens
     * away describes nothing.
     */
    inheritsGlobal?: boolean;
}

/**
 * A city picker bound to one setting.
 *
 * This replaces a free-text city box that fed a `count=1` geocode: whatever the
 * provider ranked first won, silently, with no way to tell one Stavropol from
 * another — and no way at all to type a name in Russian, since the lookup was
 * pinned to English. Here the candidates are shown and the user picks, and the
 * choice is stored as coordinates so it can never be re-resolved differently.
 *
 * A factory rather than a component because `CustomField.render` takes no
 * configuration of its own: the key has to be baked in at schema-definition
 * time, which is also where it can still be typechecked against `ZenithSettings`.
 */
export function createPlaceField(config: PlaceFieldConfig): React.FC {
    const PlaceField: React.FC = () => {
        const t = useTranslation();
        const place = useZenithStore((s) => s.settings[config.settingsKey]) as GeoPlace | null;
        const global = useZenithStore((s) => s.settings.location);
        const language = useZenithStore((s) => s.settings.language);
        const updateSettings = useZenithStore((s) => s.updateSettings);
        const lang = resolveLocale(language);

        /** The place this picker falls back to when it holds nothing itself. */
        const inherited = config.inheritsGlobal ? global : null;

        const [query, setQuery] = useState('');
        const [hits, setHits] = useState<GeoPlace[]>([]);
        const [status, setStatus] = useState<Status>('idle');
        /** Guards against an earlier search resolving after a later one. */
        const generation = useRef(0);

        useEffect(() => {
            const term = query.trim();
            if (term.length < 2) {
                setHits([]);
                setStatus('idle');
                return;
            }
            const mine = ++generation.current;
            setStatus('searching');
            const timer = window.setTimeout(() => {
                void searchPlaces(term, lang).then((results) => {
                    if (generation.current !== mine) return;
                    setHits(results);
                    setStatus(results.length ? 'idle' : 'empty');
                });
            }, DEBOUNCE_MS);
            return () => window.clearTimeout(timer);
        }, [query, lang]);

        const clearKey = config.inheritsGlobal
            ? 'settings.place.useGlobal'
            : 'settings.place.clear';

        const choose = (next: GeoPlace | null) => {
            updateSettings({ [config.settingsKey]: next, ...config.extraPatch } as Partial<ZenithSettings>);
            setQuery('');
            setHits([]);
            setStatus('idle');
        };

        const detect = async () => {
            const mine = ++generation.current;
            setStatus('locating');
            const fix = await devicePosition();
            if (generation.current !== mine) return;
            if (!fix) {
                setStatus('denied');
                return;
            }
            const named = await reverseGeocode(fix.lat, fix.lon, lang);
            if (generation.current !== mine) return;
            choose({ lat: fix.lat, lon: fix.lon, name: t('settings.place.here'), ...named });
        };

        return (
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t(config.labelKey)}</span>
                    <span className="zenith-settings__item-desc">{t(config.descKey)}</span>
                </div>

                <div className="zenith-wplace__current">
                    <MapPin size={13} />
                    <span className="zenith-wplace__name">
                        {place
                            ? placeLabel(place)
                            : inherited
                              ? placeLabel(inherited)
                              : t('settings.place.auto')}
                    </span>
                    {!place && inherited && (
                        <span className="zenith-wplace__from">{t('settings.place.fromGlobal')}</span>
                    )}
                    {place && (
                        <button
                            className="zenith-settings__inline-btn"
                            onClick={() => choose(null)}
                            aria-label={t(clearKey)}
                            title={t(clearKey)}
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={query}
                        placeholder={t('settings.place.search')}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button
                        className="zenith-settings__inline-btn"
                        onClick={() => void detect()}
                        disabled={status === 'locating'}
                    >
                        <Crosshair size={13} />
                        {t('settings.place.detect')}
                    </button>
                </div>

                {hits.length > 0 && (
                    <ul className="zenith-wplace__hits">
                        {hits.map((hit) => (
                            <li key={`${hit.lat},${hit.lon}`}>
                                <button className="zenith-wplace__hit" onClick={() => choose(hit)}>
                                    <span className="zenith-wplace__hit-name">{hit.name}</span>
                                    <span className="zenith-wplace__hit-where">
                                        {[hit.admin1, hit.country].filter(Boolean).join(', ')}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {status === 'searching' && (
                    <div className="zenith-settings__hint">{t('settings.place.searching')}</div>
                )}
                {status === 'empty' && (
                    <div className="zenith-settings__hint">{t('settings.place.none')}</div>
                )}
                {status === 'locating' && (
                    <div className="zenith-settings__hint">{t('settings.place.locating')}</div>
                )}
                {status === 'denied' && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        {t('settings.place.denied')}
                    </div>
                )}
            </div>
        );
    };

    PlaceField.displayName = `PlaceField(${config.settingsKey})`;
    return PlaceField;
}
